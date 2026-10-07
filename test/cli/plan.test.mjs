import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseTaskBreakdown, validateTaskDependencies } from "../../dist/cli/plan.js";

const cli = new URL("../../dist/index.js", import.meta.url).pathname;

function tempProject() {
  return mkdtempSync(join(tmpdir(), "agent-rig-plan-cli-"));
}

function run(args, cwd, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env, AGENT_RIG_SKIP_SKILLS: "1" }
  });
}

test("top-level help lists the reviewed issue planning commands", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /plan\s+Discover issues and manage reviewed issue plans/);
  for (const command of ["plan github-issue", "plan branch", "plan resume", "plan approve", "plan tasks"]) {
    assert.match(result.stdout, new RegExp(command.replace(" ", "\\s+")));
  }
});

function fakeGh(cwd, issues, { authenticated = true } = {}) {
  const bin = join(cwd, "fake-bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "issues.json"), JSON.stringify(issues), "utf8");
  writeFileSync(join(bin, "gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (${authenticated ? "true" : "false"} === false) process.exit(1);
if (args.includes("isPullRequest")) process.exit(2);
const issues = JSON.parse(fs.readFileSync(path.join(__dirname, "issues.json"), "utf8"));
if (args[0] === "repo" && args[1] === "view") console.log(JSON.stringify({ nameWithOwner: "owner/repo" }));
else if (args[0] === "issue" && args[1] === "list") console.log(JSON.stringify(issues));
else if (args[0] === "issue" && args[1] === "view") {
  const issue = issues.find((item) => item.number === Number(args[2]));
  if (!issue) process.exit(1);
  console.log(JSON.stringify(issue));
} else process.exit(1);
`, "utf8");
  chmodSync(join(bin, "gh"), 0o755);
  return { PATH: `${bin}:${process.env.PATH ?? ""}` };
}

function fakeGit(cwd, existingBranch, existingRemoteBranch = false, actualRemoteBranch = false, currentBranch = existingBranch) {
  const bin = join(cwd, "fake-bin");
  writeFileSync(join(bin, "git"), `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, "git.log"), args.join(" ") + "\\n");
if (args[0] === "status") console.log("");
else if (args[0] === "branch" && args[1] === "--show-current") console.log(${JSON.stringify(currentBranch ?? "")});
else if (${!existingRemoteBranch && !actualRemoteBranch ? "true" : "false"} && args[0] === "branch" && args[1] === "--list" && args[2] === ${JSON.stringify(existingBranch)}) console.log("  ${existingBranch}");
else if (args[0] === "branch" && args[1] === "--remotes" && args[2] === "--list" && args[3] === ${JSON.stringify(existingBranch ? `origin/${existingBranch}` : "")}) {
  if (${existingRemoteBranch ? "true" : "false"}) console.log("  origin/${existingBranch}");
}
else if (args[0] === "ls-remote" && ${actualRemoteBranch ? "true" : "false"}) console.log("abc123\trefs/heads/${existingBranch}");
`, "utf8");
  chmodSync(join(bin, "git"), 0o755);
}

const issue = {
  number: 12,
  title: "Add planner input",
  body: "The planner needs issue context.",
  url: "https://github.com/owner/repo/issues/12",
  labels: [{ name: "planning" }],
  comments: [{ author: { login: "alice" }, createdAt: "2026-10-08T01:02:03Z", body: "Please include comments." }],
};

test("plan github-issue lists all open issues and excludes pull requests", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue, { ...issue, number: 13, title: "A pull request", url: "https://github.com/owner/repo/pull/13" }]);
  const result = run(["plan", "github-issue"], cwd, env);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /#12 Add planner input/);
  assert.doesNotMatch(result.stdout, /pull request/);
  assert.match(result.stdout, /agent-rig plan github-issue <number>/);
  assert.equal(existsSync(join(cwd, "docs", "plans")), false);
  assert.deepEqual(readdirSync(join(cwd, ".agent-rig", "_shared", "tasks")), [".gitkeep"]);
});

test("plan github-issue selects one issue with body, labels, and comments", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const result = run(["plan", "github-issue", "12"], cwd, fakeGh(cwd, [issue]));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /#12 Add planner input/);
  assert.match(result.stdout, /The planner needs issue context/);
  assert.match(result.stdout, /Labels: planning/);
  assert.match(result.stdout, /@alice \(2026-10-08T01:02:03Z\)/);
  assert.match(result.stdout, /Please include comments/);
});

test("plan github-issue reports no issues without selecting one", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const result = run(["plan", "github-issue"], cwd, fakeGh(cwd, []));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No open GitHub issues found in owner\/repo/);
});

test("plan github-issue gives setup guidance when gh is missing or unauthenticated", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const missing = run(["plan", "github-issue"], cwd, { PATH: join(cwd, "empty-bin") });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /GitHub issue planning requires the GitHub CLI/);

  const unauthenticated = run(["plan", "github-issue"], cwd, fakeGh(cwd, [], { authenticated: false }));
  assert.equal(unauthenticated.status, 1);
  assert.match(unauthenticated.stderr, /gh auth login/);
});

test("plan branch refuses an existing branch before changing the worktree", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  const branch = "issue/12-add-planner-input";
  fakeGit(cwd, branch);

  const result = run(["plan", "branch", "12"], cwd, env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`Branch already exists: ${branch}`));
  assert.deepEqual(readFileSync(join(cwd, "fake-bin", "git.log"), "utf8").trim().split(/\r?\n/), [
    "status --porcelain=v1",
    `branch --list ${branch}`
  ]);
});

test("plan branch refuses an existing remote branch before changing the worktree", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  const branch = "issue/12-add-planner-input";
  fakeGit(cwd, branch, true);

  const result = run(["plan", "branch", "12"], cwd, env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`Branch already exists: ${branch}`));
  assert.deepEqual(readFileSync(join(cwd, "fake-bin", "git.log"), "utf8").trim().split(/\r?\n/), [
    "status --porcelain=v1",
    `branch --list ${branch}`,
    `branch --remotes --list origin/${branch}`
  ]);
});

test("plan branch checks the actual remote when the tracking ref is stale", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  const branch = "issue/12-add-planner-input";
  fakeGit(cwd, branch, false, true);

  const result = run(["plan", "branch", "12"], cwd, env);

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`Branch already exists: ${branch}`));
  assert.deepEqual(readFileSync(join(cwd, "fake-bin", "git.log"), "utf8").trim().split(/\r?\n/), [
    "status --porcelain=v1",
    `branch --list ${branch}`,
    `branch --remotes --list origin/${branch}`,
    `ls-remote --heads origin refs/heads/${branch}`
  ]);
});

test("plan branch writes, pushes, and reports the canonical issue plan", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, null);

  const result = run(["plan", "branch", "12"], cwd, env);

  assert.equal(result.status, 0, result.stderr);
  const file = join(cwd, "docs", "plans", "issue-12-add-planner-input.md");
  const plan = readFileSync(file, "utf8");
  assert.match(plan, /^---\nissue: 12/m);
  assert.match(plan, /status: pushed/);
  assert.match(plan, /## Goal/);
  assert.match(plan, /## Scope/);
  assert.match(plan, /## Decisions/);
  assert.match(plan, /## Implementation Plan/);
  assert.match(plan, /## Task Breakdown/);
  assert.match(plan, /Please include comments/);
  assert.match(result.stdout, /Branch: issue\/12-add-planner-input/);
  assert.match(result.stdout, /compare\/main\.\.\.issue\/12-add-planner-input/);
  assert.deepEqual(readdirSync(join(cwd, ".agent-rig", "_shared", "tasks")), [".gitkeep"]);
});

test("plan branch refuses to overwrite an existing issue plan", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, null);
  const first = run(["plan", "branch", "12"], cwd, env);
  assert.equal(first.status, 0, first.stderr);
  const file = join(cwd, "docs", "plans", "issue-12-add-planner-input.md");
  const before = readFileSync(file, "utf8");

  const second = run(["plan", "branch", "12"], cwd, env);

  assert.equal(second.status, 1);
  assert.match(second.stderr, /Issue plan already exists/);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("plan resume is explicit and preserves an unapproved plan", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, null);
  assert.equal(run(["plan", "branch", "12"], cwd, env).status, 0);
  const file = join(cwd, "docs", "plans", "issue-12-add-planner-input.md");
  const before = readFileSync(file, "utf8");
  fakeGit(cwd, "issue/12-add-planner-input");

  const result = run(["plan", "resume", "12"], cwd, env);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(file, "utf8"), before);
  assert.match(result.stdout, /Resumed issue plan/);
  assert.match(result.stdout, /compare\/main\.\.\.issue\/12-add-planner-input/);
});

test("plan approve updates and pushes a complete plan on its issue branch", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, null);
  assert.equal(run(["plan", "branch", "12"], cwd, env).status, 0);
  fakeGit(cwd, "issue/12-add-planner-input");

  const result = run(["plan", "approve", "12"], cwd, env);

  assert.equal(result.status, 0, result.stderr);
  const file = join(cwd, "docs", "plans", "issue-12-add-planner-input.md");
  const plan = readFileSync(file, "utf8");
  assert.match(plan, /status: approved/);
  assert.match(plan, /approved_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  assert.match(result.stdout, /Approved issue plan/);
  assert.match(readFileSync(join(cwd, "fake-bin", "git.log"), "utf8"), /commit -m docs: approve issue 12 plan/);
});

test("plan approve rejects a missing or incomplete plan before changing git state", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, "issue/12-add-planner-input");

  const missing = run(["plan", "approve", "12"], cwd, env);

  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Issue plan does not exist/);
  assert.equal(existsSync(join(cwd, "fake-bin", "git.log")), false);
});

test("plan approve rejects repeated approval without a second commit", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, null);
  assert.equal(run(["plan", "branch", "12"], cwd, env).status, 0);
  fakeGit(cwd, "issue/12-add-planner-input");
  assert.equal(run(["plan", "approve", "12"], cwd, env).status, 0);
  const before = readFileSync(join(cwd, "fake-bin", "git.log"), "utf8");

  const repeated = run(["plan", "approve", "12"], cwd, env);

  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /already approved/);
  assert.equal(readFileSync(join(cwd, "fake-bin", "git.log"), "utf8"), before);
});

function approvedPlanBody(dependency = "") {
  return `## Task Breakdown

### Task 1: Build foundation

#### Context

The foundation context.

#### Goal

Build the foundation.

#### Scope

Implement the foundation.

#### Planner Notes

Keep the change small.

#### Implementation Plan

Implement and test the foundation.

#### Acceptance Criteria

The foundation works.

### Task 2: Add integration

Depends On: ${dependency}

#### Context

The integration context.

#### Goal

Add the integration.

#### Scope

Implement the integration.

#### Planner Notes

Use the foundation.

#### Implementation Plan

Implement and test the integration.

#### Acceptance Criteria

The integration works.
`;
}

function reverseDependencyPlanBody() {
  return approvedPlanBody("").replace("### Task 1: Build foundation", "### Task 1: Build foundation\n\nDepends On: 2");
}

function writeApprovedPlan(cwd, body = approvedPlanBody("1")) {
  mkdirSync(join(cwd, "docs", "plans"), { recursive: true });
  writeFileSync(join(cwd, "docs", "plans", "issue-12-add-planner-input.md"), `---
issue: 12
source_url: https://github.com/owner/repo/issues/12
branch: issue/12-add-planner-input
status: approved
created_at: 2026-10-08T01:02:03.000Z
approved_at: 2026-10-08T01:03:03.000Z
---
${body}`, "utf8");
}

test("plan task breakdown rejects unknown, duplicate, and self dependencies", () => {
  for (const dependency of ["99", "1,1"]) {
    const tasks = parseTaskBreakdown(approvedPlanBody(dependency));
    assert.throws(() => validateTaskDependencies(tasks), /unknown task|duplicate dependency/);
  }
  const tasks = parseTaskBreakdown(approvedPlanBody("2"));
  assert.throws(() => validateTaskDependencies(tasks), /cannot depend on itself/);
});

test("plan tasks generates complete dependency-gated tasks and prevents duplicates", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeApprovedPlan(cwd);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, "main");

  const result = run(["plan", "tasks", "12"], cwd, env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Generated 2 implementation task\(s\)/);
  assert.match(result.stdout, /agent-rig loop --once/);
  const first = run(["tasks", "show", "task-0001"], cwd);
  const second = run(["tasks", "show", "task-0002"], cwd);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(first.stdout, /status: ready/);
  assert.match(first.stdout, /## Acceptance Criteria/);
  assert.match(first.stdout, /plan_path: docs\/plans\/issue-12-add-planner-input\.md/);
  assert.match(second.stdout, /status: blocked/);
  assert.match(second.stdout, /depends_on:/);

  const duplicate = run(["plan", "tasks", "12"], cwd, env);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /Implementation tasks already exist/);
});

test("plan tasks rejects an unapproved plan before creating tasks", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeApprovedPlan(cwd);
  const planFile = join(cwd, "docs", "plans", "issue-12-add-planner-input.md");
  writeFileSync(planFile, readFileSync(planFile, "utf8").replace("status: approved", "status: draft"), "utf8");

  const result = run(["plan", "tasks", "12"], cwd, fakeGh(cwd, [issue]));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /status approved/);
  assert.deepEqual(readdirSync(join(cwd, ".agent-rig", "_shared", "tasks")), [".gitkeep"]);
});

test("plan tasks creates reverse-order dependencies after their prerequisites", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeApprovedPlan(cwd, reverseDependencyPlanBody());
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, "main");

  const result = run(["plan", "tasks", "12"], cwd, env);

  assert.equal(result.status, 0, result.stderr);
  const first = run(["tasks", "show", "task-0001"], cwd);
  const second = run(["tasks", "show", "task-0002"], cwd);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.match(first.stdout, /status: blocked/);
  assert.match(first.stdout, /depends_on:.*task-0002/s);
  assert.match(second.stdout, /status: ready/);
});

test("plan tasks preserves an imported issue task and links generated children", () => {
  const cwd = tempProject();
  assert.equal(run(["init", "--yes"], cwd).status, 0);
  writeApprovedPlan(cwd);
  const env = fakeGh(cwd, [issue]);
  fakeGit(cwd, "main");

  const imported = run(["tasks", "sync", "github"], cwd, env);
  assert.equal(imported.status, 0, imported.stderr);

  const result = run(["plan", "tasks", "12"], cwd, env);

  assert.equal(result.status, 0, result.stderr);
  const sourceTask = run(["tasks", "show", "task-0001"], cwd);
  const firstChild = run(["tasks", "show", "task-0002"], cwd);
  const secondChild = run(["tasks", "show", "task-0003"], cwd);
  assert.equal(sourceTask.status, 0, sourceTask.stderr);
  assert.equal(firstChild.status, 0, firstChild.stderr);
  assert.equal(secondChild.status, 0, secondChild.stderr);
  assert.match(sourceTask.stdout, /title: Add planner input/);
  assert.match(sourceTask.stdout, /source:/);
  assert.match(firstChild.stdout, /parent: task-0001/);
  assert.match(secondChild.stdout, /parent: task-0001/);
});
