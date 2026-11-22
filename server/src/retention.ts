import type { DB } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete submissions older than each workspace's retention window, plus finished delivery
 * records older than 30 days. Workspaces with retention_days = NULL keep data forever.
 * Deletion is permanent (no soft-delete) — that is the point of a retention policy.
 */
export function purgeExpired(db: DB, now = Date.now()): { submissions: number; deliveries: number } {
  const subs = db
    .prepare(
      `DELETE FROM submissions WHERE id IN (
         SELECT s.id FROM submissions s JOIN workspaces w ON w.id = s.workspace_id
         WHERE w.retention_days IS NOT NULL AND s.created_at < ? - w.retention_days * ?
       )`
    )
    .run(now, DAY_MS);
  const dels = db
    .prepare("DELETE FROM deliveries WHERE status IN ('ok','failed') AND created_at < ?")
    .run(now - 30 * DAY_MS);
  // Revocation entries only matter until the token would have expired anyway (max ttl 400d).
  db.prepare("DELETE FROM revoked_tokens WHERE revoked_at < ?").run(now - 400 * DAY_MS);
  return { submissions: subs.changes, deliveries: dels.changes };
}
