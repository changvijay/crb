import "server-only";
import { NextResponse } from "next/server";
import { backendOrigin, siteOrigin, trustedRedirectHosts } from "./config";
import { allow, clientKey } from "./ratelimit";

const UPSTREAM_TIMEOUT_MS = 20_000;
const SESSION_COOKIE = /^(appSession(\.\d+)?|auth_verification)=/;

/** Relative, single-slash paths only: blocks open redirects such as //evil.com or https://evil.com. */
export function safeReturnTo(value: string | null): string {
  if (!value || value.length > 512) return "/";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
   
  if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

function forwardedCookies(header: string | null): string | undefined {
  if (!header) return undefined;
  const kept = header
    .split(";")
    .map((c) => c.trim())
    .filter((c) => SESSION_COOKIE.test(c));
  return kept.length ? kept.join("; ") : undefined;
}

/**
 * Relays one Auth0 step (login / callback / logout) to Express, which owns the
 * OIDC session. Only auth cookies and fixed query keys cross the boundary, and
 * the redirect target is restricted to this site or the Auth0 tenant.
 */
export async function relayAuth0(
  req: Request,
  path: "/login" | "/callback" | "/logout",
  allowedQuery: readonly string[],
  allowedForm: readonly string[] = [],
) {
  if (!allow(`a0:${clientKey(req.headers)}`, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const incoming = new URL(req.url);
  const query = new URLSearchParams();
  for (const k of allowedQuery) {
    const v = incoming.searchParams.get(k);
    if (v === null) continue;
    if (v.length > 2048) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    query.set(k, k === "returnTo" ? safeReturnTo(v) : v);
  }

  // Auth0 returns to /callback with response_mode=form_post: a cross-site POST of a few
  // form fields. Its integrity is enforced by Express (state + nonce cookie), not by Origin.
  let form: URLSearchParams | undefined;
  if (req.method === "POST") {
    const ct = (req.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.startsWith("application/x-www-form-urlencoded")) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }
    const raw = await req.text();
    if (raw.length > 16 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const parsed = new URLSearchParams(raw);
    form = new URLSearchParams();
    for (const k of allowedForm) {
      const v = parsed.get(k);
      if (v !== null) form.set(k, v);
    }
  }

  const cookie = forwardedCookies(req.headers.get("cookie"));
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  let upstream: Response;
  try {
    upstream = await fetch(`${backendOrigin()}${path}${query.size ? `?${query}` : ""}`, {
      method: form ? "POST" : "GET",
      headers,
      body: form?.toString(),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.redirect(new URL("/?auth=unavailable", siteOrigin()), 303);
  }

  const out = new NextResponse(null, { status: 303, headers: { "Cache-Control": "no-store" } });
  for (const sc of upstream.headers.getSetCookie()) {
    if (SESSION_COOKIE.test(sc)) out.headers.append("set-cookie", sc);
  }

  const location = upstream.headers.get("location");
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    let target: URL;
    try {
      target = new URL(location, siteOrigin());
    } catch {
      return NextResponse.redirect(new URL("/", siteOrigin()), 303);
    }
    // Express may build absolute URLs from its own origin; map those back to the public site.
    if (target.origin === backendOrigin()) target = new URL(target.pathname + target.search, siteOrigin());
    if (!trustedRedirectHosts().has(target.host) || target.protocol !== "https:" && target.origin !== siteOrigin()) {
      return NextResponse.redirect(new URL("/", siteOrigin()), 303);
    }
    out.headers.set("Location", target.toString());
    return out;
  }

  // Non-redirect (e.g. Auth0 callback error rendered by Express): do not relay its HTML.
  out.headers.set("Location", new URL("/?auth=error", siteOrigin()).toString());
  return out;
}
