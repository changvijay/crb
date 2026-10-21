// One command for local development: Express backend (:8080) + Next.js (:3000).
import { spawn } from "node:child_process";

const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  p.on("exit", (code) => { console.log(`[${name}] exited (${code})`); shutdown(code ?? 0); });
  return p;
};
const procs = [run("backend", process.execPath, ["scripts/backend.mjs"]), run("next", "npx", ["next", "dev"])];
let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const p of procs) p.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => shutdown(0));
