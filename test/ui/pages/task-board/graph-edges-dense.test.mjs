import assert from "node:assert/strict";
import test from "node:test";
import { computeEdgePaths, routeEdges } from "../../../../dist/ui/pages/task-board/graph/edges.js";
import { layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";
import { compactTaskIds } from "../../../../dist/ui/pages/task-board/graph/compact.js";

const ARROW_GAP = 3;
const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
const pairs = (d) => { const n = nums(d); const out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] }); return out; };

// Deterministic pseudo-random generator (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Graph with `count` tasks in `layers` layers. Each task has one dependency in the layer before and `extra` random older ones. */
function denseTasks(seed, count, layers, extra, doneRatio) {
  const random = seeded(seed);
  const perLayer = Math.ceil(count / layers);
  const ids = Array.from({ length: count }, (_, i) => `task-${String(i + 1).padStart(4, "0")}`);
  const layerOf = (i) => Math.floor(i / perLayer);
  return ids.map((id, i) => {
    const layer = layerOf(i); const deps = new Set();
    if (layer > 0) {
      const prev = ids.filter((_, j) => layerOf(j) === layer - 1);
      deps.add(prev[Math.floor(random() * prev.length)]);
      for (let k = 0; k < extra; k += 1) { const older = ids.filter((_, j) => layerOf(j) < layer - 1); if (older.length) deps.add(older[Math.floor(random() * older.length)]); }
    }
    return { id, title: id, type: "task", status: random() < doneRatio ? "done" : "ready", assigned_to: "worker", priority: "normal", phase: "p", updated_on: "2026-10-09", handoff_count: 0, depends_on: [...deps] };
  });
}

function longEdgeCount(layout) {
  const byId = new Map(layout.nodes.map((n) => [n.task.id, n]));
  return layout.edges.filter((e) => byId.get(e.to).layer - byId.get(e.from).layer >= 2).length;
}

function checkAll(name, tasks, compact) {
  const layoutOf = (list) => layoutTaskGraph(list, compact ? compactTaskIds(list) : new Set());
  const layout = layoutOf(tasks);
  const paths = computeEdgePaths(layout);
  const byId = new Map(layout.nodes.map((n) => [n.task.id, n]));
  assert.equal(paths.length, layout.edges.length, `${name}: one path per edge`);
  const bad = { bounds: 0, direction: 0, gap: 0 };
  for (const edge of paths) {
    const points = pairs(edge.d); const to = byId.get(edge.to);
    if (points.some((p) => p.x < 0 || p.x > layout.width || p.y < 0 || p.y > layout.height)) bad.bounds += 1;
    const last = points[points.length - 1]; const before = points[points.length - 2];
    if (!(before.y === last.y && before.x < last.x)) bad.direction += 1;
    if (!(last.x === to.x - ARROW_GAP && last.y === to.y + to.height / 2)) bad.gap += 1;
  }
  return { layout, paths, bad };
}

for (const [name, tasks, compact] of [
  ["40 tasks, many long edges", denseTasks(11, 40, 5, 3, 0), false],
  ["40 tasks, many long edges, compact", denseTasks(12, 40, 5, 4, 0.6), true],
  ["300 tasks", denseTasks(21, 300, 12, 3, 0), false],
  ["300 tasks, compact", denseTasks(22, 300, 12, 3, 0.6), true],
]) {
  test(`dense graph (${name}): every edge is inside the layout, ends going right 3px before the target`, () => {
    const { layout, bad } = checkAll(name, tasks, compact);
    assert.ok(longEdgeCount(layout) >= (tasks.length === 40 ? 60 : 200), `test graph has many long edges (${longEdgeCount(layout)})`);
    assert.deepEqual(bad, { bounds: 0, direction: 0, gap: 0 }, `${name}: failing edge counts (of ${layout.edges.length})`);
  });

  test(`dense graph (${name}): output is identical for reversed input`, () => {
    const forward = checkAll(name, tasks, compact);
    const reversed = checkAll(name, [...tasks].reverse(), compact);
    assert.deepEqual(reversed.paths, forward.paths);
    assert.equal(reversed.layout.height, forward.layout.height);
  });
}

test("normal case: arrow goes right and stops 3px before the target card", () => {
  const task = (id, depends_on = []) => ({ id, title: id, type: "task", status: "ready", assigned_to: "worker", priority: "high", phase: "p", updated_on: "2026-10-09", handoff_count: 0, depends_on });
  const layout = layoutTaskGraph([task("a"), task("b", ["a"]), task("c", ["b"]), task("d", ["a", "c"])]);
  for (const edge of computeEdgePaths(layout)) {
    const to = layout.nodes.find((n) => n.task.id === edge.to);
    const points = pairs(edge.d); const last = points[points.length - 1]; const before = points[points.length - 2];
    assert.equal(last.x, to.x - ARROW_GAP);
    assert.equal(last.y, to.y + to.height / 2);
    assert.equal(before.y, last.y);
    assert.ok(before.x < last.x, `${edge.from}>${edge.to} ends going right`);
  }
});

test("few long edges keep the old top lane and add no extra layout height", () => {
  const task = (id, depends_on = []) => ({ id, title: id, type: "task", status: "ready", assigned_to: "worker", priority: "high", phase: "p", updated_on: "2026-10-09", handoff_count: 0, depends_on });
  const layout = layoutTaskGraph([task("a"), task("b", ["a"]), task("c", ["b"]), task("d", ["a", "c"])]);
  assert.equal(layout.nodes[0].y, 18);
  assert.equal(layout.height, 18 + 100 + 18);
  const long = computeEdgePaths(layout).find((e) => e.from === "a" && e.to === "d");
  assert.ok(nums(long.d).includes(18 - 9));
});

function outsideCount(layout) {
  return computeEdgePaths(layout).filter((edge) => pairs(edge.d).some((p) => p.x < 0 || p.x > layout.width || p.y < 0 || p.y > layout.height)).length;
}

test("top and bottom channel both overflow: no edge point is outside the layout", () => {
  // 10 tasks in 5 layers: lanes above the cards push the nodes down, and lanes below the cards need more height.
  const tasks = denseTasks(16, 10, 5, 4, 0);
  const layout = layoutTaskGraph(tasks);
  assert.ok(Math.min(...layout.nodes.map((n) => n.y)) > 18, "test graph has lanes above the cards");
  assert.equal(outsideCount(layout), 0);
});

test("random acyclic graphs: no edge point is outside the layout, with and without compact nodes", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const random = seeded(seed * 7919);
    const count = 5 + Math.floor(random() * 56);
    const tasks = denseTasks(seed, count, 3 + Math.floor(random() * 6), 1 + Math.floor(random() * 4), seed % 2 ? 0 : 0.6);
    for (const compact of [false, true]) {
      const layout = layoutTaskGraph(tasks, compact ? compactTaskIds(tasks) : new Set());
      assert.equal(outsideCount(layout), 0, `seed ${seed}, ${count} tasks, compact ${compact}`);
    }
  }
});

/** Count crossings between long-edge lanes (horizontal runs against vertical runs). */
function laneCrossings(layout) {
  const runs = [...routeEdges(layout.nodes, layout.edges).paths.values()].map((points) => {
    const h = []; const v = [];
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i - 1]; const q = points[i];
      if (p.y === q.y && p.x !== q.x) h.push({ y: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) });
      else if (p.x === q.x && p.y !== q.y) v.push({ x: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) });
    }
    return { h, v };
  });
  let count = 0;
  const hit = (h, v) => h.a < v.x && v.x < h.b && v.a < h.y && h.y < v.b;
  for (let i = 0; i < runs.length; i += 1) for (let j = i + 1; j < runs.length; j += 1) {
    for (const h of runs[i].h) for (const v of runs[j].v) if (hit(h, v)) count += 1;
    for (const h of runs[j].h) for (const v of runs[i].v) if (hit(h, v)) count += 1;
  }
  return count;
}

test("a channel with more than 3 lanes: the chosen lane order has fewer crossings than the ID order", () => {
  const layout = layoutTaskGraph(denseTasks(25, 10, 5, 2, 0));
  const ID_ORDER_CROSSINGS = 14; // measured with the lane re-ordering switched off
  assert.ok(laneCrossings(layout) < ID_ORDER_CROSSINGS, `lane crossings ${laneCrossings(layout)}`);
});
