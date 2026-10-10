import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

test("package dry-run includes the built distribution", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const packed = JSON.parse(result.stdout);
  assert.ok(packed[0].files.some(({ path }) => path === "dist/index.js"));
});

test("package dry-run includes the sandbox runner with the executable bit", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const file = JSON.parse(result.stdout)[0].files.find(({ path }) => path === "templates/tools/sandbox-run.sh");
  assert.ok(file, "templates/tools/sandbox-run.sh is not in the package");
  assert.ok((file.mode & 0o111) !== 0, `the runner is not executable in the package: ${file.mode.toString(8)}`);
});
