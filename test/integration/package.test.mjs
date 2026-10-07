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
