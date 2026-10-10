import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { externalDependencyCount, externalDependencyIds, externalDependencyLabel } from "../../../../dist/ui/pages/task-board/graph/external.js";
import { layoutTaskGraph } from "../../../../dist/ui/pages/task-board/graph/layout.js";
import { computeEdgePaths } from "../../../../dist/ui/pages/task-board/graph/edges.js";
import { graphNodeAriaLabel, renderGraphSvg } from "../../../../dist/ui/pages/task-board/graph/render.js";
import { phaseHeaderInfo, renderPhaseBreadcrumb } from "../../../../dist/ui/pages/task-board/phase-header.js";
import { MAX_EXTERNAL_LOOKUPS, externalTaskHref, loadExternalDependencies, renderExternalDependencies } from "../../../../dist/ui/pages/task-board/external-panel.js";

const task = (id, over = {}) => ({ id, title: `Title ${id}`, type: "task", status: "ready", assigned_to: "worker", priority: "high", phase: "phase-25", updated_on: "2026-10-09", handoff_count: 0, depends_on: [], ...over });

class Element {
  constructor(tag, ns = "html") { this.tagName = tag; this.ns = ns; this.children = []; this.attrs = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.href = undefined; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  classList = { add() {}, remove() {}, toggle() {} };
}
const walk = (element, found = []) => { found.push(element); for (const child of element.children) walk(child, found); return found; };
const withDom = (run) => { const previous = globalThis.document; globalThis.document = { createElement: (tag) => new Element(tag), createElementNS: (ns, tag) => new Element(tag, ns) }; try { return run(); } finally { globalThis.document = previous; } };
const textOf = (element) => walk(element).map((item) => item.textContent).filter(Boolean).join(" | ");
const handlers = { onSelect() {}, onPreview() {}, onPreviewEnd() {} };

test("externalDependencyIds lists unique dependencies that are not loaded", () => {
  const loaded = new Set(["task-0001", "task-0002"]);
  assert.deepEqual(externalDependencyIds(task("task-0002", { depends_on: ["task-0001", "task-0088", "task-0088", "task-0087"] }), loaded), ["task-0088", "task-0087"]);
  assert.equal(externalDependencyCount(task("task-0002", { depends_on: ["task-0001", "task-0088", "task-0087"] }), loaded), 2);
  assert.equal(externalDependencyCount(task("task-0002", { depends_on: ["task-0001"] }), loaded), 0);
  assert.equal(externalDependencyCount({ ...task("task-0002"), depends_on: undefined }, loaded), 0);
});

test("externalDependencyLabel is a full sentence for screen readers", () => {
  assert.equal(externalDependencyLabel(1), "1 dependency in another phase");
  assert.equal(externalDependencyLabel(2), "2 dependencies in other phases");
});

test("a task with only external dependencies is a root node with no edge", () => {
  const layout = layoutTaskGraph([task("task-0090", { depends_on: ["task-0088"] }), task("task-0091", { depends_on: ["task-0090"] })]);
  const root = layout.nodes.find((item) => item.task.id === "task-0090");
  assert.equal(root.layer, 0);
  assert.equal(root.external, 1);
  assert.equal(layout.nodes.find((item) => item.task.id === "task-0091").external, 0);
  assert.deepEqual(layout.edges, [{ from: "task-0090", to: "task-0091" }]);
  assert.equal(computeEdgePaths(layout).length, 1);
  assert.ok(computeEdgePaths(layout).every((edge) => edge.from !== "task-0088" && edge.to !== "task-0088"));
});

test("a full node shows the N external marker with an accessible label", () => withDom(() => {
  const layout = layoutTaskGraph([task("task-0090", { depends_on: ["task-0088", "task-0087"] }), task("task-0001")]);
  const svg = renderGraphSvg(layout, null, handlers);
  const markers = walk(svg).filter((item) => item.attrs["data-external-marker"]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].attrs.role, "img");
  assert.equal(markers[0].attrs["aria-label"], "2 dependencies in other phases");
  assert.match(textOf(markers[0]), /2 external/);
  const group = walk(svg).find((item) => item.attrs["data-task-id"] === "task-0090");
  assert.match(group.attrs["aria-label"], /2 dependencies in other phases/);
  assert.ok(walk(group).includes(markers[0]));
  const other = walk(svg).find((item) => item.attrs["data-task-id"] === "task-0001");
  assert.ok(!walk(other).some((item) => item.attrs["data-external-marker"]));
  assert.doesNotMatch(other.attrs["aria-label"], /other phase/);
}));

test("a compact node shows the marker too", () => withDom(() => {
  const layout = layoutTaskGraph([task("task-0090", { status: "done", depends_on: ["task-0088"] })], new Set(["task-0090"]));
  const svg = renderGraphSvg(layout, null, handlers);
  const group = walk(svg).find((item) => item.attrs["data-task-id"] === "task-0090");
  assert.ok(walk(group).some((item) => item.attrs["data-done-mark"]));
  const marker = walk(group).find((item) => item.attrs["data-external-marker"]);
  assert.equal(marker.attrs["aria-label"], "1 dependency in another phase");
  assert.match(textOf(marker), /1 external/);
}));

test("graphNodeAriaLabel adds the external count only when it is above zero", () => {
  assert.equal(graphNodeAriaLabel(task("task-0001")), "task-0001: Title task-0001; status ready; agent worker; priority high; 0 handoffs");
  assert.match(graphNodeAriaLabel(task("task-0001"), 3), /; 3 dependencies in other phases$/);
});

test("phaseHeaderInfo gives the label, state, and progress", () => {
  assert.deepEqual(phaseHeaderInfo("phase-26", [task("a", { status: "done" }), task("b")]), { label: "Phase 26", state: "active", done: 1, total: 2, progress: "1 of 2 done" });
  assert.equal(phaseHeaderInfo("26", [task("a", { status: "done" })]).state, "complete");
  assert.equal(phaseHeaderInfo("Unassigned", []).label, "Unassigned");
  assert.equal(phaseHeaderInfo("Unassigned", []).progress, "0 of 0 done");
});

test("the breadcrumb links back to the landing page and shows the state badge and progress", () => withDom(() => {
  const nav = renderPhaseBreadcrumb("phase-26", [task("a", { status: "done" }), task("b")]);
  assert.equal(nav.tagName, "nav");
  assert.equal(nav.attrs["aria-label"], "Breadcrumb");
  const link = walk(nav).find((item) => item.tagName === "a");
  assert.equal(link.href, "#/");
  assert.equal(link.textContent, "All phases");
  const current = walk(nav).find((item) => item.attrs["aria-current"] === "page");
  assert.equal(current.textContent, "Phase 26");
  assert.match(textOf(nav), /active/);
  assert.match(textOf(nav), /1 of 2 done/);
}));

test("the breadcrumb without data shows the phase only", () => withDom(() => {
  const nav = renderPhaseBreadcrumb("phase-99", null);
  assert.match(textOf(nav), /Phase 99/);
  assert.doesNotMatch(textOf(nav), /done|active|complete/);
}));

const detail = (id, phase, status = "done") => ({ task: { ...task(id, { phase, status }), parent: "", dependency_ready: true, blocked_by: [], created_by: "p", created_on: "x", body: "", metadata: {} } });

test("loadExternalDependencies reads each task and marks missing ones", async () => {
  const requested = [];
  const fetchTask = async (id) => { requested.push(id); if (id === "task-0099") throw new Error("Task not found"); if (id === "task-0098") throw new Error("Request failed (500)"); return detail(id, "phase-24").task; };
  const result = await loadExternalDependencies(["task-0088", "task-0099", "task-0098"], fetchTask);
  assert.deepEqual(requested, ["task-0088", "task-0099", "task-0098"]);
  assert.deepEqual(result.entries.map((item) => item.state), ["found", "missing", "error"]);
  assert.equal(result.more, 0);
});

test("loadExternalDependencies asks for at most 20 tasks and counts the rest", async () => {
  assert.equal(MAX_EXTERNAL_LOOKUPS, 20);
  const ids = Array.from({ length: 25 }, (_, index) => `task-${String(index).padStart(4, "0")}`);
  const requested = [];
  const result = await loadExternalDependencies(ids, async (id) => { requested.push(id); return detail(id, "phase-24").task; });
  assert.equal(requested.length, 20);
  assert.equal(result.entries.length, 20);
  assert.equal(result.more, 5);
});

test("the dependency list shows id, title, phase, status, and a link to the phase view", () => withDom(() => {
  const result = { entries: [{ id: "task-0088", state: "found", task: detail("task-0088", "phase-24", "done").task }, { id: "task-0099", state: "missing" }, { id: "task-0098", state: "error" }], more: 3 };
  const section = renderExternalDependencies(result);
  const text = textOf(section);
  assert.match(text, /Dependencies in other phases/);
  assert.match(text, /task-0088/);
  assert.match(text, /Title task-0088/);
  assert.match(text, /Phase 24/);
  assert.match(text, /done/);
  assert.match(text, /task-0099/);
  assert.match(text, /not found/);
  assert.match(text, /task-0098/);
  assert.match(text, /could not load/);
  assert.match(text, /and 3 more/);
  const links = walk(section).filter((item) => item.tagName === "a");
  assert.deepEqual(links.map((link) => link.href), ["#/tasks/task-0088?phase=phase-24"]);
}));

test("no external dependencies gives no section", () => withDom(() => { assert.equal(renderExternalDependencies({ entries: [], more: 0 }), null); }));

test("externalTaskHref opens the task in its own phase view", () => {
  assert.equal(externalTaskHref({ id: "task-0088", phase: "phase-24" }), "#/tasks/task-0088?phase=phase-24");
  assert.equal(externalTaskHref({ id: "task-0088", phase: "a b" }), "#/tasks/task-0088?phase=a%20b");
});

test("the new UI code uses textContent only", () => {
  for (const file of ["external-panel.ts", "phase-header.ts", "graph/external.ts"]) assert.doesNotMatch(readFileSync(new URL(`../../../../src/ui/pages/task-board/${file}`, import.meta.url), "utf8"), /innerHTML|insertAdjacentHTML|outerHTML/);
});
