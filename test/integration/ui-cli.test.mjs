import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = new URL("../../dist/index.js", import.meta.url);

async function startsOn(args, port) {
  const child = spawn(process.execPath, [cli.pathname, "ui", ...args], { cwd: fileURLToPath(new URL("../..", import.meta.url)), stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("UI did not start")), 5000);
    child.stdout.on("data", (chunk) => { if (chunk.toString().includes(`127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); } });
    child.once("error", reject);
  });
  try { assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200); }
  finally { child.kill("SIGTERM"); }
}

test("CLI UI smoke starts on the documented default port", async () => { await startsOn([], 8787); });
test("CLI UI smoke accepts a custom port", async () => { await startsOn(["--port", "18787"], 18787); });
