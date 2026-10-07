import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  issuePlanPath,
  issuePlanStatuses,
  issueSlug,
  parseIssuePlan,
  readIssuePlan,
  serializeIssuePlan,
  validateIssuePlanFrontmatter,
  writeIssuePlan
} from "../../dist/workflow/index.js";
import { checkWorktreeStatus, issueBranchName, issueCompareUrl } from "../../dist/cli/plan.js";

const valid = {
  issue: 63,
  source_url: "https://github.com/inotives/agent-rig/issues/63",
  branch: "issue/63-plan-model",
  status: "draft",
  created_at: "2026-10-07T15:00:00.000Z"
};

test("issue plans serialize and parse supported metadata and body", () => {
  const source = serializeIssuePlan(valid, "# Plan\n\nContent.\n");
  assert.deepEqual(parseIssuePlan(source), { frontmatter: valid, body: "# Plan\n\nContent.\n" });
  assert.deepEqual(issuePlanStatuses, ["draft", "pushed", "approved"]);
});

test("issue plans write and read from the canonical path", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-rig-plan-"));
  const file = issuePlanPath(root, valid.issue, "GitHub Issue: Plan Model");
  writeIssuePlan(file, valid, "# Plan\n");
  assert.deepEqual(readIssuePlan(file), { frontmatter: valid, body: "# Plan\n" });
  assert.equal(readFileSync(file, "utf8").startsWith("---\n"), true);
  assert.equal(file, join(root, "docs", "plans", "issue-63-github-issue-plan-model.md"));
});

test("issue plan helpers reject incomplete and invalid frontmatter", () => {
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: undefined }), /branch is invalid/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, issue: 0 }), /positive integer/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, status: "ready" }), /status must be one of/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, created_at: "not-a-date" }), /created_at must be/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, status: "approved" }), /require approved_at/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: "issue/63 bad" }), /branch is invalid/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: "issue/.plan" }), /branch is invalid/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: "issue/1-plan.lock" }), /branch is invalid/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: "foo.lock/bar" }), /branch is invalid/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: "foo\u007fbar" }), /branch is invalid/);
  assert.throws(() => validateIssuePlanFrontmatter({ ...valid, branch: "-issue" }), /branch is invalid/);
  assert.doesNotThrow(() => validateIssuePlanFrontmatter({ ...valid, branch: "a" }));
  assert.doesNotThrow(() => validateIssuePlanFrontmatter({ ...valid, branch: "foo-" }));
  assert.doesNotThrow(() => validateIssuePlanFrontmatter({ ...valid, branch: "foo,bar" }));
  assert.doesNotThrow(() => validateIssuePlanFrontmatter({ ...valid, branch: "foo%bar" }));
  assert.doesNotThrow(() => validateIssuePlanFrontmatter({ ...valid, branch: "a]b" }));
  assert.throws(() => parseIssuePlan("# Missing frontmatter\n"), /missing frontmatter/);
});

test("issue slugs are stable and use a fallback", () => {
  assert.equal(issueSlug("GitHub Issue: Plan Model"), "github-issue-plan-model");
  assert.equal(issueSlug("---"), "issue");
  assert.throws(() => issuePlanPath("/tmp/project", 0, "plan"), /positive integer/);
});

test("issue branches use the issue number and a deterministic title slug", () => {
  assert.equal(issueBranchName(12, "Add planner input"), "issue/12-add-planner-input");
  assert.equal(issueBranchName(12, "!!!"), "issue/12-issue");
  assert.equal(issueCompareUrl("owner/repo", "issue/12-add-planner-input"), "https://github.com/owner/repo/compare/main...issue/12-add-planner-input");
});

test("worktree checks allow AgentRig runtime artifacts and reject other changes", () => {
  const result = checkWorktreeStatus([
    " M .agent-rig/_shared/workflow.sqlite",
    "?? .agent-rig/_shared/workflow.sqlite-wal",
    "?? .agent-rig/_shared/profile-backups/2026/file.json",
    "?? notes.txt"
  ].join("\n"));
  assert.deepEqual(result.allowed, [
    ".agent-rig/_shared/workflow.sqlite",
    ".agent-rig/_shared/workflow.sqlite-wal",
    ".agent-rig/_shared/profile-backups/2026/file.json"
  ]);
  assert.deepEqual(result.unexpected, ["?? notes.txt"]);
});
