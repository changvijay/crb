// One process for the whole app: Next.js (public) + the Express API in ./server (internal only).
//
//   Browser → Next.js on :PORT (default 3000) → Express on 127.0.0.1:BACKEND_PORT (default 8080) → MongoDB
//
// Express binds to loopback only, so the public can never reach it directly: every API call goes
// through Next's /api/[...path] layer (allowlist, rate limits, CSRF checks).
import { createServer } from "node:http";
import { createRequire } from "node:module";
import next from "next";
import nextEnv from "@next/env";

const dev = process.env.NODE_ENV !== "production";

// Load .env / .env.local once, the same way Next does, before Express reads process.env.
nextEnv.loadEnvConfig(process.cwd(), dev);

const port = Number(process.env.PORT || 3000);
const backendPort = Number(process.env.BACKEND_PORT || 8080);

// Always point Next at the in-process Express. Not configurable: it is internal plumbing.
process.env.BACKEND_URL = `http://127.0.0.1:${backendPort}`;
process.env.SITE_ORIGIN ||= `http://localhost:${port}`;
process.env.AUTH0_BASE_URL ||= process.env.SITE_ORIGIN;

// Express app (CommonJS). Requiring it also connects MongoDB and schedules the BhavCopy cron.
const require = createRequire(import.meta.url);
const api = require("./server/server.js");

const apiServer = api.listen(backendPort, "127.0.0.1", () => {
  console.log(`[api]  Express on 127.0.0.1:${backendPort} (internal)`);
});

const app = next({ dev, port });
const handle = app.getRequestHandler();
await app.prepare();

const web = createServer((req, res) => handle(req, res)).listen(port, () => {
  console.log(`[web]  Next.js on http://localhost:${port} (${dev ? "dev" : "production"})`);
});

let closing = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    web.close();
    apiServer.close();
    setTimeout(() => process.exit(0), 500).unref();
  });
}
