import "server-only";

/**
 * Per-client sliding-window limiter. Express's own limiter keys on req.ip, which
 * behind this proxy is always the CRB server, so one visitor could exhaust the
 * budget for everyone. This restores per-visitor limiting in front of it.
 *
 * In-memory: effective per server instance. For multi-instance production use a
 * shared store (e.g. Redis/Upstash) with the same interface.
 */
const hits = new Map<string, number[]>();

export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip") || "unknown";
}

export function allow(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}
