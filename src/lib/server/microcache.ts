import "server-only";

/**
 * Tiny in-memory stale-while-revalidate cache for PUBLIC market-data GETs.
 *
 * Why: the first (cold) call to several backend endpoints takes 3-5 s while it
 * pulls from NSE / Yahoo. The first visitor warms this cache; everyone after gets
 * the answer instantly, and expired entries are refreshed in the background so
 * nobody waits twice. Concurrent identical requests share one upstream call.
 *
 * Never used for authenticated or per-user routes. Per-instance memory; on a
 * multi-instance deploy put a shared cache (Redis/Upstash) behind the same API.
 */
export type Loaded =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

type Entry = { value: Extract<Loaded, { ok: true }>; at: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<Loaded>>();
const MAX_ENTRIES = 300;
const STALE_FACTOR = 3; // serve stale up to ttl * 3 while refreshing (live quotes stay <= ~90 s old)

function load(key: string, loader: () => Promise<Loaded>): Promise<Loaded> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = loader()
    .then((r) => {
      if (r.ok && r.status === 200) {
        if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
        store.set(key, { value: r, at: Date.now() });
      }
      return r;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export async function cachedGet(key: string, ttlSec: number, loader: () => Promise<Loaded>): Promise<Loaded & { cache?: "HIT" | "STALE" | "MISS" }> {
  const hit = store.get(key);
  const age = hit ? (Date.now() - hit.at) / 1000 : Infinity;

  if (hit && age < ttlSec) return { ...hit.value, cache: "HIT" };
  if (hit && age < ttlSec * STALE_FACTOR) {
    void load(key, loader); // refresh in the background
    return { ...hit.value, cache: "STALE" };
  }
  const fresh = await load(key, loader);
  // If the refresh failed but we still hold an old value, prefer it over an error.
  if (!fresh.ok && hit) return { ...hit.value, cache: "STALE" };
  return { ...fresh, cache: "MISS" };
}
