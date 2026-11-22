import { describe, test, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { openDb, type DB } from "../src/db";
import type { Config } from "../src/config";
import { purgeExpired } from "../src/retention";
import { processDeliveries, signPayload, assertSafeWebhookUrl, isPrivateAddress, enqueueDeliveries } from "../src/webhooks";
import { validateSubmission, csvCell } from "../src/validate";

const SECRET = "x".repeat(48);
const ADMIN = "admin-key-0123456789";
const baseConfig: Config = {
  port: 0,
  databasePath: ":memory:",
  jwtSecret: SECRET,
  adminApiKey: ADMIN,
  openSignup: false,
  trustProxy: false,
  allowedOrigins: ["http://localhost:3000"],
  allowPrivateWebhooks: false,
  allowHttpWebhooks: false
};

const schema = {
  formTitle: "Survey",
  fields: [
    { id: "name", type: "text", label: "Name", required: true },
    { id: "email", type: "email", label: "Email" },
    { id: "size", type: "select", label: "Size", options: [{ value: "s", label: "S" }, { value: "l", label: "L" }] }
  ]
};

let db: DB;
let app: ReturnType<typeof createApp>;
let clock = 1_700_000_000_000;

const call = (method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  app.request(path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {})
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });

async function setup(config: Partial<Config> = {}) {
  db = openDb(":memory:");
  app = createApp({
    config: { ...baseConfig, ...config },
    db,
    now: () => clock,
    webhookPolicy: { allowPrivate: false, allowHttp: false, lookup: async () => ["93.184.216.34"] }
  });
  const res = await call("POST", "/api/workspaces", { headers: { "x-admin-key": ADMIN }, body: { id: "ws1", name: "Test" } });
  const { ownerToken } = await res.json();
  await call("PUT", "/api/workspaces/ws1/schema", { token: ownerToken, body: schema });
  return ownerToken as string;
}

const mint = async (owner: string, role: "editor" | "viewer") =>
  (await (await call("POST", "/api/workspaces/ws1/tokens", { token: owner, body: { role } })).json()) as { token: string; tokenId: string };

describe("auth & roles", () => {
  let owner: string;
  beforeEach(async () => {
    owner = await setup();
  });

  test("workspace creation needs the admin key", async () => {
    expect((await call("POST", "/api/workspaces", { body: { name: "x" } })).status).toBe(401);
    expect((await call("POST", "/api/workspaces", { headers: { "x-admin-key": "wrong-key-wrong-key" }, body: { name: "x" } })).status).toBe(401);
  });

  test("requests without or with bad tokens are rejected", async () => {
    expect((await call("GET", "/api/workspaces/ws1")).status).toBe(401);
    expect((await call("GET", "/api/workspaces/ws1", { token: "garbage" })).status).toBe(401);
  });

  test("forged tokens (wrong secret, alg none, other workspace) are rejected", async () => {
    const forged = await new SignJWT({ ws: "ws1", role: "owner" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("formify")
      .setJti("j")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(48)));
    expect((await call("GET", "/api/workspaces/ws1", { token: forged })).status).toBe(401);

    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"ws":"ws1","role":"owner","iss":"formify","jti":"j"}').toString("base64url")}.`;
    expect((await call("GET", "/api/workspaces/ws1", { token: none })).status).toBe(401);

    // Valid token for another workspace
    await call("POST", "/api/workspaces", { headers: { "x-admin-key": ADMIN }, body: { id: "ws2", name: "Other" } });
    expect((await call("GET", "/api/workspaces/ws2", { token: owner })).status).toBe(403);
  });

  test("viewer can read but not write; editor can write schema but not manage tokens", async () => {
    const viewer = (await mint(owner, "viewer")).token;
    const editor = (await mint(owner, "editor")).token;
    expect((await call("GET", "/api/workspaces/ws1", { token: viewer })).status).toBe(200);
    expect((await call("PUT", "/api/workspaces/ws1/schema", { token: viewer, body: schema })).status).toBe(403);
    expect((await call("PUT", "/api/workspaces/ws1/schema", { token: editor, body: schema })).status).toBe(200);
    expect((await call("POST", "/api/workspaces/ws1/tokens", { token: editor, body: { role: "viewer" } })).status).toBe(403);
    expect((await call("GET", "/api/workspaces/ws1/submissions", { token: viewer })).status).toBe(403);
  });

  test("revoked tokens stop working", async () => {
    const { token, tokenId } = await mint(owner, "editor");
    expect((await call("GET", "/api/workspaces/ws1", { token })).status).toBe(200);
    await call("DELETE", `/api/workspaces/ws1/tokens/${tokenId}`, { token: owner });
    expect((await call("GET", "/api/workspaces/ws1", { token })).status).toBe(401);
  });

  test("invalid schemas are rejected with issues", async () => {
    const res = await call("PUT", "/api/workspaces/ws1/schema", { token: owner, body: { formTitle: "x", fields: [{ id: "a", type: "bogus", label: "A" }] } });
    expect(res.status).toBe(422);
  });
});

describe("submissions", () => {
  let owner: string;
  beforeEach(async () => {
    owner = await setup();
  });

  test("public submit validates, stores, lists and exports (CSV injection-safe)", async () => {
    expect((await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "Ada", email: "a@b.co", size: "s" } })).status).toBe(201);
    expect((await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "=HYPERLINK(\"x\")", size: "l" } })).status).toBe(201);

    const list = await (await call("GET", "/api/workspaces/ws1/submissions", { token: owner })).json();
    expect(list.items).toHaveLength(2);

    const csv = await (await call("GET", "/api/workspaces/ws1/submissions/export?format=csv", { token: owner })).text();
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split("\r\n")[0]).toContain("name");
  });

  test("rejects missing required, bad email/option, unknown keys, oversize and non-JSON bodies", async () => {
    const post = (body: unknown) => call("POST", "/api/workspaces/ws1/submissions", { body });
    expect((await post({ email: "a@b.co" })).status).toBe(422);
    expect((await post({ name: "A", email: "nope" })).status).toBe(422);
    expect((await post({ name: "A", size: "xl" })).status).toBe(422);
    expect((await post({ name: "A", admin: true })).status).toBe(422);
    expect((await post({ name: "A".repeat(20_000) })).status).toBe(422); // field too long
    expect((await post({ name: "A".repeat(70_000) })).status).toBe(400); // body over the 64 KB cap
    const bad = await app.request("/api/workspaces/ws1/submissions", { method: "POST", body: "{nope" });
    expect(bad.status).toBe(400);
  });

  test("unknown workspace looks the same as closed", async () => {
    expect((await call("POST", "/api/workspaces/nope/submissions", { body: { name: "A" } })).status).toBe(404);
  });

  test("private workspaces require a token", async () => {
    await call("PUT", "/api/workspaces/ws1/settings", { token: owner, body: { publicSubmissions: false } });
    expect((await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "A" } })).status).toBe(401);
    const viewer = (await mint(owner, "viewer")).token;
    expect((await call("POST", "/api/workspaces/ws1/submissions", { token: viewer, body: { name: "A" } })).status).toBe(201);
  });

  test("rate limits public submissions per IP", async () => {
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "A" } })).status;
    expect(last).toBe(429);
  });
});

describe("webhooks", () => {
  let owner: string;
  beforeEach(async () => {
    owner = await setup();
  });

  test("creation blocks http and private targets, returns the secret once", async () => {
    expect((await call("POST", "/api/workspaces/ws1/webhooks", { token: owner, body: { url: "http://example.com/h" } })).status).toBe(400);
    expect((await call("POST", "/api/workspaces/ws1/webhooks", { token: owner, body: { url: "https://169.254.169.254/latest" } })).status).toBe(400);
    expect((await call("POST", "/api/workspaces/ws1/webhooks", { token: owner, body: { url: "https://127.0.0.1/x" } })).status).toBe(400);
    const ok = await call("POST", "/api/workspaces/ws1/webhooks", { token: owner, body: { url: "https://example.com/h" } });
    expect(ok.status).toBe(201);
    expect((await ok.json()).secret).toMatch(/^whsec_/);
    const list = await (await call("GET", "/api/workspaces/ws1/webhooks", { token: owner })).json();
    expect(JSON.stringify(list)).not.toContain("whsec_");
  });

  test("delivers signed payloads, retries with backoff, then gives up", async () => {
    const hook = await (await call("POST", "/api/workspaces/ws1/webhooks", { token: owner, body: { url: "https://example.com/h" } })).json();
    await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "Ada" } });

    const calls: { headers: Record<string, string>; body: string }[] = [];
    let status = 500;
    const fetchImpl = (async (_u: string, init: any) => {
      calls.push({ headers: init.headers, body: init.body });
      return new Response("", { status });
    }) as unknown as typeof fetch;
    const deps = { db, policy: { allowPrivate: false, allowHttp: false, lookup: async () => ["93.184.216.34"] }, fetchImpl, now: () => clock };

    expect(await processDeliveries(deps)).toEqual({ ok: 0, retried: 1, failed: 0 });
    // Not due again until backoff elapses.
    expect(await processDeliveries(deps)).toEqual({ ok: 0, retried: 0, failed: 0 });

    // Signature verifies with the shared secret.
    const sig = calls[0].headers["x-formify-signature"];
    const t = Number(/t=(\d+)/.exec(sig)![1]);
    expect(sig).toBe(signPayload(hook.secret, calls[0].body, t));
    expect(JSON.parse(calls[0].body).submission.data.name).toBe("Ada");

    status = 200;
    clock += 60_000;
    expect(await processDeliveries(deps)).toEqual({ ok: 1, retried: 0, failed: 0 });
  });

  test("gives up after max attempts", async () => {
    await call("POST", "/api/workspaces/ws1/webhooks", { token: owner, body: { url: "https://example.com/h" } });
    await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "Ada" } });
    const fetchImpl = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const deps = { db, policy: { allowPrivate: false, allowHttp: false, lookup: async () => ["93.184.216.34"] }, fetchImpl, now: () => clock };
    let failed = 0;
    for (let i = 0; i < 8; i++) {
      clock += 2 * 60 * 60 * 1000;
      failed += (await processDeliveries(deps)).failed;
    }
    expect(failed).toBe(1);
  });

  test("SSRF helpers", async () => {
    expect(isPrivateAddress("10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    await expect(assertSafeWebhookUrl("https://evil.test/", { allowPrivate: false, allowHttp: false, lookup: async () => ["10.0.0.5"] })).rejects.toThrow(/private/);
    await expect(assertSafeWebhookUrl("https://u:p@example.com/", { allowPrivate: false, allowHttp: false, lookup: async () => ["8.8.8.8"] })).rejects.toThrow(/Credentials/);
  });
});

describe("retention", () => {
  test("purges only submissions older than the workspace window", async () => {
    const owner = await setup();
    await call("PUT", "/api/workspaces/ws1/settings", { token: owner, body: { retentionDays: 30 } });
    await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "old" } });
    clock += 40 * 86_400_000;
    await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "new" } });
    expect(purgeExpired(db, clock).submissions).toBe(1);
    const list = await (await call("GET", "/api/workspaces/ws1/submissions", { token: owner })).json();
    expect(list.items.map((i: any) => i.data.name)).toEqual(["new"]);
  });

  test("null retention keeps everything; invalid values rejected", async () => {
    const owner = await setup();
    await call("POST", "/api/workspaces/ws1/submissions", { body: { name: "keep" } });
    clock += 5000 * 86_400_000;
    expect(purgeExpired(db, clock).submissions).toBe(0);
    expect((await call("PUT", "/api/workspaces/ws1/settings", { token: owner, body: { retentionDays: 0 } })).status).toBe(400);
  });
});

describe("validators", () => {
  test("validateSubmission handles checkbox, number, date and pattern", () => {
    const s = {
      fields: [
        { id: "ok", type: "checkbox", label: "OK", required: true },
        { id: "n", type: "number", label: "N" },
        { id: "d", type: "date", label: "D" },
        { id: "p", type: "text", label: "P", validation: { pattern: "^[A-Z]+$", message: "caps" } }
      ]
    };
    expect(validateSubmission(s, { ok: true, n: "3", d: "2024-02-29", p: "ABC" }).ok).toBe(true);
    const bad = validateSubmission(s, { ok: false, n: "x", d: "2024-13-40", p: "abc" });
    expect(Object.keys(bad.errors).sort()).toEqual(["d", "n", "ok", "p"]);
  });

  test("csvCell escapes quotes and formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("+1")).toBe("'+1");
  });
});
