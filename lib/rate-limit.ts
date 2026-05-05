// ─── In-memory sliding-window rate limiter ───────────────────────────────────
// Keyed by arbitrary string (e.g. "generate:1.2.3.4").
// Resets on cold start — acceptable for a demo; swap for Redis/KV in production.

const store = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * @param key      Unique identifier for this caller + action (e.g. "generate:ip")
 * @param limit    Max requests allowed in the window
 * @param windowMs Rolling window size in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Evict timestamps outside the window
  const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= limit) {
    const resetInMs = timestamps[0] + windowMs - now;
    return { allowed: false, remaining: 0, resetInMs };
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return { allowed: true, remaining: limit - timestamps.length, resetInMs: 0 };
}

/** Extract best-effort client IP from Next.js request headers */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
