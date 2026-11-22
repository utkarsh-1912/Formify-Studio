import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { collectSchemaIssues } from "../../src/utils/formifySchema";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { requireRole, signToken, type Claims, type Role } from "./auth.js";
import { clientIp, createRateLimiter } from "./ratelimit.js";
import { csvCell, validateSubmission } from "./validate.js";
import { assertSafeWebhookUrl, enqueueDeliveries, type WebhookPolicy } from "./webhooks.js";
import { purgeExpired } from "./retention.js";
import { randomBytes } from "node:crypto";

type Env = { Variables: { claims: Claims } };

const MAX_BODY_BYTES = 64 * 1024;
const DAY = 86400;
const ID_RE = /^[a-zA-Z0-9_-]{3,64}$/;

const sha = (s: string) => createHash("sha256").update(s).digest();
const safeEqual = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));

export interface AppDeps {
  config: Config;
  db: DB;
  webhookPolicy?: WebhookPolicy;
  now?: () => number;
}

/** Parse a JSON body with a hard size cap. Returns undefined when invalid/oversized. */
async function readJson(c: any): Promise<unknown | undefined> {
  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return undefined;
  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApp({ config, db, webhookPolicy, now = Date.now }: AppDeps) {
  const app = new Hono<Env>();
  const policy: WebhookPolicy = webhookPolicy ?? {
    allowPrivate: config.allowPrivateWebhooks,
    allowHttp: config.allowHttpWebhooks
  };
  const ip = (c: any) => clientIp(c, config.trustProxy);

  app.use(
    "/api/*",
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowHeaders: ["authorization", "content-type", "x-admin-key"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    })
  );
  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "no-store");
  });

  // Global per-IP limiter plus a much stricter one for public submissions.
  app.use("/api/*", createRateLimiter({ windowMs: 60_000, max: 300, key: (c) => `g:${ip(c)}` }));
  const submitLimiter = createRateLimiter({
    windowMs: 60_000,
    max: 10,
    key: (c) => `s:${ip(c)}:${c.req.param("id")}`
  });
  const createLimiter = createRateLimiter({ windowMs: 60_000, max: 10, key: (c) => `c:${ip(c)}` });

  app.get("/health", (c) => c.json({ ok: true }));

  // ---- Workspaces -------------------------------------------------------------------------
  app.post("/api/workspaces", createLimiter, async (c) => {
    if (!config.openSignup) {
      const key = c.req.header("x-admin-key") ?? "";
      if (!config.adminApiKey || !safeEqual(key, config.adminApiKey)) {
        return c.json({ error: "Workspace creation requires an admin key" }, 401);
      }
    }
    const body = (await readJson(c)) as { id?: string; name?: string } | undefined;
    if (!body || typeof body.name !== "string" || body.name.trim() === "" || body.name.length > 100) {
      return c.json({ error: "name (1-100 chars) is required" }, 400);
    }
    const id = body.id ?? randomBytes(9).toString("base64url");
    if (!ID_RE.test(id)) return c.json({ error: "id must be 3-64 chars of [a-zA-Z0-9_-]" }, 400);
    if (db.prepare("SELECT 1 FROM workspaces WHERE id = ?").get(id)) return c.json({ error: "Workspace id already exists" }, 409);

    db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(id, body.name.trim(), now());
    const { token, jti } = await signToken(config.jwtSecret, id, "owner", 90 * DAY);
    return c.json({ workspace: { id, name: body.name.trim() }, ownerToken: token, tokenId: jti }, 201);
  });

  app.get("/api/workspaces/:id", requireRole(config.jwtSecret, db, "viewer"), (c) => {
    const w = db
      .prepare("SELECT id, name, schema_json, retention_days, public_submissions, created_at FROM workspaces WHERE id = ?")
      .get(c.req.param("id")) as any;
    if (!w) return c.json({ error: "Not found" }, 404);
    return c.json({
      id: w.id,
      name: w.name,
      schema: w.schema_json ? JSON.parse(w.schema_json) : null,
      retentionDays: w.retention_days,
      publicSubmissions: !!w.public_submissions,
      createdAt: w.created_at,
      role: c.get("claims").role
    });
  });

  app.put("/api/workspaces/:id/schema", requireRole(config.jwtSecret, db, "editor"), async (c) => {
    const schema = await readJson(c);
    if (schema === undefined) return c.json({ error: "Invalid or oversized JSON body" }, 400);
    const issues = collectSchemaIssues(schema);
    if (issues.length > 0) return c.json({ error: "Schema failed validation", issues }, 422);
    db.prepare("UPDATE workspaces SET schema_json = ? WHERE id = ?").run(JSON.stringify(schema), c.req.param("id"));
    return c.json({ ok: true });
  });

  app.put("/api/workspaces/:id/settings", requireRole(config.jwtSecret, db, "owner"), async (c) => {
    const body = (await readJson(c)) as { retentionDays?: number | null; publicSubmissions?: boolean } | undefined;
    if (!body) return c.json({ error: "Invalid JSON body" }, 400);
    const id = c.req.param("id");
    if (body.retentionDays !== undefined) {
      const d = body.retentionDays;
      if (d !== null && (!Number.isInteger(d) || d < 1 || d > 3650)) {
        return c.json({ error: "retentionDays must be null or an integer 1-3650" }, 400);
      }
      db.prepare("UPDATE workspaces SET retention_days = ? WHERE id = ?").run(d, id);
    }
    if (body.publicSubmissions !== undefined) {
      db.prepare("UPDATE workspaces SET public_submissions = ? WHERE id = ?").run(body.publicSubmissions ? 1 : 0, id);
    }
    return c.json({ ok: true });
  });

  app.delete("/api/workspaces/:id", requireRole(config.jwtSecret, db, "owner"), (c) => {
    db.prepare("DELETE FROM workspaces WHERE id = ?").run(c.req.param("id")); // cascades
    return c.json({ ok: true });
  });

  // ---- Tokens -----------------------------------------------------------------------------
  app.post("/api/workspaces/:id/tokens", requireRole(config.jwtSecret, db, "owner"), async (c) => {
    const body = (await readJson(c)) as { role?: Role; ttlSeconds?: number } | undefined;
    if (!body || (body.role !== "editor" && body.role !== "viewer")) {
      return c.json({ error: "role must be 'editor' or 'viewer'" }, 400);
    }
    const ttl = body.ttlSeconds ?? 7 * DAY;
    if (!Number.isInteger(ttl) || ttl < 60 || ttl > 30 * DAY) {
      return c.json({ error: "ttlSeconds must be 60..2592000" }, 400);
    }
    const { token, jti, expiresAt } = await signToken(config.jwtSecret, c.req.param("id")!, body.role, ttl);
    return c.json({ token, tokenId: jti, role: body.role, expiresAt }, 201);
  });

  app.delete("/api/workspaces/:id/tokens/:jti", requireRole(config.jwtSecret, db, "owner"), (c) => {
    db.prepare("INSERT OR IGNORE INTO revoked_tokens (jti, revoked_at) VALUES (?, ?)").run(c.req.param("jti"), now());
    return c.json({ ok: true });
  });

  // ---- Submissions ------------------------------------------------------------------------
  // Public by default (respondents have no account). Owners can switch to token-only.
  app.post("/api/workspaces/:id/submissions", submitLimiter, async (c) => {
    const id = c.req.param("id")!;
    const w = db.prepare("SELECT schema_json, public_submissions FROM workspaces WHERE id = ?").get(id) as any;
    // Same response for "missing" and "closed" avoids leaking which workspace ids exist.
    if (!w || !w.schema_json) return c.json({ error: "Workspace not accepting submissions" }, 404);
    if (!w.public_submissions) {
      const gate = requireRole(config.jwtSecret, db, "viewer");
      let denied: Response | undefined;
      await gate(c, async () => {}).then((r) => (denied = r as Response | undefined));
      if (denied) return denied;
    }

    const body = await readJson(c);
    if (body === undefined) return c.json({ error: "Invalid or oversized JSON body" }, 400);
    const result = validateSubmission(JSON.parse(w.schema_json), body);
    if (!result.ok) return c.json({ error: "Validation failed", fields: result.errors }, 422);

    const subId = randomUUID();
    const createdAt = now();
    db.prepare("INSERT INTO submissions (id, workspace_id, data_json, created_at) VALUES (?, ?, ?, ?)").run(
      subId,
      id,
      JSON.stringify(result.data),
      createdAt
    );
    enqueueDeliveries(db, id, { id: subId, data: result.data, createdAt });
    return c.json({ id: subId }, 201);
  });

  app.get("/api/workspaces/:id/submissions", requireRole(config.jwtSecret, db, "editor"), (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 500);
    const before = Number(c.req.query("before") ?? Number.MAX_SAFE_INTEGER);
    const rows = db
      .prepare("SELECT id, data_json, created_at FROM submissions WHERE workspace_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?")
      .all(c.req.param("id"), before, limit) as any[];
    return c.json({
      items: rows.map((r) => ({ id: r.id, createdAt: r.created_at, data: JSON.parse(r.data_json) })),
      nextBefore: rows.length === limit ? rows[rows.length - 1].created_at : null
    });
  });

  app.get("/api/workspaces/:id/submissions/export", requireRole(config.jwtSecret, db, "editor"), (c) => {
    const id = c.req.param("id")!;
    const rows = db
      .prepare("SELECT id, data_json, created_at FROM submissions WHERE workspace_id = ? ORDER BY created_at")
      .all(id) as any[];
    const items = rows.map((r) => ({ id: r.id, createdAt: r.created_at, ...JSON.parse(r.data_json) }));
    if (c.req.query("format") === "csv") {
      const cols = Array.from(new Set(items.flatMap((i) => Object.keys(i))));
      const csv = [cols.join(","), ...items.map((i) => cols.map((k) => csvCell((i as any)[k])).join(","))].join("\r\n");
      return c.body(csv, 200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="submissions-${id}.csv"`
      });
    }
    return c.json({ items });
  });

  app.delete("/api/workspaces/:id/submissions/:sid", requireRole(config.jwtSecret, db, "owner"), (c) => {
    const r = db.prepare("DELETE FROM submissions WHERE id = ? AND workspace_id = ?").run(c.req.param("sid"), c.req.param("id"));
    return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
  });

  // ---- Webhooks ---------------------------------------------------------------------------
  app.post("/api/workspaces/:id/webhooks", requireRole(config.jwtSecret, db, "owner"), async (c) => {
    const body = (await readJson(c)) as { url?: string } | undefined;
    if (!body || typeof body.url !== "string") return c.json({ error: "url is required" }, 400);
    try {
      await assertSafeWebhookUrl(body.url, policy);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
    const count = (db.prepare("SELECT COUNT(*) n FROM webhooks WHERE workspace_id = ?").get(c.req.param("id")) as any).n;
    if (count >= 10) return c.json({ error: "Webhook limit (10) reached" }, 400);
    const id = randomUUID();
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    db.prepare("INSERT INTO webhooks (id, workspace_id, url, secret, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      c.req.param("id"),
      body.url,
      secret,
      now()
    );
    // The secret is only ever returned here; store it on the receiver to verify signatures.
    return c.json({ id, url: body.url, secret }, 201);
  });

  app.get("/api/workspaces/:id/webhooks", requireRole(config.jwtSecret, db, "owner"), (c) => {
    const rows = db.prepare("SELECT id, url, active, created_at FROM webhooks WHERE workspace_id = ?").all(c.req.param("id")) as any[];
    return c.json({ items: rows.map((r) => ({ id: r.id, url: r.url, active: !!r.active, createdAt: r.created_at })) });
  });

  app.delete("/api/workspaces/:id/webhooks/:wid", requireRole(config.jwtSecret, db, "owner"), (c) => {
    const r = db.prepare("DELETE FROM webhooks WHERE id = ? AND workspace_id = ?").run(c.req.param("wid"), c.req.param("id"));
    return r.changes ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/admin/purge", async (c) => {
    const key = c.req.header("x-admin-key") ?? "";
    if (!config.adminApiKey || !safeEqual(key, config.adminApiKey)) return c.json({ error: "Unauthorized" }, 401);
    return c.json(purgeExpired(db, now()));
  });

  app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
