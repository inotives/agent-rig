import assert from "node:assert/strict";
import test from "node:test";
import { ARROW_FOCUS_ID, ARROW_ID, applyGraphFocus, computeGraphFocus, edgeFocusState, focusTarget, nodeFocusState } from "../../../../dist/ui/pages/task-board/graph/focus.js";
import { layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";

const task = (id, depends_on = []) => ({ id, title: id, type: "task", status: "ready", assigned_to: "worker", priority: "normal", phase: "p", updated_on: "2026-10-09", handoff_count: 0, depends_on });
// a -> b -> c, a -> d, x alone
const layout = layoutTaskGraph([task("a"), task("b", ["a"]), task("c", ["b"]), task("d", ["a"]), task("x")]);

test("focusTarget keeps the selection and uses hover only when nothing is selected", () => {
  assert.equal(focusTarget("a", "x"), "a");
  assert.equal(focusTarget("a", null), "a");
  assert.equal(focusTarget(null, "x"), "x");
  assert.equal(focusTarget(null, null), null);
});

test("computeGraphFocus holds ancestors, descendants, and path edges only", () => {
  const focus = computeGraphFocus(layout, "b");
  assert.deepEqual([...focus.nodes].sort(), ["a", "b", "c"]);
  assert.deepEqual([...focus.edges].sort(), ["a>b", "b>c"]);
  assert.equal(computeGraphFocus(layout, null), null);
  assert.equal(computeGraphFocus(layout, "missing"), null);
});

test("item states are focus, dim, or none", () => {
  const focus = computeGraphFocus(layout, "b");
  assert.equal(nodeFocusState(focus, "a"), "focus");
  assert.equal(nodeFocusState(focus, "d"), "dim");
  assert.equal(nodeFocusState(null, "d"), "none");
  assert.equal(edgeFocusState(focus, "a", "b"), "focus");
  assert.equal(edgeFocusState(focus, "a", "d"), "dim");
  assert.equal(edgeFocusState(null, "a", "d"), "none");
});

function fake(tag, attrs = {}, children = []) {
  const classes = new Set(); const attributes = new Map(Object.entries(attrs));
  return { tag, children, classList: { add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)), has: (n) => classes.has(n) }, getAttribute: (n) => attributes.get(n) ?? null, setAttribute: (n, v) => attributes.set(n, String(v)), removeAttribute: (n) => attributes.delete(n) };
}
const build = () => {
  const nodes = ["a", "b", "c", "d", "x"].map((id) => fake("g", { "data-task-id": id }, [fake("rect", { "data-node-card": "true" })]));
  const edges = layout.edges.map((edge) => fake("path", { "data-edge-from": edge.from, "data-edge-to": edge.to }));
  return { root: fake("svg", {}, [fake("g", {}, edges), ...nodes]), nodes, edges };
};

test("applyGraphFocus changes classes in place and clears them again", () => {
  const { root, nodes, edges } = build();
  const [a, , , d, x] = nodes;
  applyGraphFocus(root, computeGraphFocus(layout, "b"));
  assert.ok(!a.classList.has("opacity-50"));
  assert.ok(a.children[0].classList.has("stroke-primary"));
  assert.equal(a.getAttribute("data-lineage"), "path");
  assert.equal(nodes[1].getAttribute("data-lineage"), "self");
  assert.ok(d.classList.has("opacity-50") && x.classList.has("opacity-50"));
  assert.ok(d.children[0].classList.has("stroke-base-300"));
  const byKey = Object.fromEntries(edges.map((e) => [`${e.getAttribute("data-edge-from")}>${e.getAttribute("data-edge-to")}`, e]));
  assert.ok(byKey["a>b"].classList.has("stroke-primary") && !byKey["a>b"].classList.has("opacity-20"));
  assert.ok(byKey["a>d"].classList.has("opacity-20") && byKey["a>d"].classList.has("stroke-base-content/30"));
  assert.deepEqual(root.children.length, 6);
  applyGraphFocus(root, null);
  for (const item of [...nodes, ...edges]) assert.ok(!item.classList.has("opacity-50") && !item.classList.has("opacity-20"));
  assert.equal(a.getAttribute("data-lineage"), null);
  assert.ok(byKey["a>b"].classList.has("stroke-base-content/30") && !byKey["a>b"].classList.has("stroke-primary"));
});

test("edges use the focused marker only when focused; dimmed edges keep the neutral marker", () => {
  const { root, edges } = build();
  const byKey = Object.fromEntries(edges.map((e) => [`${e.getAttribute("data-edge-from")}>${e.getAttribute("data-edge-to")}`, e]));
  applyGraphFocus(root, computeGraphFocus(layout, "b"));
  assert.equal(byKey["a>b"].getAttribute("marker-end"), `url(#${ARROW_FOCUS_ID})`);
  assert.equal(byKey["b>c"].getAttribute("marker-end"), `url(#${ARROW_FOCUS_ID})`);
  assert.equal(byKey["a>d"].getAttribute("marker-end"), `url(#${ARROW_ID})`);
  assert.notEqual(ARROW_ID, ARROW_FOCUS_ID);
  applyGraphFocus(root, null);
  for (const edge of edges) assert.equal(edge.getAttribute("marker-end"), `url(#${ARROW_ID})`);
});
