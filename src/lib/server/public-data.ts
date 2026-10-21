import "server-only";
import { cacheLife } from "next/cache";
import type { DataKey, DataParams } from "@/lib/data-keys";
import { matchRule } from "./allowlist";
import { backendGet } from "./backend";

/** Backend path behind each public data key. Every path must also match a public GET rule in allowlist.ts. */
export const PATHS: Record<DataKey, string> = {
  reports: "/reports/recent",
  sevenDay: "/technical/7day-chart",
  flows: "/fii-dii-flows",
  intraday: "/intraday-charts",
  world: "/global-indices",
  liveMarkets: "/news/live-markets",
  us: "/us-market/dashboard",
  crypto: "/crypto/dashboard",
  nseHeat: "/nse/heatmap",
  nseGainers: "/nse/gainers-losers",
  nse52: "/nse/52week",
  nsePenny: "/nse/penny-stocks",
  nseBand: "/nse/price-band-hitters",
  nseIpo: "/nse/ipo",
  nseActive: "/nse/most-active",
  nseBhav: "/nse/bhavcopy",
  nseIndices: "/nse/r360-indices",
  idxCompare: "/nse/index-comparison",
  news: "/news/latest",
  blogs: "/advisor/blogs/all",
  recos: "/recommendations",
  screener: "/stock/stocks",
};

const VALUE_MAX = 200;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const isDataKey = (k: unknown): k is DataKey => typeof k === "string" && Object.hasOwn(PATHS, k);

/** Applies the same per-key query rules as the /api proxy: unknown keys are dropped, bad values reject the call. */
export function resolve(key: DataKey, params: DataParams = {}): { path: string; query: string; ttl: number; timeoutMs?: number } | null {
  const path = PATHS[key];
  const rule = matchRule("GET", path);
  if (!rule || rule.auth || rule.auth0Session || !rule.ttl) return null;
  const allowed = new Set(rule.query ?? []);
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!allowed.has(k)) continue;
    if (typeof v !== "string" || v.length > VALUE_MAX || CONTROL_CHARS.test(v)) return null;
    const pat = rule.queryPattern?.[k];
    if (pat && !pat.test(v)) return null;
    out.append(k, v);
  }
  const qs = out.toString();
  return { path, query: qs ? `?${qs}` : "", ttl: rule.ttl, timeoutMs: rule.timeoutMs };
}

type Ok = { success?: boolean; error?: string };

/**
 * Server-rendered read for pages (SEO). Returns null on any failure so the page still renders and the client can
 * retry. The result (including null) is cached for a short window, so a backend outage heals itself on the next
 * revalidation instead of freezing an empty page.
 */
export async function getData<T = unknown>(key: DataKey, params: DataParams = {}): Promise<T | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 3600 });
  try {
    const r = resolve(key, params);
    if (!r) return null;
    const data = await backendGet<Ok>(r.path, params);
    return data.success === false ? null : (data as T);
  } catch {
    return null;
  }
}

/** Largest-turnover slice of the BhavCopy scan (the full file is ~2 MB, too big to embed in HTML). */
export async function getBhavTop(n = 100): Promise<{ success: true; stocks: Record<string, unknown>[]; count: number; latestDate?: string } | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  try {
    const d = await backendGet<{ success?: boolean; stocks?: Record<string, unknown>[]; count?: number; latestDate?: string }>(PATHS.nseBhav);
    if (!d.success || !Array.isArray(d.stocks)) return null;
    const turnover = (s: Record<string, unknown>) => Number(s.turnoverLacs) || 0;
    const stocks = [...d.stocks].sort((a, b) => turnover(b) - turnover(a)).slice(0, n);
    return { success: true, stocks, count: d.count ?? d.stocks.length, latestDate: d.latestDate };
  } catch {
    return null;
  }
}
