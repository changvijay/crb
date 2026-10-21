import "server-only";
import { RULES } from "./allowlist";
import { backendOrigin } from "./config";
import { cachedGet } from "./microcache";
import { loadPublic } from "./upstream";

/** Paths worth having hot before the first visitor arrives (no query-string variants). */
const WARM = ["/reports/recent", "/global-indices", "/fii-dii-flows", "/intraday-charts", "/technical/7day-chart", "/news/live-markets", "/advisor/blogs/all", "/nse/heatmap", "/nse/gainers-losers", "/nse/bhavcopy"];

export async function warmCaches() {
  let origin: string;
  try {
    origin = backendOrigin();
  } catch {
    return; // not configured: nothing to warm
  }
  await Promise.allSettled(
    WARM.map((path) => {
      const ttl = RULES.find((r) => r.method === "GET" && r.path === path)?.ttl;
      return ttl ? cachedGet(path, ttl, () => loadPublic(`${origin}/api${path}`)) : Promise.resolve();
    }),
  );
}
