import assert from "node:assert/strict";
import test from "node:test";
import { computeLineage, countEdgeCrossings, layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";
import { layoutTaskGraph as reExported } from "../../../../dist/ui/pages/task-board/index.js";

const task = (id, depends_on = []) => ({ id, title: id, type: "task", status: "ready", assigned_to: "worker", priority: "normal", phase: "phase-22", updated_on: "2026-01-01", handoff_count: 0, depends_on });

// With ID order, task-c (child of task-b) sits above task-d (child of task-a). Two edges cross.
const crossed = [task("task-a"), task("task-b"), task("task-c", ["task-b"]), task("task-d", ["task-a"])];
const y = (layout, id) => layout.nodes.find(({ task: item }) => item.id === id).y;

test("graph/layout re-exports the same layout function from index", () => {
  assert.equal(reExported, layoutTaskGraph);
});

test("barycenter ordering removes crossings that ID order creates", () => {
  const layout = layoutTaskGraph(crossed);
  assert.equal(countEdgeCrossings(layout), 0);
  assert.ok(y(layout, "task-d") < y(layout, "task-c"));
});

test("barycenter ordering never adds crossings compared with ID order", () => {
  const dense = [task("t1"), task("t2"), task("t3"), task("t4", ["t3", "t1"]), task("t5", ["t2"]), task("t6", ["t1", "t2"]), task("t7", ["t6", "t4"]), task("t8", ["t5"])];
  const layout = layoutTaskGraph(dense);
  const baseline = { ...layout, nodes: layout.nodes.map((node) => ({ ...node, y: node.layer * 1000 + Number(node.task.id.slice(1)) })) };
  assert.ok(countEdgeCrossings(layout) <= countEdgeCrossings(baseline));
});

test("layout is identical for reversed and shuffled input", () => {
  const tasks = [task("task-a"), task("task-b"), task("task-c", ["task-b"]), task("task-d", ["task-a", "task-b"]), task("task-e", ["task-c", "task-d"])];
  const expected = layoutTaskGraph(tasks);
  assert.deepEqual(layoutTaskGraph([...tasks].reverse()), expected);
  assert.deepEqual(layoutTaskGraph([tasks[2], tasks[4], tasks[0], tasks[3], tasks[1]]), expected);
});

test("cyclic tasks stay in the warning row", () => {
  const layout = layoutTaskGraph([task("task-a", ["task-b"]), task("task-b", ["task-a"]), task("task-c")]);
  assert.equal(layout.hasCycle, true);
  const row = (id) => layout.nodes.find(({ task: item }) => item.id === id).row;
  assert.equal(row("task-a"), row("task-b"));
  assert.notEqual(row("task-a"), row("task-c"));
});

test("computeLineage returns ancestors, descendants, and path edges only", () => {
  const layout = layoutTaskGraph([task("a"), task("b", ["a"]), task("c", ["b"]), task("d", ["c"]), task("x", ["a"]), task("y"), task("z", ["y", "b"])]);
  const lineage = computeLineage(layout, "c");
  assert.deepEqual(lineage.ancestors, ["a", "b"]);
  assert.deepEqual(lineage.descendants, ["d"]);
  assert.deepEqual(lineage.edges, [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "d" }]);
  assert.deepEqual(computeLineage(layout, "b").descendants, ["c", "d", "z"]);
  assert.deepEqual(computeLineage(layout, "y").ancestors, []);
  assert.deepEqual(computeLineage(layout, "missing"), { ancestors: [], descendants: [], edges: [] });
});

test("computeLineage terminates on cycles", () => {
  const layout = layoutTaskGraph([task("a", ["b"]), task("b", ["a"])]);
  const lineage = computeLineage(layout, "a");
  assert.deepEqual(lineage.ancestors, ["b"]);
  assert.deepEqual(lineage.descendants, ["b"]);
});
