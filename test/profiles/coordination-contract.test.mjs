import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const fields = ["Decision", "Recipient", "Summary", "Findings", "Evidence", "Requested action"];
const contracts = ["AGENTS.md", ".agent-rig/_shared/context.md", "templates/workflow.md"];

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
  for (const role of ["planner", "worker", "reviewer"]) {
    const template = read(`templates/profiles/${role}.md`);
    assert.equal(read(`.agent-rig/_shared/profiles/${role}.md`), template);
    assert.equal(read(`.agent-rig/${role}/instructions.md`), template.replaceAll("<agent>", role));
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
