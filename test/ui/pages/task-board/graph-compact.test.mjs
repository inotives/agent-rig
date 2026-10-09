import assert from "node:assert/strict";
import test from "node:test";
import { COMPACT_DEFAULT_THRESHOLD, collapseDoneDefault, compactTaskIds } from "../../../../dist/ui/pages/task-board/graph/compact.js";
import { COMPACT_NODE_HEIGHT, FULL_NODE_HEIGHT, countEdgeCrossings, layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";
import { computeEdgePaths } from "../../../../dist/ui/pages/task-board/graph/edges.js";

const task = (id, status, depends_on = []) => ({ id, title: id, type: "task", status, assigned_to: "worker", priority: "normal", phase: "phase-23", updated_on: "2026-01-01", handoff_count: 0, depends_on });

test("compactTaskIds: every done task compacts, even with an open dependent", () => {
  const tasks = [task("a", "done"), task("b", "done", ["a"]), task("c", "ready", ["b"]), task("d", "done"), task("e", "done", ["d"]), task("f", "ready")];
  // b has an open dependent (c) and still compacts. c and f are not done.
  assert.deepEqual([...compactTaskIds(tasks)].sort(), ["a", "b", "d", "e"]);
});

test("compactTaskIds: a done task with an open dependent is compact; an open task is never compact", () => {
  const review = [task("a", "done"), task("b", "in_progress", ["a"]), task("c", "review", ["a"])];
  assert.deepEqual([...compactTaskIds(review)], ["a"]);
  for (const status of ["todo", "ready", "blocked", "in_progress", "review"]) assert.equal(compactTaskIds([task("x", status)]).size, 0, status);
  assert.deepEqual([...compactTaskIds([task("a", "done"), task("b", "review")])], ["a"]);
  assert.equal(compactTaskIds([]).size, 0);
});

test("compactTaskIds ignores dependents outside the visible tasks", () => {
  assert.deepEqual([...compactTaskIds([task("a", "done")])], ["a"]);
});

test("collapseDoneDefault is on above 30 visible tasks", () => {
  assert.equal(COMPACT_DEFAULT_THRESHOLD, 30);
  assert.equal(collapseDoneDefault(30), false);
  assert.equal(collapseDoneDefault(31), true);
  assert.equal(collapseDoneDefault(0), false);
});

test("layout gives compact nodes about one third of the height and no overlap", () => {
  const tasks = [task("a", "done"), task("b", "done"), task("c", "ready"), task("d", "done", ["a"]), task("e", "ready", ["d", "c"])];
  const compact = compactTaskIds(tasks);
  const layout = layoutTaskGraph(tasks, compact);
  for (const node of layout.nodes) {
    assert.equal(node.height, compact.has(node.task.id) ? COMPACT_NODE_HEIGHT : FULL_NODE_HEIGHT);
    assert.equal(node.compact, compact.has(node.task.id));
  }
  assert.ok(Math.abs(COMPACT_NODE_HEIGHT * 3 - FULL_NODE_HEIGHT) <= 6);
  for (const a of layout.nodes) for (const b of layout.nodes) {
    if (a === b || a.layer !== b.layer) continue;
    assert.ok(a.y + a.height <= b.y || b.y + b.height <= a.y, `${a.task.id} overlaps ${b.task.id}`);
  }
  for (const node of layout.nodes) assert.ok(node.y + node.height <= layout.height);
});

test("compact layout is shorter than the full layout and is deterministic", () => {
  const tasks = Array.from({ length: 8 }, (_, i) => task(`t${i}`, "done"));
  const full = layoutTaskGraph(tasks);
  const compact = layoutTaskGraph(tasks, compactTaskIds(tasks));
  assert.ok(compact.height < full.height * 0.6);
  assert.deepEqual(layoutTaskGraph([...tasks].reverse(), compactTaskIds(tasks)), compact);
});

test("compact layout keeps crossing reduction and long edges stay inside the layout", () => {
  const tasks = [task("task-a", "done"), task("task-b", "done"), task("task-c", "done", ["task-b"]), task("task-d", "done", ["task-a"]), task("task-e", "ready", ["task-d", "task-c"]), task("task-f", "ready", ["task-a", "task-e"])];
  const layout = layoutTaskGraph(tasks, compactTaskIds(tasks));
  assert.equal(countEdgeCrossings(layout), 0);
  const paths = computeEdgePaths(layout);
  assert.equal(paths.length, layout.edges.length);
  for (const path of paths) assert.ok(!path.d.includes("NaN"));
});

class FakeElement {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = new Map(); this.listeners = new Map(); this.classes = new Set(); this.className = ""; this.textContent = ""; this.value = ""; this.disabled = false; }
  get classList() { const self = this; return { add: (...n) => n.forEach((x) => self.classes.add(x)), remove: (...n) => n.forEach((x) => self.classes.delete(x)), contains: (n) => self.classes.has(n) }; }
  append(...c) { this.children.push(...c); }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  addEventListener(t, l) { const list = this.listeners.get(t) ?? []; list.push(l); this.listeners.set(t, list); }
  fire(t, event = {}) { for (const l of this.listeners.get(t) ?? []) l({ preventDefault() { this.prevented = true; }, ...event }); }
  querySelectorAll(selector) { return selector === "button[data-status]" ? this.findAll((e) => e.tagName === "button" && e.dataset.status !== undefined) : []; }
  findAll(match) { return [...(match(this) ? [this] : []), ...this.children.flatMap((c) => (c instanceof FakeElement ? c.findAll(match) : []))]; }
}
async function withFakeDom(run) {
  const previous = globalThis.document; const previousOption = globalThis.Option;
  globalThis.Option = class extends FakeElement { constructor(text, value) { super("option"); this.textContent = text; this.value = value; } };
  globalThis.document = { createElement: (tag) => new FakeElement(tag), createElementNS: (_ns, tag) => new FakeElement(tag) };
  try { return await run(); } finally { globalThis.document = previous; globalThis.Option = previousOption; }
}

test("Collapse done toggle flips aria-pressed, class, and the reported value in both directions", async () => {
  const { renderGraphToolbar } = await import("../../../../dist/ui/pages/task-board/graph/toolbar.js");
  await withFakeDom(() => {
    const seen = [];
    const bar = renderGraphToolbar({ query: "", statuses: new Set(), agent: "" }, [], { onChange() {}, onJump() {} }, { value: false, onChange: (v) => seen.push(v) });
    const [button] = bar.element.findAll((e) => e.dataset.graphCollapse === "true");
    assert.ok(button);
    assert.equal(button.textContent, "Collapse done");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.ok(button.classList.contains("btn-outline") && !button.classList.contains("btn-primary"));
    button.fire("click");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.ok(button.classList.contains("btn-primary") && !button.classList.contains("btn-outline"));
    button.fire("click");
    assert.equal(button.getAttribute("aria-pressed"), "false");
    assert.ok(button.classList.contains("btn-outline"));
    assert.deepEqual(seen, [true, false]);
    const on = renderGraphToolbar({ query: "", statuses: new Set(), agent: "" }, [], { onChange() {}, onJump() {} }, { value: true, onChange() {} });
    assert.equal(on.element.findAll((e) => e.dataset.graphCollapse === "true")[0].getAttribute("aria-pressed"), "true");
    const none = renderGraphToolbar({ query: "", statuses: new Set(), agent: "" }, [], { onChange() {}, onJump() {} });
    assert.equal(none.element.findAll((e) => e.dataset.graphCollapse === "true").length, 0);
  });
});

test("renderGraphSvg draws a compact node with the same accessible name and behaviour as a full node", async () => {
  const { renderGraphSvg, graphNodeAriaLabel } = await import("../../../../dist/ui/pages/task-board/graph/render.js");
  await withFakeDom(() => {
    const tasks = [{ ...task("task-a", "done"), title: "Finished work" }, task("task-b", "ready")];
    const layout = layoutTaskGraph(tasks, new Set(["task-a"]));
    const calls = [];
    const handlers = { onSelect: (id) => calls.push(id), onPreview() {}, onPreviewEnd() {} };
    const nodes = (selected) => renderGraphSvg(layout, selected, handlers).findAll((e) => e.getAttribute("data-task-id") !== null);
    const [compact, full] = nodes(null);
    assert.equal(compact.getAttribute("data-task-id"), "task-a");
    assert.equal(full.getAttribute("data-task-id"), "task-b");
    assert.equal(compact.getAttribute("role"), "button");
    assert.equal(compact.getAttribute("tabindex"), "0");
    const label = compact.getAttribute("aria-label");
    assert.equal(label, graphNodeAriaLabel(tasks[0]));
    assert.ok(label.includes("task-a") && label.includes("Finished work") && label.includes("done"));
    assert.equal(compact.findAll((e) => e.getAttribute("data-done-mark") === "true").length, 1);
    assert.equal(full.findAll((e) => e.getAttribute("data-done-mark") === "true").length, 0);
    const card = compact.findAll((e) => e.getAttribute("data-node-card") === "true")[0];
    assert.equal(card.getAttribute("height"), String(COMPACT_NODE_HEIGHT));
    compact.fire("click");
    compact.fire("keydown", { key: "Enter" });
    compact.fire("keydown", { key: " " });
    compact.fire("keydown", { key: "a" });
    assert.deepEqual(calls, ["task-a", "task-a", "task-a"]);
    assert.equal(compact.findAll((e) => e.getAttribute("data-selected-ring") === "true").length, 0);
    assert.equal(compact.getAttribute("aria-current"), null);
    const [selectedCompact] = nodes("task-a");
    assert.equal(selectedCompact.findAll((e) => e.getAttribute("data-selected-ring") === "true").length, 1);
    assert.equal(selectedCompact.getAttribute("aria-current"), "true");
  });
});
