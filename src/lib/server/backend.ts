import "server-only";
import { matchRule } from "./allowlist";
import { backendOrigin } from "./config";

/**
 * Server-side reads for pages that render data into HTML (SEO). Goes through the
 * same allowlist as the browser proxy: only public GET rules, never auth'd ones.
 * Throws on any failure so callers decide whether to fall back (and failures are not cached).
 */
export async function backendGet<T>(path: string, query?: Record<string, string | number>): Promise<T> {
  const rule = matchRule("GET", path);
  if (!rule || rule.auth || rule.auth0Session) throw new Error(`Endpoint not allowed: ${path}`);

  const allowed = new Set(rule.query ?? []);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (!allowed.has(k)) throw new Error(`Query key not allowed: ${k}`);
    qs.set(k, String(v));
  }
  const res = await fetch(`${backendOrigin()}/api${path}${qs.size ? `?${qs}` : ""}`, {
    headers: { Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("application/json")) {
    throw new Error(`Upstream ${res.status}`);
  }
  return (await res.json()) as T;
}
