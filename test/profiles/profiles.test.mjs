import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listBuiltinProfiles, listWorkspaceProfiles, loadWorkspaceProfile, profileInstructions, roleProfile, seedProfiles, skillSpecs } from "../../dist/profiles/profiles.js";

test("profiles public API seeds and loads workspace profiles", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-rig-profiles-"));
  seedProfiles(root);
  const builtins = listBuiltinProfiles();
  const workspace = listWorkspaceProfiles(root);
  const worker = loadWorkspaceProfile(root, "worker");

  assert.ok(builtins.profiles.length > 0);
  assert.equal(workspace.warnings.length, 0);
  assert.equal(worker.source, "workspace");
  assert.match(profileInstructions(worker, "alice"), /alice/);
  assert.equal(roleProfile("verifier"), "reviewer");
  assert.ok(skillSpecs(worker, "shared_skills").length > 0);
});

test("profiles public API rejects invalid workspace profile slugs", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-rig-profiles-invalid-"));
  seedProfiles(root);
  assert.throws(() => loadWorkspaceProfile(root, "Not A Slug"), /Invalid profile slug/);
});
