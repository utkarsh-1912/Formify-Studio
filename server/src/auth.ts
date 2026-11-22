import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { DB } from "./db.js";

export type Role = "owner" | "editor" | "viewer";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };
const ISSUER = "formify";

export interface Claims {
  ws: string;
  role: Role;
  jti: string;
}

export const roleAtLeast = (have: Role, need: Role) => RANK[have] >= RANK[need];

export async function signToken(
  secret: string,
  ws: string,
  role: Role,
  ttlSeconds: number
): Promise<{ token: string; jti: string; expiresAt: number }> {
  const jti = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ ws, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
  return { token, jti, expiresAt };
}

/** Returns claims or null. Pins the algorithm (no `alg: none` / key confusion) and checks revocation. */
export async function verifyToken(secret: string, db: DB, token: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER
    });
    const { ws, role } = payload as { ws?: unknown; role?: unknown };
    if (typeof ws !== "string" || typeof payload.jti !== "string") return null;
    if (role !== "owner" && role !== "editor" && role !== "viewer") return null;
    if (db.prepare("SELECT 1 FROM revoked_tokens WHERE jti = ?").get(payload.jti)) return null;
    return { ws, role, jti: payload.jti };
  } catch {
    return null;
  }
}

export const bearer = (header: string | undefined | null): string | null => {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
};

/** Requires a valid token for the workspace in `:id` with at least `min` role. */
export function requireRole(secret: string, db: DB, min: Role): MiddlewareHandler {
  return async (c, next) => {
    const token = bearer(c.req.header("authorization"));
    if (!token) return c.json({ error: "Missing bearer token" }, 401);
    const claims = await verifyToken(secret, db, token);
    if (!claims) return c.json({ error: "Invalid or expired token" }, 401);
    if (claims.ws !== c.req.param("id")) return c.json({ error: "Token not valid for this workspace" }, 403);
    if (!roleAtLeast(claims.role, min)) return c.json({ error: "Insufficient role" }, 403);
    c.set("claims", claims);
    await next();
  };
}
