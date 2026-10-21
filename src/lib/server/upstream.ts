import "server-only";
import { backendOrigin, isProd } from "./config";
import type { Loaded } from "./microcache";

const UPSTREAM_TIMEOUT_MS = 30_000;

/** One validated upstream read for a public GET (used by the cache). Never leaks backend internals. */
export async function loadPublic(target: string, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<Loaded> {
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, status: 502, error: isProd ? "Service temporarily unavailable" : `Backend unreachable at ${backendOrigin()} — is the Express server running?` };
  }
  if (upstream.status >= 300 && upstream.status < 400) return { ok: false, status: 502, error: "Unexpected upstream response" };
  if (upstream.status >= 500) return { ok: false, status: upstream.status === 504 ? 504 : 502, error: "Something went wrong. Please try again." };
  if (!(upstream.headers.get("content-type") ?? "").includes("application/json")) return { ok: false, status: 502, error: "Unexpected upstream response" };
  const data = await upstream.json().catch(() => null);
  if (data === null) return { ok: false, status: 502, error: "Unexpected upstream response" };
  return { ok: true, status: upstream.status, data };
}
