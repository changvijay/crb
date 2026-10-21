import "server-only";
import type { NextResponse } from "next/server";
import type { Principal } from "./allowlist";
import { isProd } from "./config";

const COOKIE: Record<Principal, string> = {
  advisor: "crb_advisor",
  admin: "crb_admin",
};
const MAX_AGE: Record<Principal, number> = {
  advisor: 7 * 24 * 60 * 60, // matches Express JWT expiry
  admin: 24 * 60 * 60,
};

export function cookieName(p: Principal) {
  return COOKIE[p];
}

export function readToken(cookieHeader: string | null, p: Principal): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE[p]) {
      const v = rest.join("=");
      // JWT charset only; refuses anything odd before it reaches a header.
      return /^[\w-]+\.[\w-]+\.[\w-]+$/.test(v) ? v : null;
    }
  }
  return null;
}

export function setToken(res: NextResponse, p: Principal, token: string) {
  res.cookies.set(COOKIE[p], token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE[p],
  });
}

export function clearToken(res: NextResponse, p: Principal) {
  res.cookies.set(COOKIE[p], "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
