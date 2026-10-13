import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const fields = ["Decision", "Recipient", "Summary", "Findings", "Evidence", "Requested action"];
const contracts = ["AGENTS.md", ".agent-rig/_shared/context.md", "templates/workflow.md"];

test("planner commit gate precedes selection of the next task", () => {
  const paths = [...contracts, "templates/profiles/planner.md",
    ".agent-rig/_shared/profiles/planner.md", ".agent-rig/planner/instructions.md"];
  for (const path of paths) {
    const text = read(path).replace(/\s+/g, " ");
    assert.match(text, /After independent review and task completion, the planner must pass the commit gate before selecting, unblocking, or starting the next task/, path);
    assert.match(text, /Stage only the completed task's changes with explicit paths/, path);
    assert.match(text, /Check the staged diff and commit with a task-specific message that includes the task ID/, path);
    assert.match(text, /git log -1 --oneline/, path);
    assert.match(text, /git show --stat HEAD/, path);
    assert.match(text, /git status --porcelain.*require a clean working tree before proceeding/, path);
    assert.match(text, /If commit or verification fails, keep the next task `blocked`/, path);
    assert.match(text, /failure as a planner blocker/, path);
    assert.match(text, /Only after the gate passes, select and unblock the next eligible task/, path);
    assert.match(text, /Do not push automatically. Workers and reviewers must not commit or push/, path);
    assert.doesNotMatch(text, /completion evidence and unblock|Commit, push, or open a pull request only/, path);
  }
});

test("shared contracts define planner ownership, repair transitions, and human routing", () => {
  for (const path of contracts) {
    const text = read(path).replace(/\s+/g, " ");
    assert.match(text, /only task and handoff state writer for both Markdown and SQLite/, path);
    assert.match(text, /review -> in_progress/, path);
    assert.match(text, /human -> planner: changes_requested/, path);
    assert.match(text, /planner -> worker: changes_requested/, path);
    assert.match(text, /independent review/, path);
    assert.match(text, /Human final review|human final review/, path);
    assert.match(text, /completion evidence/, path);
    assert.match(text, /complete role instructions, shared context, the task brief and acceptance criteria/, path);
    assert.match(text, /same project workspace/, path);
    assert.doesNotMatch(text, /agent-rig loop|task stays in `review`/, path);
    for (const field of fields) assert.ok(text.includes(`**${field}:**`), `${path}: ${field}`);
  }
});

test("deployed roles preserve the template contract and local role paths", () => {
  const normalize = (text, role) => text
    .replaceAll(`.agent-rig/${role}/`, ".agent-rig/<agent>/")
    .replace("## Bounded Investigation", "## Investigation");
  for (const role of ["planner", "worker", "reviewer"]) {
    const template = read(`templates/profiles/${role}.md`);
    const shared = read(`.agent-rig/_shared/profiles/${role}.md`);
    const local = read(`.agent-rig/${role}/instructions.md`);
    // Shared profiles keep placeholders. Local instructions use role paths.
    // The shared investigation heading names the same bounded contract.
    assert.equal(normalize(shared, role), normalize(template, role));
    assert.equal(normalize(local, role), normalize(template, role));
    assert.ok(local.includes(`.agent-rig/${role}/context.md`));
    assert.doesNotMatch(local, /\.agent-rig\/<agent>\//);
    if (role !== "planner") {
      assert.match(shared, /## Bounded Investigation/);
      for (const text of [shared, local, template]) {
        assert.match(text, /CodeGraph/);
        assert.match(text, /context-mode/);
        assert.match(text.replace(/\s+/g, " "), /focused `rg` searches and direct file inspection/);
        assert.match(text.replace(/\s+/g, " "), /Run focused behavioral tests with normal test commands/);
        assert.match(text, /only when evidence requires it/);
      }
    }
    for (const field of fields) assert.ok(template.includes(`**${field}:**`), `${role}: ${field}`);
    assert.match(template, /only task and handoff state writer for Markdown and SQLite/);
    assert.doesNotMatch(template, /agent-rig loop/);
  }
});

test("child roles return handoffs without workflow mutations or nested loops", () => {
  for (const role of ["worker", "reviewer"]) {
    const text = read(`templates/profiles/${role}.md`).replace(/\s+/g, " ");
    assert.match(text, /Return proposed handoff content as Markdown/);
    assert.match(text, /Do not mutate task status, dependencies, canonical handoffs, or workflow-store files/);
    assert.match(text, /Do not select or claim another task, start nested AgentRig loops, commit, or push/);
    assert.doesNotMatch(text, /agent-rig tasks handoff|set it to `in_progress`|set it to `review`/);
  }
  const worker = read("templates/profiles/worker.md").replace(/\s+/g, " ");
  const reviewer = read("templates/profiles/reviewer.md").replace(/\s+/g, " ");
  assert.match(worker, /`review` to `reviewer` when ready, or `blocked` to `planner`/);
  assert.match(worker, /both worker and reviewer handoffs/);
  assert.match(reviewer, /Do not edit implementation files or repository notes/);
  assert.match(reviewer, /`approved` to `planner`, `changes_requested` to `worker`, or `blocked` to `planner`/);
});
