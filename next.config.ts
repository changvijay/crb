import type { NextConfig } from "next";
import { CANONICAL_ORIGIN, LEGACY, OLD_HOSTS } from "./src/lib/legacy-urls";

const isDev = process.env.NODE_ENV === "development";

// Third parties the migrated pages actually load. Everything else is blocked by the browser.
const csp = [
  "default-src 'self'",
  // Next.js needs inline bootstrap scripts; a per-request nonce would force every page dynamic.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://s3.tradingview.com https://cdn.jsdelivr.net https://d3js.org`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://assets.parqet.com https://s3.tradingview.com https://s.gravatar.com https://*.googleusercontent.com https://cdn.auth0.com https://i0.wp.com https://assets.coingecko.com https://coin-images.coingecko.com https://www.coingecko.com https://data.coingecko.com",
  "frame-src https://s.tradingview.com https://www.tradingview.com https://www.tradingview-widget.com https://www.youtube.com",
  // The browser may only talk to this origin; all data flows through /api/* server-side.
  `connect-src 'self'${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");


const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // Config redirects run before the proxy. Without these host-scoped copies, an old host + legacy spelling would
    // redirect on the old host first and only then to the canonical origin (two hops). Other old-host paths: src/proxy.ts.
    const onOldHost = [...OLD_HOSTS].flatMap((host) =>
      Object.entries(LEGACY).map(([source, destination]) => ({ source, has: [{ type: "host" as const, value: host }], destination: `${CANONICAL_ORIGIN}${destination}`, permanent: true })),
    );
    return [...onOldHost, ...Object.entries(LEGACY).map(([source, destination]) => ({ source, destination, permanent: true }))];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
};

export default nextConfig;
