import { NextResponse } from "next/server";
import { matchRule, pathKnown, type Rule } from "@/lib/server/allowlist";
import { backendOrigin, isProd, siteOrigin } from "@/lib/server/config";
import { cachedGet } from "@/lib/server/microcache";
import { loadPublic } from "@/lib/server/upstream";
import { allow, clientKey } from "@/lib/server/ratelimit";
import { clearToken, readToken, setToken } from "@/lib/server/session";

const UPSTREAM_TIMEOUT_MS = 30_000;
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const QUERY_VALUE_MAX = 200;
 
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function json(body: unknown, status: number, extra?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const site = siteOrigin();
  if (origin) return origin === site;
  // No Origin: only acceptable for same-origin navigations/fetches that say so.
  const fetchSite = req.headers.get("sec-fetch-site");
  return fetchSite === "same-origin";
}

function buildQuery(url: URL, rule: Rule): string | null {
  const allowed = new Set(rule.query ?? []);
  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams) {
    if (!allowed.has(k)) continue; // unknown keys are dropped, not forwarded
    if (v.length > QUERY_VALUE_MAX || CONTROL_CHARS.test(v)) return null;
    const pat = rule.queryPattern?.[k];
    if (pat && !pat.test(v)) return null; // value shape enforced server-side
    out.append(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

async function readJsonBody(req: Request, max: number): Promise<{ ok: true; body: string } | { ok: false; status: number; error: string }> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, error: "Content-Type must be application/json" };
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return { ok: false, status: 413, error: "Payload too large" };
  const text = await req.text();
  if (Buffer.byteLength(text) > max) return { ok: false, status: 413, error: "Payload too large" };
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: "JSON object expected" };
    }
    return { ok: true, body: JSON.stringify(parsed) };
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON" };
  }
}

/** Only the Auth0 session cookies (express-openid-connect) are forwarded, nothing else. */
function auth0Cookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter((c) => /^appSession(\.\d+)?=/.test(c));
  return kept.length ? kept.join("; ") : null;
}

async function handle(req: Request, ctx: RouteContext<"/api/[...path]">) {
  const { path: segments } = await ctx.params;
  if (!segments.every((s) => SEGMENT.test(s))) return json({ success: false, error: "Not found" }, 404);
  const path = `/${segments.join("/")}`;
  const method = req.method.toUpperCase();

  const rule = matchRule(method, path);
  if (!rule) {
    return pathKnown(path)
      ? json({ success: false, error: "Method not allowed" }, 405)
      : json({ success: false, error: "Not found" }, 404);
  }

  // Mutating requests must originate from this site (CSRF defence for cookie auth).
  if (method !== "GET" && !sameOrigin(req)) {
    return json({ success: false, error: "Cross-origin request blocked" }, 403);
  }

  const key = clientKey(req.headers);
  if (!allow(`g:${key}`, 240)) {
    return json({ success: false, error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  if (rule.limitPerMinute && !allow(`r:${method}:${rule.path}:${key}`, rule.limitPerMinute)) {
    return json({ success: false, error: "Too many attempts, please try again later" }, 429, { "Retry-After": "60" });
  }

  const url = new URL(req.url);
  const query = buildQuery(url, rule);
  if (query === null) return json({ success: false, error: "Invalid query" }, 400);

  const headers: Record<string, string> = { Accept: "application/json" };
  const cookieHeader = req.headers.get("cookie");

  if (rule.auth) {
    const token = readToken(cookieHeader, rule.auth);
    if (!token) return json({ success: false, error: "Authentication required" }, 401);
    headers.Authorization = `Bearer ${token}`;
  }
  if (rule.auth0Session) {
    const c = auth0Cookies(cookieHeader);
    if (c) headers.Cookie = c;
  }

  let body: string | undefined;
  if (rule.bodyMax) {
    const parsed = await readJsonBody(req, rule.bodyMax);
    if (!parsed.ok) return json({ success: false, error: parsed.error }, parsed.status);
    body = parsed.body;
    headers["Content-Type"] = "application/json";
  }

  // Public market-data GETs: served from the stale-while-revalidate cache (see microcache.ts).
  if (method === "GET" && rule.ttl && !rule.auth && !rule.auth0Session) {
    const target = `${backendOrigin()}/api${path}${query}`;
    const r = await cachedGet(`${path}${query}`, rule.ttl, () => loadPublic(target, rule.timeoutMs));
    if (!r.ok) return json({ success: false, error: r.error }, r.status);
    return NextResponse.json(r.data, {
      status: r.status,
      headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=60", "X-CRB-Cache": r.cache ?? "MISS" },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${backendOrigin()}/api${path}${query}`, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(rule.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json({ success: false, error: isProd ? "Service temporarily unavailable" : `Backend unreachable at ${backendOrigin()} — is the Express server running?` }, 502);
  }

  // The backend should never redirect an API call; refuse to follow or relay it.
  if (upstream.status >= 300 && upstream.status < 400) {
    return json({ success: false, error: "Unexpected upstream response" }, 502);
  }

  // Do not leak backend internals (stack/driver messages) from server errors.
  if (upstream.status >= 500) {
    // Authenticated admin operations get the upstream's short error text so failed jobs are diagnosable.
    if (rule.auth === "admin") {
      const detail = await upstream.json().then((d: { error?: unknown }) => d?.error).catch(() => null);
      if (typeof detail === "string" && detail.length <= 300 && !CONTROL_CHARS.test(detail)) {
        return json({ success: false, error: detail }, 502);
      }
    }
    return json({ success: false, error: "Something went wrong. Please try again." }, upstream.status === 504 ? 504 : 502);
  }

  // An expired/revoked admin or advisor token: drop the cookie so the UI returns to its login screen.
  const expired = Boolean(rule.auth) && upstream.status === 401;

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ success: false, error: "Unexpected upstream response" }, 502);
  }

  const data = await upstream.json().catch(() => null);
  if (data === null) return json({ success: false, error: "Unexpected upstream response" }, 502);

  const isPrivate = Boolean(rule.auth || rule.auth0Session || rule.issuesToken || rule.clearsToken);

  // The browser never receives a JWT: it is moved into an httpOnly cookie.
  let payload: unknown = data;
  let token: string | null = null;
  if (rule.issuesToken && upstream.ok && typeof data === "object") {
    const t = (data as { token?: unknown }).token;
    if (typeof t === "string" && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t)) token = t;
    const sanitized = { ...(data as Record<string, unknown>) };
    delete sanitized.token;
    payload = sanitized;
  }

  const res = NextResponse.json(payload, {
    status: upstream.status,
    headers: {
      "Cache-Control":
        isPrivate || method !== "GET"
          ? "private, no-store"
          : "public, max-age=0, s-maxage=15, stale-while-revalidate=60",
    },
  });

  if (expired && rule.auth) clearToken(res, rule.auth);
  if (rule.issuesToken && token) setToken(res, rule.issuesToken, token);
  if (rule.clearsToken) clearToken(res, rule.clearsToken);

  if (rule.auth0Session) {
    // Relay session refresh cookies for the Auth0 session only.
    for (const sc of upstream.headers.getSetCookie()) {
      if (/^appSession(\.\d+)?=/.test(sc)) res.headers.append("set-cookie", sc);
    }
  }
  return res;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
