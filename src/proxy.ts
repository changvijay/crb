import { NextResponse, type NextRequest } from "next/server";
import { CANONICAL_ORIGIN, LEGACY, OLD_HOSTS } from "@/lib/legacy-urls";
import { PAGES } from "@/lib/pages";

const CANONICAL = new Set(PAGES.map((p) => p.path));

/** The canonical path for a legacy/variant spelling, or null when the path is already canonical or unknown. */
function canonicalPath(pathname: string): string | null {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (LEGACY[clean]) return LEGACY[clean];
  const norm = clean.toLowerCase().replace(/_/g, "-");
  return norm !== clean && CANONICAL.has(norm) ? norm : null;
}

/**
 * 1. Old hosts (changresearchbase.vercel.app, www.) go to the canonical origin in ONE permanent redirect, with the
 *    path already normalised, so an old host + old spelling is never a chain.
 * 2. Case and underscore variants of a page URL (/Stock-Market-Basics, /NSE-Data) redirect to the lowercase-hyphen path.
 *    next.config redirects cannot do (2): their sources match case-insensitively and would loop on the canonical URL.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");

  if (OLD_HOSTS.has(host)) return NextResponse.redirect(`${CANONICAL_ORIGIN}${canonicalPath(pathname) ?? pathname}${search}`, 308);

  if (pathname.startsWith("/api/") || pathname.includes(".")) return NextResponse.next();
  const target = canonicalPath(pathname);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/).*)"],
};
