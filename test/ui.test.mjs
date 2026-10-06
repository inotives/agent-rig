import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyTheme, beginUiLoad, completeUiLoad, createUiState, failUiLoad, filterHandoffs, filterTasks, layoutTaskGraph, mountBoard, openHandoffModal, parseRoute, positionTaskPreview, preferredTheme, renderTaskPreview, routeHash, setUiRoute, sortHandoffs, sortTasks, STATUS_COLUMNS, taskPreviewHeaderClass, taskPreviewMetadata, taskPreviewTone } from "../dist/ui.js";
import { resolveTaskPhase } from "../dist/workflow-store.js";

const task = (id, priority, updated_on, phase = "phase-17") => ({ id, title: id, type: "task", status: "ready", assigned_to: "worker", priority, phase, updated_on, handoff_count: 0 });
const handoff = (sequence, message) => ({ task_id: "task-0001", sequence, sender: "worker", recipient: "reviewer", status: "review", message, created_at: `2026-10-05T0${sequence}:00:00.000Z`, metadata: {} });

test("phase resolution prefers canonical phase and infers legacy display phase", () => {
  assert.equal(resolveTaskPhase({ phase: " phase-18 ", title: "Phase 17 task" }), "phase-18");
  assert.equal(resolveTaskPhase({ title: "Task" }, "task-0029_phase-17-ui.md"), "phase-17");
  assert.equal(resolveTaskPhase({ title: "Task" }), "Unassigned");
});

test("board utilities preserve status order, sort tasks, and filter phases", () => {
  assert.deepEqual(STATUS_COLUMNS, ["todo", "ready", "in_progress", "blocked", "review", "done"]);
  const tasks = [task("low", "low", "2026-01-01"), task("new", "high", "2026-02-01"), task("old", "high", "2026-01-01", "phase-16")];
  assert.deepEqual(sortTasks(tasks).map(({ id }) => id), ["new", "old", "low"]);
  assert.deepEqual(filterTasks(tasks, "phase-16").map(({ id }) => id), ["old"]);
  assert.equal(filterTasks(tasks, "__all__").length, 3);
});

test("task graph layout is deterministic, layered, and exposes cycles", () => {
  const tasks = [{ ...task("task-a", "normal", "2026-01-01"), depends_on: [] }, { ...task("task-c", "normal", "2026-01-01"), depends_on: ["task-a"] }, { ...task("task-b", "normal", "2026-01-01"), depends_on: ["task-a"] }];
  const first = layoutTaskGraph(tasks);
  const second = layoutTaskGraph([...tasks].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.hasCycle, false);
  assert.equal(first.nodes.find(({ task: item }) => item.id === "task-a").layer, 0);
  assert.equal(first.nodes.find(({ task: item }) => item.id === "task-c").layer, 1);
  assert.deepEqual(first.edges, [{ from: "task-a", to: "task-b" }, { from: "task-a", to: "task-c" }]);
  const cycle = layoutTaskGraph([{ ...task("task-a", "normal", "2026-01-01"), depends_on: ["task-b"] }, { ...task("task-b", "normal", "2026-01-01"), depends_on: ["task-a"] }]);
  assert.equal(cycle.hasCycle, true);
  assert.deepEqual(cycle.nodes.map(({ row }) => row), [1, 1]);
});

test("task graph layout places disconnected components in separate rows", () => {
  const graph = layoutTaskGraph([
    { ...task("task-a", "normal", "2026-01-01"), depends_on: [] },
    { ...task("task-b", "normal", "2026-01-01"), depends_on: ["task-a"] },
    { ...task("task-c", "normal", "2026-01-01"), depends_on: [] }
  ]);
  assert.notEqual(graph.nodes.find(({ task: item }) => item.id === "task-a").row, graph.nodes.find(({ task: item }) => item.id === "task-c").row);
  assert.ok(graph.nodes.find(({ task: item }) => item.id === "task-c").y > graph.nodes.find(({ task: item }) => item.id === "task-a").y);
});

test("task preview position follows the hovered card and flips left near the right edge", () => {
  const wrapper = { left: 100, top: 50, width: 600, height: 400 };
  const previewSize = { width: 180, height: 80 };
  const first = positionTaskPreview({ left: 140, top: 100, width: 220, height: 86 }, wrapper, previewSize.width, previewSize.height);
  const second = positionTaskPreview({ left: 700, top: 260, width: 220, height: 86 }, wrapper, previewSize.width, previewSize.height);
  assert.deepEqual(first, { left: 272, top: 50 });
  assert.deepEqual(second, { left: 408, top: 210 });
  assert.notDeepEqual(first, second);
});

test("task preview uses the accepted semantic tone mapping and structured metadata", () => {
  const statuses = ["todo", "ready", "in_progress", "blocked", "review", "done"];
  assert.deepEqual(statuses.map((status) => taskPreviewTone(status)), ["neutral", "info", "warning", "error", "secondary", "success"]);
  assert.deepEqual(statuses.map((status) => taskPreviewHeaderClass(status)), [
    "bg-neutral text-neutral-content",
    "bg-info text-info-content",
    "bg-warning text-warning-content",
    "bg-error text-error-content",
    "bg-secondary text-secondary-content",
    "bg-success text-success-content"
  ]);
  const previewTask = { ...task("task-0048", "high", "2026-10-06"), title: "Enhance task hover preview", status: "in_progress", phase: "phase-19", handoff_count: 2 };
  assert.deepEqual(taskPreviewMetadata(previewTask), {
    Status: "in progress",
    Assignee: "worker",
    Phase: "phase-19",
    Priority: "high",
    Handoffs: 2
  });
});

test("task preview replaces previous contents when rendering successive tasks", () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes.set(name, value); }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  try {
    const preview = new Element("div");
    const first = { ...task("task-0049", "high", "2026-10-06"), title: "First task", status: "ready" };
    const second = { ...task("task-0050", "normal", "2026-10-06"), title: "Second task", status: "done" };
    renderTaskPreview(preview, first);
    assert.equal(preview.children.length, 2);
    renderTaskPreview(preview, second);
    assert.equal(preview.children.length, 2);
    assert.equal(preview.children[0].children[0].textContent, "Second task");
    assert.equal(preview.children[0].children[1].textContent, "task-0050");
    assert.equal(preview.children[0].className, "px-3 py-2 bg-success text-success-content");
    assert.equal(preview.children[1].children[0].children[0].children[0].textContent, "Status");
    assert.equal(preview.children[1].children[0].children[0].children[0].tagName, "dt");
    assert.equal(preview.attributes.get("role"), "status");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("handoffs sort newest first and search message and metadata", () => {
  const handoffs = [handoff(1, "initial"), { ...handoff(2, "reviewed"), metadata: { ticket: "ABC-42" } }];
  assert.deepEqual(sortHandoffs(handoffs).map(({ sequence }) => sequence), [2, 1]);
  assert.deepEqual(filterHandoffs(handoffs, "abc-42").map(({ sequence }) => sequence), [2]);
  assert.deepEqual(filterHandoffs(handoffs, "").map(({ sequence }) => sequence), [1, 2]);
});

test("theme preference reads system default and persists explicit choice", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  const classNames = new Set();
  globalThis.document = { documentElement: { classList: { toggle: (name, enabled) => enabled ? classNames.add(name) : classNames.delete(name) }, dataset: {} } };
  assert.equal(preferredTheme(), "dark");
  applyTheme("light");
  assert.equal(preferredTheme(), "light");
  assert.equal(document.documentElement.dataset.theme, "light");
  assert.equal(classNames.has("dark"), false);
});

test("native dialog cancel cleans up and restores focus", () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = new Map(); this.classList = { toggle() {} }; }
    append(...children) { this.children.push(...children); }
    remove() { this.removed = true; }
    setAttribute() {}
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    dispatchEvent(event) { this.listeners.get(event.type)?.(event); }
    focus() { this.focused = true; }
    showModal() { this.shownModally = true; }
  }
  const previous = { document: globalThis.document };
  const trigger = new Element("button");
  const body = new Element("body");
  globalThis.document = {
    activeElement: trigger,
    body,
    createElement: (tag) => new Element(tag),
    addEventListener() {},
    removeEventListener() {}
  };
  try {
    openHandoffModal(handoff(1, "details"), trigger);
    const dialog = body.children[0];
    assert.equal(dialog.shownModally, true);
    let prevented = false;
    dialog.dispatchEvent({ type: "cancel", preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(dialog.removed, true);
    assert.equal(trigger.focused, true);
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("SPA state keeps selection, routes, and last good data across load failures", () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const state = createUiState("#/tasks/task%2F0037");
  assert.deepEqual(state.route, { kind: "task", taskId: "task/0037" });
  assert.equal(state.selectedTaskId, "task/0037");
  assert.equal(routeHash(state.route), "#/tasks/task%2F0037");
  assert.deepEqual(parseRoute("#/"), { kind: "board" });
  assert.deepEqual(parseRoute("#/tasks/%E0%A4%A"), { kind: "board" });

  const data = { project_identifier: "agent-rig", phases: [], tasks: [] };
  const ready = completeUiLoad(beginUiLoad(state), data);
  const failed = failUiLoad(setUiRoute(ready, "#/tasks/task-0001"), "offline");
  assert.equal(failed.loadState, "error");
  assert.equal(failed.error, "offline");
  assert.equal(failed.lastGoodData, data);
  assert.equal(failed.selectedTaskId, "task-0001");
});

test("phase selection persists in the hash and restores after UI state recreation", () => {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  const route = { kind: "board" };
  const hash = routeHash(route, "phase-19");
  assert.equal(hash, "#/?phase=phase-19");
  assert.equal(createUiState(hash).selectedPhase, "phase-19");
  assert.equal(createUiState("#/?phase=not-a-phase").selectedPhase, "__all__");
  assert.deepEqual(createUiState("#/tasks/task-0050?phase=phase-19").route, { kind: "task", taskId: "task-0050" });
  assert.equal(routeHash({ kind: "task", taskId: "task-0050" }, "phase-19"), "#/tasks/task-0050?phase=phase-19");
});

test("phase selection is retained when opening a task from the filtered board", () => {
  const boardState = createUiState("#/?phase=phase-19");
  assert.equal(routeHash({ kind: "task", taskId: "task-0052" }, boardState.selectedPhase), "#/tasks/task-0052?phase=phase-19");
});

test("sliding task drawer uses an opaque left-anchored 80vw panel", () => {
  const source = readFileSync(new URL("../src/ui.ts", import.meta.url), "utf8");
  assert.match(source, /classList\.remove\("opacity-70"\)/);
  assert.match(source, /left-0.*w-\[80vw\].*bg-base-100.*opacity-100/);
  assert.match(source, /classList\.toggle\("-translate-x-full", !open\)/);
  assert.match(source, /classList\.toggle\("translate-x-0", open\)/);
});

test("mountBoard preserves a task route from the current location", async () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.classList = { toggle() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    remove() {}
    setAttribute() {}
    addEventListener() {}
    querySelector() { return null; }
  }
  const previous = { document: globalThis.document, fetch: globalThis.fetch, history: globalThis.history, location: globalThis.location, Option: globalThis.Option, window: globalThis.window };
  const requests = [];
  globalThis.document = { createElement: (tag) => new Element(tag), documentElement: new Element("html") };
  globalThis.fetch = async (path) => {
    requests.push(path);
    if (path === "/api/workflow") return { ok: true, json: async () => ({ project_identifier: "agent-rig", phases: [], tasks: [] }) };
    return { ok: true, json: async () => path.endsWith("/handoffs") ? { handoffs: [] } : { task: { ...task("task-0037", "high", "2026-10-06"), body: "", depends_on: [], dependency_ready: true, blocked_by: [], created_by: "planner", created_on: "2026-10-06", metadata: {} } } };
  };
  globalThis.history = { back() {} };
  globalThis.location = { hash: "#/tasks/task-0037" };
  globalThis.Option = class extends Element { constructor(text, value) { super("option"); this.textContent = text; this.value = value; } };
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollY: 0, addEventListener() {}, scrollTo() {} };
  try {
    mountBoard(new Element("div"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(requests, ["/api/workflow", "/api/tasks/task-0037", "/api/tasks/task-0037/handoffs"]);
  } finally {
    Object.assign(globalThis, previous);
  }
});
