// Runs the Express backend copy in .backend-test/ on BACKEND_PORT (default 8080), so it never collides with CRB on :3000.
// Secrets are read from the original project's .env at launch (BACKEND_ENV_FILE to override); nothing is copied or printed.
import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, ".backend-test");
const envFile = resolve(process.env.BACKEND_ENV_FILE || resolve(root, "../ChangMarketReport/.env"));

if (!existsSync(resolve(dir, "server.js"))) { console.error(`[backend] ${dir}/server.js not found`); process.exit(1); }
if (!existsSync(envFile)) { console.error(`[backend] env file not found: ${envFile} (set BACKEND_ENV_FILE)`); process.exit(1); }

const port = process.env.BACKEND_PORT || "8080";
const log = openSync(resolve(dir, "server.log"), "a");
const child = spawn(process.execPath, [`--env-file=${envFile}`, "server.js"], {
  cwd: dir,
  env: { ...process.env, PORT: port, AUTH0_BASE_URL: process.env.SITE_ORIGIN || "http://localhost:3000" },
  stdio: ["ignore", log, log],
});
console.log(`[backend] Express on http://localhost:${port} (log: .backend-test/server.log)`);
child.on("exit", (code) => process.exit(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
