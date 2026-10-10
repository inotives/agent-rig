import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUiServer } from "../../../dist/ui/core/server.js";
import { SQLiteWorkflowStore } from "../../../dist/workflow/index.js";
import { mountSlidingBoard } from "../../../dist/ui/pages/task-board/index.js";

class FakeElement {
  constructor(tagName, ownerDocument = null) { this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentNode = null; this.attributes = new Map(); this.listeners = new Map(); this.dataset = {}; this.classList = { values: new Set(), add: (...names) => names.forEach((name) => this.classList.values.add(name)), remove: (...names) => names.forEach((name) => this.classList.values.delete(name)), toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name) }; this.value = ""; this.disabled = false; this.type = ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return [this._text ?? "", ...this.children.map((child) => child.textContent)].join(""); }
  get firstElementChild() { return this.children[0] ?? null; }
  set innerHTML(value) { this._text = String(value ?? "").replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"); this.children = []; }
  get innerHTML() { return this._text ?? ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
  append(...children) { for (const child of children.flat()) { if (!child) continue; child.parentNode = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); }
  click() { this.focus(); this.dispatchEvent({ type: "click", target: this }); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  querySelectorAll(selector) { return this.findAll(selector); }
  querySelector(selector) { if (selector === "main > aside") return this.findAll("main")[0]?.children.find((child) => child.tagName === "ASIDE") ?? null; return this.findAll(selector)[0] ?? null; }
  findAll(selector) {
    const matches = (element) => selector === "[data-workflow-alert]"
      ? element.dataset.workflowAlert === "true"
      : selector.startsWith("#") ? element.getAttribute("id") === selector.slice(1)
        : selector.startsWith("[") ? element.getAttribute(selector.slice(1, -1).split("=")[0]) !== undefined
          : element.tagName.toLowerCase() === selector.toLowerCase();
    return [ ...(matches(this) ? [this] : []), ...this.children.flatMap((child) => child.findAll(selector)) ];
  }
}

class FakeDocument {
  constructor() { this.documentElement = new FakeElement("html", this); this.body = new FakeElement("body", this); this.root = new FakeElement("div", this); this.root.setAttribute("id", "app"); this.body.append(this.root); this.listeners = new Map(); this.activeElement = null; }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createElementNS(_namespace, tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) { return this.body.querySelector(selector); }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener)); }
}

function installBrowserHarness() {
  const document = new FakeDocument();
  const storage = new Map();
  const windowListeners = new Map();
  const scrollCalls = [];
  const previous = { document: globalThis.document, window: globalThis.window, location: globalThis.location, history: globalThis.history, localStorage: globalThis.localStorage, Option: globalThis.Option, fetch: globalThis.fetch };
  globalThis.document = document;
  globalThis.window = { matchMedia: () => ({ matches: false }), scrollY: 0, scrollTo: (...values) => scrollCalls.push(values.length > 1 ? values[1] : values[0]), addEventListener: (type, listener) => windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]), dispatchEvent: (event) => { for (const listener of windowListeners.get(event.type) ?? []) listener(event); } };
  globalThis.location = { hash: "" };
  globalThis.history = {
    back: () => { globalThis.location.hash = ""; globalThis.window.dispatchEvent({ type: "hashchange" }); },
    forward: () => { globalThis.location.hash = "#/tasks/task-0001?phase=phase-17"; globalThis.window.dispatchEvent({ type: "hashchange" }); },
    replaceState: (_state, _title, url) => { globalThis.location.hash = url; },
  };
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.Option = class extends FakeElement { constructor(label, value) { super("option"); this.textContent = label; this.value = value; } };
  return { document, scrollCalls, restore: () => Object.assign(globalThis, previous) };
}

// Poll until the condition holds or the time limit passes. The next assertion reports a real failure.
async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("browser smoke serves board assets and route behavior without write methods", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-ui-browser-"));
  const shared = join(cwd, ".agent-rig", "_shared");
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workflow_store: { provider: "sqlite" }, project_identifier: "fixture" }));
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "Phase 17 board", type: "task", status: "ready", assignedTo: "worker", priority: "high", parent: "", phase: "phase-17", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "# Detail", metadata: {} });
  store.createTask({ projectIdentifier: "fixture", id: "task-0002", title: "Phase 16 legacy task", type: "task", status: "done", assignedTo: "worker", priority: "normal", parent: "", phase: "phase-16", dependsOn: ["task-0001"], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "# Legacy", metadata: {} });
  store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "Needle handoff", createdAt: "2026-10-05T10:00:00.000Z", metadata: { ticket: "ABC-42" } });
  store.close();
  const server = createUiServer(cwd);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/`)).text();
    const script = await (await fetch(`${base}/ui/pages/task-board/index.js`)).text();
    assert.match(html, /id="app"/);
    for (const marker of ["Filter by phase", "Search handoffs", "No handoffs recorded", "Task not found", "agent-rig-theme", "#/tasks/"]) assert.match(script, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const beforeStore = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
    const before = JSON.stringify(beforeStore.listTasks("fixture"));
    beforeStore.close();
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of ["/api/workflow", "/api/tasks/task-0001", "/api/tasks/task-0001/handoffs"]) {
        assert.equal((await fetch(`${base}${path}`, { method })).status, 405, `${method} ${path}`);
      }
    }
    const unchanged = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
    assert.equal(JSON.stringify(unchanged.listTasks("fixture")), before);
    assert.equal(unchanged.listHandoffs("fixture", "task-0001").length, 1);
    unchanged.close();

    const harness = installBrowserHarness();
    try {
      const browserFetch = globalThis.fetch;
      const requested = [];
      globalThis.fetch = (input, init) => { requested.push(String(input)); return browserFetch(new URL(input, base), init); };
      const root = harness.document.root;
      const go = (hash) => { globalThis.location.hash = hash; globalThis.window.dispatchEvent({ type: "hashchange" }); };
       mountSlidingBoard(root);
      await waitFor(() => root.textContent.includes("Phase 17"));
      assert.deepEqual(requested, ["/api/phases"], "landing asks for the phase list only");
      assert.equal(root.findAll("[data-task-id]").length, 0, "landing shows no task nodes");
      assert.match(root.textContent, /Phase 16/);
      go("#/?phase=phase-17");
      await waitFor(() => root.textContent.includes("Phase 17 board"));
      assert.match(root.textContent, /Phase 17 board/);
      assert.deepEqual(requested, ["/api/phases", "/api/workflow?phase=phase-17"], "a phase view asks for its own phase only");
      const drawer = root.findAll("aside")[0];
      const scrim = root.findAll("button").find((button) => button.getAttribute("aria-label") === "Close task details");
      assert.ok(drawer.classList.values.has("fixed"), "drawer is viewport-fixed");
      assert.ok(drawer.classList.values.has("w-[80vw]"), "drawer uses 80vw on larger viewports");
      assert.ok(drawer.classList.values.has("max-w-[calc(100vw-1rem)]"), "drawer remains usable on narrow viewports");
      assert.ok(drawer.classList.values.has("bg-base-100"), "drawer has an opaque theme background");
      assert.equal(drawer.getAttribute("inert"), "");
      assert.equal(scrim.getAttribute("inert"), "");
      assert.equal(scrim.getAttribute("tabindex"), "-1");
      const graph = root.findAll("svg")[0];
      assert.equal(graph.getAttribute("aria-label"), "Task dependency flow");
      assert.equal(root.findAll("[data-task-id]").length, 1, "one task node group is rendered for the phase");
      const initialViewBox = graph.getAttribute("viewBox");
      root.findAll("button").find((button) => button.getAttribute("aria-label") === "Zoom in task flow").click();
      assert.notEqual(graph.getAttribute("viewBox"), initialViewBox);
      root.findAll("button").find((button) => button.getAttribute("aria-label") === "Fit task flow to view").click();
      assert.equal(graph.getAttribute("viewBox"), initialViewBox);
      go("#/?phase=phase-16");
      await waitFor(() => root.textContent.includes("Phase 16 legacy task"));
      assert.doesNotMatch(root.textContent, /Phase 17 board/);
      assert.match(root.textContent, /Phase 16 legacy task/);

       go("#/tasks/task-0001?phase=phase-17");
       await waitFor(() => root.textContent.includes("Handoff timeline"));
       assert.match(root.textContent, /Handoff timeline/);
       assert.equal(drawer.getAttribute("inert"), undefined);
       assert.equal(scrim.getAttribute("inert"), undefined);
       const closeTask = harness.document.body.findAll("button").find((button) => button.textContent === "×");
       closeTask.dispatchEvent({ type: "keydown", key: "Escape", preventDefault: () => {} });
       assert.equal(globalThis.location.hash, "#/?phase=phase-17");
       globalThis.window.dispatchEvent({ type: "hashchange" });
       await waitFor(() => root.findAll("[data-task-id]").length === 1);
       assert.equal(drawer.getAttribute("inert"), "");
       assert.equal(scrim.getAttribute("inert"), "");
      const timeline = root.findAll("article").find((article) => article.textContent.includes("review"));
      assert.ok(timeline);
      assert.match(timeline.textContent, /worker.*reviewer/);
      assert.equal(root.findAll("button").filter((button) => button.getAttribute("aria-label") === "Open handoff 1 details").length, 1);
      globalThis.history.back();
      await waitFor(() => root.textContent.includes("2 phases"));
      assert.match(root.textContent, /Phase 16/, "Back returns to the landing page");
      assert.equal(root.findAll("[data-task-id]").length, 0);
      globalThis.history.forward();
      await waitFor(() => root.textContent.includes("Handoff timeline"));
      assert.match(root.textContent, /Handoff timeline/);
      const search = root.findAll("input")[0];
      search.value = "needle";
      search.dispatchEvent({ type: "input", target: search });
      assert.equal(root.findAll("button").filter((button) => button.getAttribute("aria-label") === "Open handoff 1 details").length, 1);
      root.findAll("button").find((button) => button.getAttribute("aria-label") === "Open handoff 1 details").click();
      assert.match(harness.document.body.textContent, /Handoff #1/);
      const dialog = harness.document.body.children.find((child) => child.getAttribute("role") === "dialog");
      assert.equal(dialog.getAttribute("aria-labelledby"), "handoff-dialog-title");
      assert.equal(dialog.querySelector("#handoff-dialog-title")?.textContent, "Handoff #1");
      const close = harness.document.body.findAll("button").find((button) => button.getAttribute("aria-label") === "Close handoff details");
      close.click();
      assert.doesNotMatch(harness.document.body.textContent, /Handoff #1/);
      assert.equal(harness.document.activeElement.textContent, "1");

      root.findAll("button").find((button) => button.getAttribute("aria-label") === "Open handoff 1 details").click();
      harness.document.dispatchEvent({ type: "keydown", key: "Escape" });
      assert.doesNotMatch(harness.document.body.textContent, /Handoff #1/);

      root.findAll("button").find((button) => button.getAttribute("aria-label") === "Open handoff 1 details").click();
      const backdropDialog = harness.document.body.children.find((child) => child.getAttribute("role") === "dialog");
      backdropDialog.click();
      assert.doesNotMatch(harness.document.body.textContent, /Handoff #1/);

      globalThis.window.scrollY = 321;
      root.findAll("button").find((button) => button.textContent === "Refresh").click();
      await waitFor(() => harness.scrollCalls.some((value) => value === 321));
      assert.ok(harness.scrollCalls.some((value) => value === 321));

      go("#/tasks/task-0002");
      await waitFor(() => root.textContent.includes("No handoffs recorded for this task yet"));
      assert.match(root.textContent, /No handoffs recorded for this task yet/);
      assert.equal(globalThis.location.hash, "#/tasks/task-0002?phase=phase-16", "a task link without a phase gets its phase");
      go("#/tasks/stale-task");
      await waitFor(() => root.textContent.includes("Task not found"));
      assert.match(root.textContent, /Task not found/);
      go("#/?phase=nope");
      await waitFor(() => root.textContent.includes("Phase not found"));
      assert.match(root.textContent, /Phase not found/);

      go("#/?phase=phase-16");
      await waitFor(() => root.findAll("[data-task-id]").length === 1);
      root.findAll("[data-task-id]")[0].click();
       assert.equal(globalThis.location.hash, "#/tasks/task-0002?phase=phase-16");
      globalThis.window.dispatchEvent({ type: "hashchange" });
      await waitFor(() => root.textContent.includes("Handoff timeline"));
      assert.match(root.textContent, /Handoff timeline/);
      globalThis.location.hash = "";
      globalThis.window.dispatchEvent({ type: "hashchange" });
      await waitFor(() => root.textContent.includes("phase-17"));
      assert.ok(!requested.includes("/api/workflow"), "the UI never asks for the unfiltered workflow");
      await waitFor(() => root.findAll("button").some((button) => /theme/i.test(button.textContent)));
      const theme = root.findAll("button").find((button) => /theme/i.test(button.textContent));
      theme.click();
      assert.equal(harness.document.documentElement.dataset.theme, "dark");
      assert.equal(globalThis.localStorage.getItem("agent-rig-theme"), "dark");
    } finally { harness.restore(); }
  } finally { server.close(); }
});

test("HTTP server passes the phase query to the API and keeps write methods closed", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-ui-phases-http-"));
  const shared = join(cwd, ".agent-rig", "_shared");
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workflow_store: { provider: "sqlite" }, project_identifier: "fixture" }));
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  const base = { projectIdentifier: "fixture", type: "task", status: "ready", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-05", updatedOn: "2026-10-06", body: "Body", metadata: {} };
  store.createTask({ ...base, id: "task-0001", title: "A", phase: "26" });
  store.createTask({ ...base, id: "task-0002", title: "B", phase: "phase-27" });
  store.createTask({ ...base, id: "task-0003", title: "C", phase: "" });
  store.close();
  const server = createUiServer(cwd);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const url = `http://127.0.0.1:${port}`;
    const phases = await fetch(`${url}/api/phases`);
    assert.equal(phases.status, 200);
    assert.match(phases.headers.get("content-type"), /application\/json/);
    const phasesBody = await phases.json();
    assert.deepEqual(phasesBody.phases.map((entry) => entry.phase), ["26", "phase-27", "Unassigned"].sort((a, b) => a.localeCompare(b)));
    assert.equal("tasks" in phasesBody, false);
    const filtered = await (await fetch(`${url}/api/workflow?phase=26`)).json();
    assert.deepEqual(filtered.tasks.map((task) => task.id), ["task-0001"]);
    assert.deepEqual((await (await fetch(`${url}/api/workflow?phase=Unassigned`)).json()).tasks.map((task) => task.id), ["task-0003"]);
    assert.equal((await (await fetch(`${url}/api/workflow`)).json()).tasks.length, 3);
    const unknown = await fetch(`${url}/api/workflow?phase=nope`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { error: "Phase not found", phase: "nope" });
    assert.equal((await fetch(`${url}/api/workflow?phase=%E0%A4%A`)).status, 404);
    assert.equal((await fetch(`${url}/api/workflow?phase=26&phase=26`)).status, 400);
    assert.equal((await fetch(`${url}/api/workflow?phase=`)).status, 404);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const path of ["/api/phases", "/api/workflow?phase=26"]) assert.equal((await fetch(`${url}${path}`, { method })).status, 405, `${method} ${path}`);
    }
  } finally { server.close(); }
});
