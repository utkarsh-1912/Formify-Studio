import type { Context, MiddlewareHandler } from "hono";

/** In-memory fixed-window limiter. Per-process only: use a shared store if you run multiple replicas. */
export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  key: (c: Context) => string;
  now?: () => number;
}): MiddlewareHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  const now = opts.now ?? Date.now;
  let lastSweep = now();

  return async (c, next) => {
    const t = now();
    if (t - lastSweep > opts.windowMs) {
      for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
      lastSweep = t;
    }
    const key = opts.key(c);
    let entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      entry = { count: 0, reset: t + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    c.header("X-RateLimit-Limit", String(opts.max));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.max - entry.count)));
    if (entry.count > opts.max) {
      c.header("Retry-After", String(Math.ceil((entry.reset - t) / 1000)));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }
    await next();
  };
}

export function clientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}
