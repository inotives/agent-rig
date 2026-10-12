import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const guide = read("docs/provider-execution.md");
const text = guide.replace(/\s+/g, " ");

test("provider guide gates prompt generation and passes saved prompts through stdin", () => {
  assert.match(guide, /tasks prompt "\$task_id" --agent "\$child_agent" > "\$run_dir\/prompt.md" 2> "\$run_dir\/prompt.stderr"/);
  assert.match(text, /Continue only when `prompt_status` is `0`/);
  assert.match(text, /does not launch an agent or change task state/);
  assert.match(guide, /--cd "\$repo_root" --sandbox workspace-write --approve-for-me/);
  assert.match(guide, /--output-last-message "\$run_dir\/handoff.md" -/);
  assert.match(guide, /< "\$run_dir\/prompt.md" > "\$run_dir\/child.stdout" 2> "\$run_dir\/child.stderr"/);
  assert.match(text, /Do not wrap this child launch in/);
  assert.match(text, /same project workspace for both children/);
  assert.match(text, /Do not use the AgentRig source checkout as the default/);
});

test("provider guide preserves failure evidence without retry or completion", () => {
  assert.match(text, /Claude and OpenCode direct execution are untested here/);
  assert.match(text, /Do not claim live validation/);
  assert.match(text, /save diagnostics and return control to the planner/);
  assert.match(text, /Do not retry automatically/);
  assert.match(text, /Do not mark the task `done`/);
  assert.match(text, /Keep the task in its current eligible state/);
  assert.match(text, /zero exit status alone does not prove task completion/);
  for (const file of ["command.txt", "provider-help.txt", "prompt.md", "prompt.stderr", "prompt.exit-status", "child.stdout", "child.stderr", "child.exit-status", "handoff.md"]) {
    assert.ok(guide.includes(`\`${file}\``), file);
  }
  assert.match(text, /exact prompt and child commands, with resolved paths/);
  assert.match(text, /working directory, task ID, role, provider version, start time, end time, and timeout limit/);
  assert.match(text, /record the signal and reason/);
});

test("planner templates and deployed instructions keep launch flags outside role contracts", () => {
  const template = read("templates/profiles/planner.md");
  assert.equal(read(".agent-rig/_shared/profiles/planner.md"), template);
  assert.equal(read(".agent-rig/planner/instructions.md"), template.replaceAll("<agent>", "planner"));
  const planner = template.replace(/\s+/g, " ");
  assert.match(planner, /read-only command `agent-rig tasks prompt/);
  assert.match(planner, /check its exit status before launch. Pass the saved prompt through stdin/);
  assert.match(planner, /docs\/provider-execution.md/);
  assert.match(planner, /do not mark the task `done`/);
  assert.match(planner, /return control to the planner/);
  for (const path of ["templates/workflow.md", ".agent-rig/_shared/context.md", ...["planner", "worker", "reviewer"].map((role) => `templates/profiles/${role}.md`)]) {
    assert.doesNotMatch(read(path), /--approve-for-me|--sandbox|--permission-mode|--allowedTools/, path);
  }
});
