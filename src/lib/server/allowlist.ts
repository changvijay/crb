import "server-only";

/**
 * The ONLY backend endpoints the browser may reach through /api/*.
 * Anything not matched here is rejected before a backend request is made.
 *
 * Each rule is an exact method + path pattern. Path params are matched by a
 * strict pattern (Mongo ObjectId or a short slug), never a free wildcard.
 */

export type Principal = "advisor" | "admin";

export type Rule = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path after /api, e.g. "/nse/heatmap". `:id` = ObjectId, `:slug` = short token. */
  path: string;
  /** Allowed query keys (others are dropped). Omit for none. */
  query?: readonly string[];
  /** Upstream timeout for slow scrapers (default 30 s). */
  timeoutMs?: number;
  /** Strict value shape per query key; a request whose value does not match is rejected (400). */
  queryPattern?: Readonly<Record<string, RegExp>>;
  /** Attach the httpOnly session token of this principal as Bearer. */
  auth?: Principal;
  /** Response carries a token: store it in an httpOnly cookie, strip from body. */
  issuesToken?: Principal;
  /** Response clears the principal's session cookie. */
  clearsToken?: Principal;
  /** Forward the Auth0 session cookie (express-openid-connect) to the backend. */
  auth0Session?: boolean;
  /** Accept a JSON body (max bytes). Omit for no body. */
  bodyMax?: number;
  /** Server-side cache freshness in seconds for public GETs (stale-while-revalidate). */
  ttl?: number;
  /** Tighter per-client rate limit (requests / minute) for sensitive routes. */
  limitPerMinute?: number;
};

const A = "advisor" as const;
const ADM = "admin" as const;
const BODY = 16 * 1024;

export const RULES: readonly Rule[] = [
  // ── Market data (public) ────────────────────────────────────────────────
  { method: "GET", path: "/technical/7day-chart", ttl: 300 },
  { method: "GET", path: "/reports/recent", ttl: 60 },
  { method: "GET", path: "/reports/latest", ttl: 60 },
  { method: "GET", path: "/reports/:id", ttl: 60 },
  { method: "GET", path: "/global-indices", ttl: 30, query: ["t"] },
  { method: "GET", path: "/us-market/dashboard", ttl: 60 },
  { method: "GET", path: "/crypto/dashboard", ttl: 30 },
  { method: "GET", path: "/intraday-charts", ttl: 20 },
  { method: "GET", path: "/fii-dii-flows", ttl: 300 },
  { method: "GET", path: "/nse/heatmap", ttl: 60 },
  { method: "GET", path: "/nse/r360-indices", ttl: 120, query: ["exchange"] },
  { method: "GET", path: "/nse/index-comparison", ttl: 300, query: ["indices", "days"] },
  { method: "GET", path: "/news/latest", ttl: 300, query: ["limit", "category"] },
  { method: "GET", path: "/news/live-markets", ttl: 30 },
  {
    method: "GET",
    path: "/recommendations", ttl: 30,
    query: ["page", "limit", "status", "tradeType", "term", "search", "sortBy", "sortDir"],
  },

  // ── NSE data page (public reads) ───────────────────────────────────────
  { method: "GET", path: "/nse/gainers-losers", ttl: 30 },
  { method: "GET", path: "/nse/52week", ttl: 60 },
  { method: "GET", path: "/nse/penny-stocks", ttl: 60 },
  { method: "GET", path: "/nse/price-band-hitters", ttl: 60 },
  { method: "GET", path: "/nse/ipo", ttl: 300 },
  { method: "GET", path: "/nse/most-active", ttl: 60 },
  { method: "GET", path: "/nse/bhavcopy", ttl: 600 },

  // ── Stock screener: makes the backend scrape Screener.in, so symbols are strictly validated and the route is throttled ──
  { method: "GET", path: "/stock/stocks", query: ["symbols"], queryPattern: { symbols: /^[A-Za-z0-9&._-]{1,20}(,[A-Za-z0-9&._-]{1,20}){0,5}$/ }, ttl: 600, limitPerMinute: 8, timeoutMs: 75_000 },

  // ── Auth0 visitor session ───────────────────────────────────────────────
  { method: "GET", path: "/auth/me", auth0Session: true },
  { method: "POST", path: "/auth/advisor/change-password", auth0Session: true, limitPerMinute: 3 },

  // ── Advisor auth (rate-limited; Express limiter is shared behind a proxy) ─
  { method: "POST", path: "/advisor/auth/register", bodyMax: BODY, issuesToken: A, limitPerMinute: 5 },
  { method: "POST", path: "/advisor/auth/login", bodyMax: BODY, issuesToken: A, limitPerMinute: 8 },
  { method: "POST", path: "/advisor/auth/forgot-password", bodyMax: BODY, limitPerMinute: 5 },
  { method: "POST", path: "/advisor/auth/reset-password", bodyMax: BODY, limitPerMinute: 5 },

  // ── Advisor profile / content ───────────────────────────────────────────
  { method: "GET", path: "/advisor/blogs/all", ttl: 120, query: ["limit"] },
  { method: "GET", path: "/advisor/:id" },
  { method: "PUT", path: "/advisor/:id", auth: A, bodyMax: BODY },
  { method: "GET", path: "/advisor/:id/reviews" },
  { method: "POST", path: "/advisor/:id/reviews", bodyMax: BODY, limitPerMinute: 6 },
  { method: "GET", path: "/advisor/:id/achievements" },
  { method: "POST", path: "/advisor/:id/achievements", auth: A, bodyMax: BODY },
  { method: "GET", path: "/advisor/:id/recommendations", query: ["page", "limit"] },
  { method: "POST", path: "/advisor/:id/recommendations", auth: A, bodyMax: BODY },
  { method: "GET", path: "/advisor/:id/blogs" },
  { method: "POST", path: "/advisor/:id/blogs", auth: A, bodyMax: 256 * 1024 },
  { method: "DELETE", path: "/advisor/:id/blogs/:blogId", auth: A },

  // ── Admin (token never leaves the server) ───────────────────────────────
  { method: "POST", path: "/admin/login", bodyMax: 1024, issuesToken: ADM, limitPerMinute: 5 },
  { method: "POST", path: "/admin/logout", auth: ADM, clearsToken: ADM },
  { method: "GET", path: "/admin/trade-recommendations", auth: ADM, query: ["limit", "page"] },
  { method: "POST", path: "/admin/trade-recommendations", auth: ADM, bodyMax: BODY },
  { method: "DELETE", path: "/admin/trade-recommendations/:id", auth: ADM },
  // Reports
  { method: "GET", path: "/admin/reports", auth: ADM, query: ["page", "limit"], queryPattern: { page: /^\d{1,4}$/, limit: /^\d{1,3}$/ } },
  { method: "GET", path: "/admin/reports/:id", auth: ADM },
  { method: "PUT", path: "/admin/reports/:id", auth: ADM, bodyMax: 512 * 1024, limitPerMinute: 30 },
  { method: "DELETE", path: "/admin/reports/:id", auth: ADM, limitPerMinute: 30 },
  { method: "PATCH", path: "/admin/reports/:id/publish", auth: ADM, limitPerMinute: 30 },
  { method: "GET", path: "/admin/reports/:id/events", auth: ADM },
  { method: "POST", path: "/admin/reports/:id/events", auth: ADM, bodyMax: 32 * 1024, limitPerMinute: 30 },
  { method: "PUT", path: "/admin/reports/:id/events/:n", auth: ADM, bodyMax: 32 * 1024, limitPerMinute: 30 },
  { method: "DELETE", path: "/admin/reports/:id/events/:n", auth: ADM, limitPerMinute: 30 },
  // Heavy / side-effecting jobs: tightly throttled, long upstream timeouts
  { method: "POST", path: "/admin/generate-report", auth: ADM, limitPerMinute: 2, timeoutMs: 240_000 },
  { method: "POST", path: "/admin/nse/price-band-hitters/sync", auth: ADM, limitPerMinute: 3, timeoutMs: 120_000 },
  { method: "GET", path: "/admin/bhavcopy/status", auth: ADM },
  { method: "POST", path: "/admin/bhavcopy/sync", auth: ADM, limitPerMinute: 2, timeoutMs: 240_000 },
  { method: "POST", path: "/admin/bhavcopy/reset", auth: ADM, limitPerMinute: 1, timeoutMs: 360_000 },
  { method: "POST", path: "/admin/trade-recommendations/sync-prices", auth: ADM, limitPerMinute: 3, timeoutMs: 120_000 },
  { method: "POST", path: "/admin/email/send-weekly", auth: ADM, limitPerMinute: 1, timeoutMs: 240_000 },
];

const ID = "[a-fA-F0-9]{24}";
const compiled = RULES.map((rule) => {
  const source = rule.path
    .split("/")
    .map((seg) => (seg === ":id" || seg === ":blogId" ? ID : seg === ":n" ? "\\d{1,4}" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return { rule, re: new RegExp(`^${source}$`) };
});

export function matchRule(method: string, path: string): Rule | null {
  const m = method.toUpperCase();
  for (const { rule, re } of compiled) {
    if (rule.method === m && re.test(path)) return rule;
  }
  return null;
}

/** True if the path exists under another method (to answer 405 vs 404). */
export function pathKnown(path: string): boolean {
  return compiled.some(({ re }) => re.test(path));
}
