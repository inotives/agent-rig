import assert from "node:assert/strict";
import test from "node:test";
import { computeEdgePaths } from "../../../../dist/ui/pages/task-board/graph/edges.js";
import { layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";

const task = (id, depends_on = []) => ({ id, title: id, type: "task", status: "ready", assigned_to: "worker", priority: "high", phase: "p", updated_on: "2026-10-09", handoff_count: 0, depends_on });
const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);

test("adjacent-layer edge keeps the single cubic curve", () => {
  const layout = layoutTaskGraph([task("a"), task("b", ["a"])]);
  const [edge] = computeEdgePaths(layout);
  assert.match(edge.d, /^M [\d.]+ [\d.]+ C /);
  assert.equal((edge.d.match(/C/g) ?? []).length, 1);
  const a = layout.nodes[0]; const b = layout.nodes[1];
  assert.deepEqual(nums(edge.d).slice(0, 2), [a.x + a.width, a.y + a.height / 2]);
  assert.deepEqual(nums(edge.d).slice(-2), [b.x - 3, b.y + b.height / 2]);
});

test("long edge runs outside the cards of the layers it skips", () => {
  const layout = layoutTaskGraph([task("a"), task("b", ["a"]), task("c", ["b"]), task("d", ["a", "c"])]);
  const long = computeEdgePaths(layout).find((e) => e.from === "a" && e.to === "d");
  const middle = layout.nodes.filter((n) => n.layer === 1 || n.layer === 2);
  const points = nums(long.d);
  for (let i = 0; i + 3 < points.length; i += 2) {
    // horizontal runs have equal y at both ends
    if (points[i + 1] !== points[i + 3]) continue;
    const y = points[i + 1]; const [x1, x2] = [points[i], points[i + 2]].sort((p, q) => p - q);
    for (const n of middle) if (x2 > n.x && x1 < n.x + n.width) assert.ok(y < n.y || y > n.y + n.height, `run at y=${y} crosses ${n.task.id}`);
  }
});

test("long edges in the same channel use different lanes", () => {
  const layout = layoutTaskGraph([task("a"), task("b"), task("c"), task("m", ["a"]), task("n", ["m"]), task("z", ["a", "b", "c", "n"])]);
  const longs = computeEdgePaths(layout).filter((e) => ["a", "b", "c"].includes(e.from) && e.to === "z").filter((e) => nums(e.d).length > 8);
  assert.ok(longs.length >= 2);
  assert.equal(new Set(longs.map((e) => e.d)).size, longs.length);
  const channels = longs.map((e) => nums(e.d)[7]);
  assert.equal(new Set(channels).size, longs.length);
});

test("computeEdgePaths is deterministic and keeps one path per edge", () => {
  const tasks = [task("a"), task("b", ["a"]), task("c", ["b"]), task("d", ["a", "c"])];
  const first = computeEdgePaths(layoutTaskGraph(tasks));
  assert.deepEqual(first, computeEdgePaths(layoutTaskGraph([...tasks].reverse())));
  assert.equal(first.length, 4);
});
