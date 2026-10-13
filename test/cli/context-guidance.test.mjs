import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");
const investigation = (text) => text.split("## Investigation\n")[1]?.split("\n## ")[0];

for (const role of ["worker", "reviewer"]) {
  test(`${role} guidance defines bounded investigation with optional tool fallbacks`, () => {
    const text = read(`templates/profiles/${role}.md`);
    const guidance = investigation(text);
    assert.ok(guidance, "role has an investigation section");
    assert.match(guidance, /Read the task, acceptance criteria, and latest/);
    assert.match(guidance, /When CodeGraph is available/);
    assert.match(guidance, /`codegraph_explore`/);
    assert.match(guidance, /`codegraph_node`/);
    assert.match(guidance, /CodeGraph is unavailable\s+or reports stale results/);
    assert.match(guidance, /focused `rg` searches and direct file inspection/);
    assert.match(guidance, /When context-mode is available/);
    assert.match(guidance, /large files, logs, test\s+output, or generated data/);
    assert.match(guidance, /Otherwise, inspect only relevant sections and\s+keep command output bounded/);
    assert.match(guidance, /focused behavioral tests with normal test commands/);
    assert.match(guidance, /Expand only when evidence requires it/);
    assert.match(guidance, /do not replace\s+source inspection, behavioral verification, or handoff and state ownership rules/);
    assert.doesNotMatch(guidance, /Claude|Codex|OpenCode|install|context packet/i);
    if (role === "worker") {
      assert.match(guidance, /locate implementation\s+symbols and callers before a scoped change/);
      assert.match(guidance, /file\s+and symbol references/);
    } else {
      assert.match(guidance, /supplied diff first/);
      assert.ok(guidance.indexOf("supplied diff first") < guidance.indexOf("When CodeGraph"));
      assert.match(guidance, /independently inspect changed symbols, callers, tests, and nearby behavior/);
    }
    assert.match(text, /planner is the only task and handoff state writer/);
    assert.match(text, /Do not mutate task status/);
    assert.match(text, /## Output[\s\S]*\*\*Decision:\*\*[\s\S]*\*\*Evidence:\*\*/);
    assert.equal(investigation(read(`.agent-rig/${role}/instructions.md`)), guidance);
  });
}

test("shared guidance preserves the role order and optional fallbacks", () => {
  for (const file of ["templates/workflow.md", ".agent-rig/_shared/context.md"]) {
    const text = read(file);
    const guidance = text.split("Bounded Investigation\n")[1]?.split("\n## ")[0];
    assert.ok(guidance, file);
    assert.match(guidance, /Workers use\s+CodeGraph when available/);
    assert.match(guidance, /Reviewers inspect the supplied diff first, then use CodeGraph\s+when available/);
    assert.match(guidance, /unavailable or reports stale results, use focused `rg` searches and direct file\s+inspection/);
    assert.match(guidance, /context-mode when available/);
    assert.match(guidance, /Otherwise, inspect relevant sections and keep command output bounded/);
    assert.match(guidance, /focused behavioral tests with normal test commands/);
    assert.match(guidance, /do not replace source inspection, behavioral verification,\s+or the handoff and state ownership rules above/);
  }
});
