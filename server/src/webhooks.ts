import { createHmac, randomUUID } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { DB } from "./db.js";

export const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60 * 1000;

export const backoffMs = (attempts: number) => Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);

/** Signature header value: `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">`. */
export function signPayload(secret: string, body: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

const isPrivateIPv4 = (ip: string): boolean => {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || // link-local incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
};

export const isPrivateAddress = (ip: string): boolean => {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
};

export interface WebhookPolicy {
  allowPrivate: boolean;
  allowHttp: boolean;
  /** Test seam. */
  lookup?: (host: string) => Promise<string[]>;
}

/**
 * Reject URLs that could reach internal services (SSRF). Called at creation and again right
 * before each delivery. Residual risk: DNS rebinding between this check and the socket connect.
 * For hostile environments, route webhooks through an egress proxy that enforces the same rule.
 */
export async function assertSafeWebhookUrl(raw: string, policy: WebhookPolicy): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (url.username || url.password) throw new Error("Credentials in URL are not allowed.");
  if (url.protocol !== "https:" && !(policy.allowHttp && url.protocol === "http:")) {
    throw new Error("Webhook URL must use https.");
  }
  if (policy.allowPrivate) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host)
    ? [host]
    : await (policy.lookup ?? (async (h) => (await dns.lookup(h, { all: true })).map((a) => a.address)))(host);
  if (addrs.length === 0 || addrs.some(isPrivateAddress)) {
    throw new Error("Webhook URL resolves to a private or reserved address.");
  }
  return url;
}

export function enqueueDeliveries(db: DB, workspaceId: string, submission: { id: string; data: unknown; createdAt: number }, now = Date.now()) {
  const hooks = db.prepare("SELECT id FROM webhooks WHERE workspace_id = ? AND active = 1").all(workspaceId) as { id: string }[];
  const insert = db.prepare(
    "INSERT INTO deliveries (id, webhook_id, submission_id, payload, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)"
  );
  const payload = JSON.stringify({
    event: "submission.created",
    workspaceId,
    submission: { id: submission.id, createdAt: submission.createdAt, data: submission.data }
  });
  for (const h of hooks) insert.run(randomUUID(), h.id, submission.id, payload, now, now);
}

export interface DeliveryDeps {
  db: DB;
  policy: WebhookPolicy;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/** Attempt every due delivery once. Returns counts for observability/tests. */
export async function processDeliveries(deps: DeliveryDeps, limit = 25) {
  const { db, policy } = deps;
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetchImpl ?? fetch;
  const due = db
    .prepare(
      `SELECT d.id, d.payload, d.attempts, w.url, w.secret, w.active
       FROM deliveries d JOIN webhooks w ON w.id = d.webhook_id
       WHERE d.status = 'pending' AND d.next_attempt_at <= ? ORDER BY d.next_attempt_at LIMIT ?`
    )
    .all(now(), limit) as { id: string; payload: string; attempts: number; url: string; secret: string; active: number }[];

  const result = { ok: 0, retried: 0, failed: 0 };
  for (const d of due) {
    const attempts = d.attempts + 1;
    let error: string | null = null;
    try {
      if (!d.active) throw new Error("Webhook disabled");
      const url = await assertSafeWebhookUrl(d.url, policy);
      const ts = Math.floor(now() / 1000);
      const res = await doFetch(url.toString(), {
        method: "POST",
        redirect: "manual", // never follow redirects into internal hosts
        signal: AbortSignal.timeout(5000),
        headers: {
          "content-type": "application/json",
          "user-agent": "Formify-Webhook/1",
          "x-formify-delivery": d.id,
          "x-formify-signature": signPayload(d.secret, d.payload, ts)
        },
        body: d.payload
      });
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).message;
    }

    if (!error) {
      db.prepare("UPDATE deliveries SET status='ok', attempts=?, last_error=NULL WHERE id=?").run(attempts, d.id);
      result.ok++;
    } else if (attempts >= MAX_ATTEMPTS) {
      db.prepare("UPDATE deliveries SET status='failed', attempts=?, last_error=? WHERE id=?").run(attempts, error, d.id);
      result.failed++;
    } else {
      db.prepare("UPDATE deliveries SET attempts=?, last_error=?, next_attempt_at=? WHERE id=?").run(
        attempts,
        error,
        now() + backoffMs(attempts),
        d.id
      );
      result.retried++;
    }
  }
  return result;
}
