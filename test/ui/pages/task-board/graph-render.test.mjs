import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { graphNodeAriaLabel, graphNodeText, graphStatusClasses, graphStatusLegend, wrapGraphTitle } from "../../../../dist/ui/pages/task-board/graph/render.js";

const task = (over = {}) => ({ id: "task-0001", title: "Short title", type: "task", status: "ready", assigned_to: "worker", priority: "high", phase: "phase-22", updated_on: "2026-10-09", handoff_count: 3, ...over });

test("wrapGraphTitle wraps to two lines and adds an ellipsis only when cut", () => {
  assert.deepEqual(wrapGraphTitle("Short title", 24), ["Short title"]);
  assert.deepEqual(wrapGraphTitle("Render flat DaisyUI graph nodes and edges", 24), ["Render flat DaisyUI", "graph nodes and edges"]);
  const cut = wrapGraphTitle("Render flat DaisyUI graph nodes edges and legend for every task", 24);
  assert.equal(cut.length, 2);
  assert.ok(cut[1].endsWith("…"));
  assert.ok(cut.every((line) => line.length <= 24));
  assert.deepEqual(wrapGraphTitle("Supercalifragilisticexpialidocious-word", 10).length, 2);
});

test("graphNodeText gives ID, title lines, status, agent, priority, and handoff count", () => {
  const text = graphNodeText(task());
  assert.equal(text.id, "task-0001");
  assert.deepEqual(text.title, ["Short title"]);
  assert.equal(text.status, "ready");
  assert.equal(text.agent, "worker");
  assert.equal(text.priority, "high");
  assert.equal(text.handoffs, "3");
  assert.equal(graphNodeText(task({ status: "in_progress", assigned_to: "" })).status, "in progress");
  assert.equal(graphNodeText(task({ assigned_to: "" })).agent, "unassigned");
});

test("graphStatusClasses maps every status to DaisyUI tokens", () => {
  const expected = { todo: "neutral", ready: "info", in_progress: "warning", blocked: "error", review: "secondary", done: "success" };
  for (const [status, tone] of Object.entries(expected)) {
    const classes = graphStatusClasses(status);
    assert.equal(classes.rail, `fill-${tone}`);
    assert.equal(classes.badge, `fill-${tone}`);
    assert.equal(classes.badgeText, `fill-${tone}-content`);
  }
  assert.equal(graphStatusClasses("unknown").rail, "fill-neutral");
  assert.deepEqual(graphStatusLegend().map((item) => item.status), ["todo", "ready", "in_progress", "blocked", "review", "done"]);
});

test("graphNodeAriaLabel keeps ID, title, and status and adds agent, priority, handoffs", () => {
  assert.equal(graphNodeAriaLabel(task()), "task-0001: Short title; status ready; agent worker; priority high; 3 handoffs");
  assert.equal(graphNodeAriaLabel(task({ handoff_count: 1, assigned_to: "" })), "task-0001: Short title; status ready; agent unassigned; priority high; 1 handoff");
});

test("graph code has no hard-coded hex colors", () => {
  for (const file of ["render.ts", "layout.ts"]) assert.doesNotMatch(readFileSync(new URL(`../../../../src/ui/pages/task-board/graph/${file}`, import.meta.url), "utf8"), /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(readFileSync(new URL("../../../../src/ui/pages/task-board/index.ts", import.meta.url), "utf8"), /STATUS_RAILS|#[0-9a-fA-F]{6}\b/);
});

test("the graph defines one neutral and one focused arrow marker with theme token fills", () => {
  const source = readFileSync(new URL("../../../../src/ui/pages/task-board/graph/render.ts", import.meta.url), "utf8");
  assert.match(source, /ARROW_ID/);
  assert.match(source, /ARROW_FOCUS_ID/);
  assert.match(source, /fill-base-content\/40/);
  assert.match(source, /fill-primary/);
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|rgb\(/);
});
