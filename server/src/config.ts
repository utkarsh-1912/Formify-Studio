export interface Config {
  port: number;
  databasePath: string;
  jwtSecret: string;
  adminApiKey: string;
  openSignup: boolean;
  trustProxy: boolean;
  allowedOrigins: string[];
  allowPrivateWebhooks: boolean;
  allowHttpWebhooks: boolean;
}

const bool = (v: string | undefined, d = false) => (v === undefined ? d : v === "true" || v === "1");

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters.");
  }
  const openSignup = bool(env.OPEN_SIGNUP);
  const adminApiKey = env.ADMIN_API_KEY ?? "";
  if (!openSignup && adminApiKey.length < 16) {
    throw new Error("Set ADMIN_API_KEY (>= 16 chars) or OPEN_SIGNUP=true.");
  }
  return {
    port: Number(env.PORT ?? 8787),
    databasePath: env.DATABASE_PATH ?? "./data/formify.db",
    jwtSecret,
    adminApiKey,
    openSignup,
    trustProxy: bool(env.TRUST_PROXY),
    allowedOrigins: (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    allowPrivateWebhooks: bool(env.ALLOW_PRIVATE_WEBHOOKS),
    allowHttpWebhooks: bool(env.ALLOW_HTTP_WEBHOOKS)
  };
}
