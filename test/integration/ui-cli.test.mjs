import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = new URL("../../dist/index.js", import.meta.url);

async function startsOn(args, port) {
  const child = spawn(process.execPath, [cli.pathname, "ui", ...args], { cwd: fileURLToPath(new URL("../..", import.meta.url)), stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("UI did not start")), 5000);
      let stderr = "";
      child.stdout.on("data", (chunk) => { if (chunk.toString().includes(`127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); } });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code, signal) => {
        if (code !== null || signal) {
          clearTimeout(timer);
          reject(new Error(`UI exited before startup (code=${code}, signal=${signal}): ${stderr}`));
        }
      });
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  }
  finally { child.kill("SIGTERM"); }
}

async function canBind(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", resolve);
    });
    return true;
  } catch (error) {
    if (error.code === "EADDRINUSE") return false;
    throw error;
  } finally {
    if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("CLI UI smoke starts on the documented default port", async (t) => {
  if (!(await canBind(8787))) {
    t.skip("default port 8787 is already in use; leaving the existing process untouched");
    return;
  }
  await startsOn([], 8787);
});
test("CLI UI smoke accepts a custom port", async () => { await startsOn(["--port", "18787"], 18787); });
