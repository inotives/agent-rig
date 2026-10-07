import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seedProfiles } from "../../dist/profiles/profiles.js";
import { addAgent, readAgents, repairCredsGitignore, requireWorkspace, roles, tools, validSlug, workspaceRoot } from "../../dist/workspace/workspace.js";

test("workspace public API creates and reads an agent scaffold", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-workspace-"));
  const root = workspaceRoot(cwd);
  seedProfiles(root);
  addAgent(root, { name: "worker", role: "worker", tool: "codex" });

  assert.equal(requireWorkspace(cwd), root);
  assert.deepEqual(readAgents(root), [{ name: "worker", role: "worker", tool: "codex" }]);
  assert.equal(validSlug("worker"), true);
  assert.equal(validSlug("Bad Name"), false);
  assert.equal(roles.has("worker"), true);
  assert.equal(tools.has("codex"), true);
});

test("workspace public API repairs the credentials ignore file", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-workspace-creds-"));
  const root = workspaceRoot(cwd);
  repairCredsGitignore(root);
  assert.match(readFileSync(join(root, ".creds", ".gitignore"), "utf8"), /!\*\.env\.example/);
});
