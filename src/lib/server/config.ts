import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required server env var ${name}`);
  return v;
}

/** Internal Express origin. Server-only: never prefixed NEXT_PUBLIC_, never sent to the client. */
export function backendOrigin(): string {
  const url = new URL(required("BACKEND_URL"));
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BACKEND_URL must be http(s)");
  }
  return url.origin;
}

export function siteOrigin(): string {
  return new URL(required("SITE_ORIGIN")).origin;
}

/** Hosts a backend redirect may point at: this site and the Auth0 tenant. */
export function trustedRedirectHosts(): Set<string> {
  const hosts = new Set<string>([new URL(siteOrigin()).host]);
  const auth0 = process.env.AUTH0_DOMAIN;
  if (auth0) hosts.add(auth0.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  return hosts;
}

export const isProd = process.env.NODE_ENV === "production";
