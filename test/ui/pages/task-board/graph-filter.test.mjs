import assert from "node:assert/strict";
import test from "node:test";
import { EMPTY_FILTER, agentOptions, computeFilterMatch, isFilterActive, taskMatchesFilter, toggleStatus } from "../../../../dist/ui/pages/task-board/graph/filter.js";
import { applyGraphFocus, computeGraphFocus } from "../../../../dist/ui/pages/task-board/graph/focus.js";
import { layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";
import { viewForRect } from "../../../../dist/ui/pages/task-board/graph/viewport.js";

const task = (id, title, status, assigned_to, depends_on = []) => ({ id, title, type: "task", status, assigned_to, priority: "normal", phase: "p", updated_on: "2026-10-09", handoff_count: 0, depends_on });
const tasks = [task("task-0001", "Build the Graph", "done", "worker"), task("task-0002", "Review edges", "review", "reviewer", ["task-0001"]), task("task-0003", "Write docs", "ready", "", ["task-0001"]), task("task-0004", "Fix graph bug", "ready", "worker", ["task-0002"])];
const layout = layoutTaskGraph(tasks);
const f = (patch) => ({ ...EMPTY_FILTER, ...patch });

test("empty filter is inactive and matches every task", () => {
  assert.equal(isFilterActive(EMPTY_FILTER), false);
  const match = computeFilterMatch(layout, EMPTY_FILTER);
  assert.equal(match.active, false);
  assert.equal(match.count, 4);
  assert.equal(match.ids, null);
});

test("text search matches id, title, and agent, case-insensitive", () => {
  assert.ok(taskMatchesFilter(tasks[0], f({ query: "TASK-0001" })));
  assert.ok(taskMatchesFilter(tasks[0], f({ query: "graph" })));
  assert.ok(taskMatchesFilter(tasks[1], f({ query: "REVIEWER" })));
  assert.ok(!taskMatchesFilter(tasks[2], f({ query: "worker" })));
  assert.ok(taskMatchesFilter(tasks[2], f({ query: "  docs " })), "query is trimmed");
});

test("status set matches any selected status", () => {
  assert.deepEqual([...computeFilterMatch(layout, toggleStatus(EMPTY_FILTER, "ready")).ids].sort(), ["task-0003", "task-0004"]);
  const two = toggleStatus(toggleStatus(EMPTY_FILTER, "ready"), "done");
  assert.equal(computeFilterMatch(layout, two).count, 3);
  assert.equal(toggleStatus(two, "done").statuses.has("done"), false);
  assert.equal(EMPTY_FILTER.statuses.size, 0, "toggle does not change the input");
});

test("agent filter matches the agent, and unassigned matches tasks without agent", () => {
  assert.equal(computeFilterMatch(layout, f({ agent: "worker" })).count, 2);
  assert.deepEqual([...computeFilterMatch(layout, f({ agent: "unassigned" })).ids], ["task-0003"]);
  assert.deepEqual(agentOptions(layout), ["reviewer", "unassigned", "worker"]);
});

test("filters combine with AND and the first match follows layout order", () => {
  const match = computeFilterMatch(layout, f({ query: "graph", statuses: new Set(["ready"]), agent: "worker" }));
  assert.deepEqual([...match.ids], ["task-0004"]);
  assert.equal(match.count, 1);
  assert.equal(match.first, "task-0004");
  const all = computeFilterMatch(layout, f({ query: "graph" }));
  assert.equal(all.count, 2);
  assert.equal(all.first, layout.nodes.find((n) => all.ids.has(n.task.id)).task.id);
  assert.equal(computeFilterMatch(layout, f({ query: "zzz" })).first, null);
});

test("reset gives an inactive filter", () => { assert.equal(isFilterActive(f({ query: "a" })), true); assert.equal(isFilterActive(f({ agent: "x" })), true); assert.equal(isFilterActive(toggleStatus(EMPTY_FILTER, "done")), true); assert.equal(isFilterActive(f({ query: "   " })), false); });

function fake(tag, attrs = {}, children = []) {
  const classes = new Set(); const attributes = new Map(Object.entries(attrs));
  return { tag, children, classList: { add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)), has: (n) => classes.has(n) }, getAttribute: (n) => attributes.get(n) ?? null, setAttribute: (n, v) => attributes.set(n, String(v)), removeAttribute: (n) => attributes.delete(n) };
}
const build = () => {
  const nodes = tasks.map((t) => fake("g", { "data-task-id": t.id }, [fake("rect", { "data-node-card": "true" })]));
  const edges = layout.edges.map((e) => fake("path", { "data-edge-from": e.from, "data-edge-to": e.to }));
  return { root: fake("svg", {}, [fake("g", {}, edges), ...nodes]), nodes, edges };
};

test("filter dims non-matching nodes and their edges, and clears again", () => {
  const { root, nodes, edges } = build();
  const match = computeFilterMatch(layout, f({ statuses: new Set(["ready"]) }));
  applyGraphFocus(root, null, match.ids);
  assert.ok(nodes[0].classList.has("opacity-50") && nodes[1].classList.has("opacity-50"));
  assert.ok(!nodes[2].classList.has("opacity-50") && !nodes[3].classList.has("opacity-50"));
  assert.equal(nodes[0].getAttribute("data-lineage"), null, "filter does not set lineage state");
  for (const edge of edges) assert.ok(edge.classList.has("opacity-20"), "no edge joins two matches here");
  applyGraphFocus(root, null, null);
  for (const item of [...nodes, ...edges]) assert.ok(!item.classList.has("opacity-50") && !item.classList.has("opacity-20"));
});

test("an edge stays normal when both ends match", () => {
  const { root, edges } = build();
  applyGraphFocus(root, null, new Set(["task-0001", "task-0002"]));
  const byKey = Object.fromEntries(edges.map((e) => [`${e.getAttribute("data-edge-from")}>${e.getAttribute("data-edge-to")}`, e]));
  assert.ok(!byKey["task-0001>task-0002"].classList.has("opacity-20"));
  assert.ok(byKey["task-0001>task-0003"].classList.has("opacity-20"));
});

test("lineage focus has priority over filter dimming, and the filter returns when focus clears", () => {
  const { root, nodes } = build();
  const ids = computeFilterMatch(layout, f({ query: "docs" })).ids;
  applyGraphFocus(root, computeGraphFocus(layout, "task-0002"), ids);
  // lineage of task-0002: task-0001 and task-0004. task-0003 is outside the lineage.
  assert.ok(!nodes[0].classList.has("opacity-50") && !nodes[1].classList.has("opacity-50") && !nodes[3].classList.has("opacity-50"), "lineage nodes are not dimmed by the filter");
  assert.ok(nodes[2].classList.has("opacity-50"), "the matching task outside the lineage is dimmed by focus");
  applyGraphFocus(root, null, ids);
  assert.ok(nodes[0].classList.has("opacity-50") && !nodes[2].classList.has("opacity-50"));
});

test("viewForRect centres a rectangle and never zooms in above the limit", () => {
  const view = viewForRect({ x: 1000, y: 500, width: 240, height: 90 }, { width: 800, height: 400 });
  assert.equal(view.scale, 1);
  assert.equal(view.tx + 1120 * view.scale, 400);
  assert.equal(view.ty + 545 * view.scale, 200);
  const big = viewForRect({ x: 0, y: 0, width: 4000, height: 100 }, { width: 800, height: 400 });
  assert.ok(big.scale < 1);
  assert.equal(viewForRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 }).scale, 1);
});
