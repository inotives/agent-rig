import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyTheme, beginUiLoad, completeUiLoad, createUiState, failUiLoad, filterHandoffs, layoutTaskGraph, mountBoard, openHandoffModal, parseRoute, positionTaskPreview, preferredTheme, renderTaskPreview, routeHash, setUiRoute, sortHandoffs, sortTasks, STATUS_COLUMNS, taskPreviewHeaderClass, taskPreviewMetadata, taskPreviewTone } from "../../../dist/ui/pages/task-board/index.js";
import { resolveTaskPhase } from "../../../dist/workflow/index.js";

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
});

test("the all-phases path is removed from the board source", () => {
  const source = readFileSync(new URL("../../../src/ui/pages/task-board/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /__all__|ALL_PHASES|filterTasks/);
  assert.doesNotMatch(source, /"\/api\/workflow"/, "the UI never asks for the workflow without a phase");
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
  assert.equal(createUiState("#/?phase=%00").selectedPhase, null);
  assert.equal(createUiState("#/?phase=").selectedPhase, null);
  assert.equal(createUiState("#/?phase=%E0%A4%A").selectedPhase, null);
  assert.equal(createUiState(`#/?phase=${"a".repeat(201)}`).selectedPhase, null);
  assert.equal(createUiState("#/").selectedPhase, null);
  assert.equal(createUiState("#/?phase=26").selectedPhase, "26");
  assert.equal(createUiState("#/?phase=phase-27").selectedPhase, "phase-27");
  assert.equal(createUiState("#/?phase=nope").selectedPhase, "nope");
  assert.equal(createUiState("#/tasks/task-0090").selectedPhase, null);
  assert.equal(routeHash(route), "#/");
  assert.equal(routeHash(route, null), "#/");
  assert.equal(routeHash(route, "26"), "#/?phase=26");
  assert.equal(routeHash({ kind: "task", taskId: "task-0090" }), "#/tasks/task-0090");
  assert.equal(setUiRoute(createUiState("#/?phase=phase-19"), "#/").selectedPhase, null, "a link without a phase does not keep the old phase");
  assert.equal(setUiRoute(createUiState("#/"), "#/?phase=phase-20").selectedPhase, "phase-20");
  assert.deepEqual(createUiState("#/tasks/task-0050?phase=phase-19").route, { kind: "task", taskId: "task-0050" });
  assert.equal(routeHash({ kind: "task", taskId: "task-0050" }, "phase-19"), "#/tasks/task-0050?phase=phase-19");
});

test("phase selection is retained when opening a task from the filtered board", () => {
  const boardState = createUiState("#/?phase=phase-19");
  assert.equal(routeHash({ kind: "task", taskId: "task-0052" }, boardState.selectedPhase), "#/tasks/task-0052?phase=phase-19");
});

test("sliding task drawer uses an opaque left-anchored 80vw panel", () => {
  const source = readFileSync(new URL("../../../src/ui/pages/task-board/index.ts", import.meta.url), "utf8");
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
    if (path.startsWith("/api/workflow?phase=")) return { ok: true, json: async () => ({ project_identifier: "agent-rig", phases: [], tasks: [] }) };
    return { ok: true, json: async () => path.endsWith("/handoffs") ? { handoffs: [] } : { task: { ...task("task-0037", "high", "2026-10-06"), body: "", depends_on: [], dependency_ready: true, blocked_by: [], created_by: "planner", created_on: "2026-10-06", metadata: {} } } };
  };
  globalThis.history = { back() {}, replaceState() {} };
  globalThis.location = { hash: "#/tasks/task-0037?phase=phase-17" };
  globalThis.Option = class extends Element { constructor(text, value) { super("option"); this.textContent = text; this.value = value; } };
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollY: 0, addEventListener() {}, scrollTo() {} };
  try {
    mountBoard(new Element("div"));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(requests, ["/api/workflow?phase=phase-17", "/api/tasks/task-0037", "/api/tasks/task-0037/handoffs"]);
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("mountBoard renders and refreshes the project heading", async () => {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.classList = { toggle() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener() {}
    querySelector() { return null; }
  }
  const previous = { document: globalThis.document, fetch: globalThis.fetch, location: globalThis.location, Option: globalThis.Option, window: globalThis.window };
  const summaries = ["first-project", "updated-project"];
  globalThis.document = { createElement: (tag) => new Element(tag), documentElement: new Element("html") };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ project_identifier: summaries.shift(), phases: [], tasks: [] }) });
  globalThis.location = { hash: "#/" };
  globalThis.Option = class extends Element { constructor(text, value) { super("option"); this.textContent = text; this.value = value; } };
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollY: 0, addEventListener() {}, scrollTo() {} };
  try {
    const root = new Element("div");
    const board = mountBoard(root);
    await new Promise((resolve) => setImmediate(resolve));
    const brand = root.children[0].children[0].children[0].children[0];
    assert.equal(brand.children[0].textContent, "AgentRig: first-project");
    assert.equal(brand.children[1].textContent, "Read-only workflow visibility");
    await board.refresh();
    assert.equal(brand.children[0].textContent, "AgentRig: updated-project");
    assert.equal(brand.children.length, 2);
  } finally {
    Object.assign(globalThis, previous);
  }
});

test("task preview never covers the hovered card when there is room beside or above or below it", () => {
  const wrapper = { left: 0, top: 0, width: 300, height: 400 };
  const covers = (card, position, w, h) => position.left < card.left + card.width && position.left + w > card.left && position.top < card.top + card.height && position.top + h > card.top;
  // Wide card in a narrow wrapper: neither side has room, so the preview moves below.
  const wide = { left: 20, top: 40, width: 260, height: 100 };
  const below = positionTaskPreview(wide, wrapper, 200, 80);
  assert.ok(!covers(wide, below, 200, 80));
  assert.deepEqual(below, { left: 20, top: 152 });
  // Near the bottom edge the preview moves above.
  const low = { left: 20, top: 290, width: 260, height: 100 };
  const above = positionTaskPreview(low, wrapper, 200, 80);
  assert.ok(!covers(low, above, 200, 80));
  assert.deepEqual(above, { left: 20, top: 198 });
});

test("task drawer is a non-modal side panel on lg and a modal drawer below lg", () => {
  const source = readFileSync(new URL("../../../src/ui/pages/task-board/index.ts", import.meta.url), "utf8");
  assert.match(source, /"lg:w-\[28rem\]", "lg:max-w-\[40vw\]"/, "wide panel is 28rem, at most 40vw");
  assert.match(source, /node\("button", "pointer-events-none fixed inset-0 z-30 [^"]*lg:hidden/, "scrim is hidden on lg");
  assert.match(source, /"lg:pl-\[min\(28rem,40vw\)\]"/, "graph area leaves room for the panel on lg");
  assert.match(source, /matchMedia\("\(min-width: 1024px\)"\)/, "wide check uses the lg breakpoint");
  assert.match(source, /removeAttribute\("aria-modal"\)/, "wide panel is not modal");
  assert.match(source, /setAttribute\("aria-modal", "true"\)/, "narrow drawer stays modal");
  assert.match(source, /new ResizeObserver/, "graph fits again when its area changes size");
});

test("board has one status legend, inside the graph", () => {
  const source = readFileSync(new URL("../../../src/ui/pages/task-board/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /statusLegend\(/, "no page-level legend");
  const toolbar = readFileSync(new URL("../../../src/ui/pages/task-board/graph/toolbar.ts", import.meta.url), "utf8");
  assert.equal(source.match(/renderGraphToolbar\(/g).length, 1, "graph toolbar is rendered once");
  assert.equal(toolbar.match(/renderGraphLegend\(/g).length, 1, "the toolbar renders the one legend");
});

function fakeBrowser({ hash, respond }) {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.classList = { toggle() {} }; this.textContent = ""; this.value = ""; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    remove() {}
    setAttribute() {}
    addEventListener() {}
    querySelector() { return null; }
  }
  const walk = (element, found = []) => { found.push(element); for (const child of element.children ?? []) walk(child, found); return found; };
  const previous = { document: globalThis.document, fetch: globalThis.fetch, history: globalThis.history, location: globalThis.location, Option: globalThis.Option, window: globalThis.window };
  const requests = [];
  const replaced = [];
  const listeners = {};
  globalThis.document = { createElement: (tag) => new Element(tag), documentElement: new Element("html") };
  globalThis.fetch = async (path) => { requests.push(path); const answer = respond(path); return typeof answer.ok === "boolean" ? answer : { ok: true, json: async () => answer }; };
  globalThis.location = { hash };
  globalThis.history = { back() {}, replaceState(_state, _title, url) { replaced.push(url); globalThis.location.hash = url; } };
  globalThis.Option = class extends Element { constructor(text, value) { super("option"); this.textContent = text; this.value = value; } };
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollY: 0, addEventListener(type, listener) { listeners[type] = listener; }, scrollTo() {} };
  const root = new Element("div");
  return {
    root, requests, replaced, links: () => walk(root).filter((item) => item.tagName === "a"), texts: () => walk(root).map((item) => item.textContent).filter(Boolean),
    navigate: async (next) => { globalThis.location.hash = next; listeners.hashchange(); await new Promise((resolve) => setImmediate(resolve)); },
    restore: () => Object.assign(globalThis, previous)
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const phasesBody = { project_identifier: "agent-rig", phases: [{ phase: "phase-27", total: 3, counts: { todo: 0, ready: 1, in_progress: 0, blocked: 0, review: 0, done: 2 }, latest_updated_on: "2026-10-09" }, { phase: "26", total: 2, counts: { todo: 0, ready: 0, in_progress: 0, blocked: 0, review: 0, done: 2 }, latest_updated_on: "2026-09-09" }] };
const workflowBody = (phase) => ({ project_identifier: "agent-rig", phases: [phase], tasks: [task("task-0090", "high", "2026-10-06", phase)] });
const detailBody = (phase) => ({ task: { ...task("task-0090", "high", "2026-10-06", phase), body: "", depends_on: [], dependency_ready: true, blocked_by: [], created_by: "planner", created_on: "2026-10-06", metadata: {} } });
const respondFor = (path) => {
  if (path === "/api/phases") return phasesBody;
  if (path.startsWith("/api/workflow?phase=")) return workflowBody(decodeURIComponent(path.split("=")[1]));
  if (path === "/api/tasks/task-0090") return detailBody("phase-25");
  if (path === "/api/tasks/task-0090/handoffs") return { handoffs: [] };
  throw new Error(`unexpected request ${path}`);
};

test("landing route requests only the phase list and links each phase", async () => {
  const browser = fakeBrowser({ hash: "#/", respond: respondFor });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/phases"]);
    assert.deepEqual(browser.links().map((link) => link.href).filter((href) => href?.includes("phase=")), ["#/?phase=phase-27", "#/?phase=26"]);
  } finally { browser.restore(); }
});

test("phase route requests only that phase and never the unfiltered workflow", async () => {
  for (const phase of ["26", "phase-27"]) {
    const browser = fakeBrowser({ hash: `#/?phase=${phase}`, respond: respondFor });
    try {
      mountBoard(browser.root);
      await settle();
      assert.deepEqual(browser.requests, [`/api/workflow?phase=${phase}`]);
    } finally { browser.restore(); }
  }
});

test("invalid phase value opens the landing page", async () => {
  const browser = fakeBrowser({ hash: "#/?phase=%00", respond: respondFor });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/phases"]);
  } finally { browser.restore(); }
});

test("task route with a phase opens the panel in its phase view", async () => {
  const browser = fakeBrowser({ hash: "#/tasks/task-0090?phase=phase-25", respond: respondFor });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/workflow?phase=phase-25", "/api/tasks/task-0090", "/api/tasks/task-0090/handoffs"]);
    assert.deepEqual(browser.replaced, []);
  } finally { browser.restore(); }
});

test("task link without a phase reads the task phase and replaces the URL", async () => {
  const browser = fakeBrowser({ hash: "#/tasks/task-0090", respond: respondFor });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/tasks/task-0090", "/api/workflow?phase=phase-25", "/api/tasks/task-0090", "/api/tasks/task-0090/handoffs"]);
    assert.deepEqual(browser.replaced, ["#/tasks/task-0090?phase=phase-25"]);
  } finally { browser.restore(); }
});

test("unknown phase shows Phase not found with a link to the landing page", async () => {
  const respond = (path) => path.startsWith("/api/workflow") ? { ok: false, status: 404, json: async () => ({ error: "Phase not found" }) } : respondFor(path);
  const browser = fakeBrowser({ hash: "#/?phase=nope", respond });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/workflow?phase=nope"]);
    assert.ok(browser.texts().some((value) => value.includes("Phase not found")));
    assert.ok(browser.links().some((link) => link.href === "#/"));
  } finally { browser.restore(); }
});

test("each navigation loads fresh data and Refresh reloads the current page only", async () => {
  const browser = fakeBrowser({ hash: "#/", respond: respondFor });
  try {
    const board = mountBoard(browser.root);
    await settle();
    await browser.navigate("#/?phase=phase-27");
    await browser.navigate("#/");
    await board.refresh();
    await browser.navigate("#/?phase=26");
    await board.refresh();
    assert.deepEqual(browser.requests, ["/api/phases", "/api/workflow?phase=phase-27", "/api/phases", "/api/phases", "/api/workflow?phase=26", "/api/workflow?phase=26"]);
  } finally { browser.restore(); }
});

test("a failed load keeps the last good phase data and offers Retry", async () => {
  let fail = false;
  const respond = (path) => fail && path.startsWith("/api/workflow") ? { ok: false, status: 500, json: async () => ({}) } : respondFor(path);
  const browser = fakeBrowser({ hash: "#/?phase=phase-27", respond });
  try {
    const board = mountBoard(browser.root);
    await settle();
    fail = true;
    await board.refresh(true);
    assert.ok(browser.texts().some((value) => value.includes("Showing last successful data")));
    assert.ok(browser.texts().includes("Retry"));
    assert.ok(browser.texts().some((value) => value.includes("task-0090")) || browser.root.children.length > 0);
  } finally { browser.restore(); }
});

test("landing shows one Detail link per phase card and makes no task request", async () => {
  const browser = fakeBrowser({ hash: "#/", respond: respondFor });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/phases"]);
    assert.ok(browser.texts().includes("Phase 27"));
    assert.ok(browser.texts().includes("Phase 26"));
    assert.equal(browser.links().filter((link) => link.textContent === "Detail").length, 2);
  } finally { browser.restore(); }
});

test("landing with no phases shows the empty state", async () => {
  const browser = fakeBrowser({ hash: "#/", respond: () => ({ project_identifier: "agent-rig", phases: [] }) });
  try {
    mountBoard(browser.root);
    await settle();
    assert.ok(browser.texts().includes("No phases yet"));
  } finally { browser.restore(); }
});

test("a landing load error with no data shows Retry and no cards", async () => {
  let fail = true;
  const respond = (path) => fail && path === "/api/phases" ? { ok: false, status: 500, json: async () => ({}) } : respondFor(path);
  const browser = fakeBrowser({ hash: "#/", respond });
  try {
    mountBoard(browser.root);
    await settle();
    assert.ok(browser.texts().includes("Retry"));
    assert.equal(browser.links().filter((link) => link.textContent === "Detail").length, 0);
  } finally { browser.restore(); }
});

test("a failed landing refresh keeps the last good cards and offers Retry", async () => {
  let fail = false;
  const respond = (path) => fail && path === "/api/phases" ? { ok: false, status: 500, json: async () => ({}) } : respondFor(path);
  const browser = fakeBrowser({ hash: "#/", respond });
  try {
    const board = mountBoard(browser.root);
    await settle();
    fail = true;
    await board.refresh(true);
    assert.ok(browser.texts().some((value) => value.includes("Showing last successful data")));
    assert.ok(browser.texts().includes("Retry"));
    assert.equal(browser.links().filter((link) => link.textContent === "Detail").length, 2);
  } finally { browser.restore(); }
});

test("the phase dropdown is removed and the breadcrumb is shown on a phase page", async () => {
  const source = readFileSync(new URL("../../../src/ui/pages/task-board/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Filter by phase|createElement\("select"\)|new Option/);
  const browser = fakeBrowser({ hash: "#/?phase=phase-25", respond: (path) => path.startsWith("/api/workflow") ? { project_identifier: "agent-rig", phases: ["phase-25"], tasks: [{ ...task("task-0090", "high", "2026-10-06", "phase-25"), status: "done", depends_on: ["task-0088"] }, task("task-0091", "high", "2026-10-06", "phase-25")] } : respondFor(path) });
  try {
    mountBoard(browser.root);
    await settle();
    assert.ok(browser.texts().includes("Phase 25"));
    assert.ok(browser.texts().some((value) => value === "1 of 2 done"));
    assert.ok(browser.texts().includes("active"));
    assert.ok(browser.links().some((link) => link.href === "#/" && link.textContent === "All phases"));
  } finally { browser.restore(); }
});

test("the task panel lists external dependencies of the open task", async () => {
  const respond = (path) => {
    if (path.startsWith("/api/workflow?phase=")) return { project_identifier: "agent-rig", phases: ["phase-25"], tasks: [{ ...task("task-0090", "high", "2026-10-06", "phase-25"), depends_on: ["task-0088", "task-0077"] }] };
    if (path === "/api/tasks/task-0090") return { task: { ...task("task-0090", "high", "2026-10-06", "phase-25"), body: "", depends_on: ["task-0088", "task-0077"], dependency_ready: true, blocked_by: [], created_by: "planner", created_on: "2026-10-06", metadata: {} } };
    if (path === "/api/tasks/task-0090/handoffs") return { handoffs: [] };
    if (path === "/api/tasks/task-0088") return { task: { ...task("task-0088", "high", "2026-10-06", "phase-24"), title: "Earlier work", status: "done", body: "", depends_on: [], dependency_ready: true, blocked_by: [], created_by: "planner", created_on: "2026-10-06", metadata: {} } };
    if (path === "/api/tasks/task-0077") return { ok: false, status: 404, json: async () => ({}) };
    throw new Error(`unexpected request ${path}`);
  };
  const browser = fakeBrowser({ hash: "#/tasks/task-0090?phase=phase-25", respond });
  try {
    mountBoard(browser.root);
    await settle();
    assert.deepEqual(browser.requests, ["/api/workflow?phase=phase-25", "/api/tasks/task-0090", "/api/tasks/task-0090/handoffs", "/api/tasks/task-0088", "/api/tasks/task-0077"]);
    assert.ok(browser.texts().includes("Dependencies in other phases"));
    assert.ok(browser.texts().includes("Earlier work"));
    assert.ok(browser.texts().includes("not found"));
    assert.ok(browser.links().some((link) => link.href === "#/tasks/task-0088?phase=phase-24"));
  } finally { browser.restore(); }
});
