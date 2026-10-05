import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createUiServer } from "../dist/ui-server.js";
import { SQLiteWorkflowStore } from "../dist/workflow-store.js";
import { mountBoard } from "../dist/ui.js";

class FakeElement {
  constructor(tagName) { this.tagName = tagName.toUpperCase(); this.children = []; this.parentNode = null; this.attributes = new Map(); this.listeners = new Map(); this.dataset = {}; this.classList = { values: new Set(), toggle: (name, enabled) => enabled ? this.classList.values.add(name) : this.classList.values.delete(name) }; this.value = ""; this.disabled = false; this.type = ""; }
  set textContent(value) { this._text = String(value ?? ""); this.children = []; }
  get textContent() { return [this._text ?? "", ...this.children.map((child) => child.textContent)].join(""); }
  set innerHTML(value) { this._text = String(value ?? "").replace(/<[^>]+>/g, "").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">"); this.children = []; }
  get innerHTML() { return this._text ?? ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  append(...children) { for (const child of children.flat()) { if (!child) continue; child.parentNode = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this._text = ""; this.append(...children); }
  remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) ?? []) listener(event); }
  click() { this.dispatchEvent({ type: "click", target: this }); }
  querySelector(selector) { return this.findAll(selector)[0] ?? null; }
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
  constructor() { this.documentElement = new FakeElement("html"); this.body = new FakeElement("body"); this.root = new FakeElement("div"); this.root.setAttribute("id", "app"); this.body.append(this.root); this.listeners = new Map(); }
  createElement(tagName) { return new FakeElement(tagName); }
  querySelector(selector) { return this.body.querySelector(selector); }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener)); }
}

function installBrowserHarness() {
  const document = new FakeDocument();
  const storage = new Map();
  const windowListeners = new Map();
  const previous = { document: globalThis.document, window: globalThis.window, location: globalThis.location, history: globalThis.history, localStorage: globalThis.localStorage, Option: globalThis.Option, fetch: globalThis.fetch };
  globalThis.document = document;
  globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: (type, listener) => windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]), dispatchEvent: (event) => { for (const listener of windowListeners.get(event.type) ?? []) listener(event); } };
  globalThis.location = { hash: "" };
  globalThis.history = { back: () => { globalThis.location.hash = ""; globalThis.window.dispatchEvent({ type: "hashchange" }); } };
  globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.Option = class extends FakeElement { constructor(label, value) { super("option"); this.textContent = label; this.value = value; } };
  return { document, restore: () => Object.assign(globalThis, previous) };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(predicate) { for (let attempt = 0; attempt < 50; attempt += 1) { if (predicate()) return; await tick(); } }

test("browser smoke serves board assets and route behavior without write methods", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "agent-rig-ui-browser-"));
  const shared = join(cwd, ".agent-rig", "_shared");
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, "agent-rig.json"), JSON.stringify({ workflow_store: { provider: "sqlite" }, project_identifier: "fixture" }));
  const store = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), "fixture");
  store.createTask({ projectIdentifier: "fixture", id: "task-0001", title: "Phase 17 board", type: "task", status: "ready", assignedTo: "worker", priority: "high", parent: "", phase: "phase-17", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "# Detail", metadata: {} });
  store.createTask({ projectIdentifier: "fixture", id: "task-0002", title: "Phase 16 legacy task", type: "task", status: "done", assignedTo: "worker", priority: "normal", parent: "", dependsOn: [], dependencyReady: true, blockedBy: [], createdBy: "planner", createdOn: "2026-10-05", updatedOn: "2026-10-05", body: "# Legacy", metadata: {} });
  store.addHandoff({ projectIdentifier: "fixture", taskId: "task-0001", sequence: 1, sender: "worker", recipient: "reviewer", status: "review", message: "Needle handoff", createdAt: "2026-10-05T10:00:00.000Z", metadata: { ticket: "ABC-42" } });
  store.close();
  const server = createUiServer(cwd);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    const base = `http://127.0.0.1:${port}`;
    const html = await (await fetch(`${base}/`)).text();
    const script = await (await fetch(`${base}/ui.js`)).text();
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
      globalThis.fetch = (input, init) => browserFetch(new URL(input, base), init);
      const root = harness.document.root;
      mountBoard(root);
      await waitFor(() => root.textContent.includes("Phase 17 board"));
      assert.match(root.textContent, /Phase 17 board/);
      const phase = root.findAll("select")[0];
      phase.value = "phase-16";
      phase.dispatchEvent({ type: "change", target: phase });
      await waitFor(() => root.textContent.includes("Phase 16 legacy task"));
      assert.doesNotMatch(root.textContent, /Phase 17 board/);
      assert.match(root.textContent, /Phase 16 legacy task/);

      globalThis.location.hash = "#/tasks/task-0001";
      globalThis.window.dispatchEvent({ type: "hashchange" });
      await waitFor(() => root.textContent.includes("Handoff timeline"));
      assert.match(root.textContent, /Handoff timeline/);
      const search = root.findAll("input")[0];
      search.value = "needle";
      search.dispatchEvent({ type: "input", target: search });
      assert.equal(root.findAll("button").filter((button) => button.textContent === "Details").length, 1);
      root.findAll("button").find((button) => button.textContent === "Details").click();
      assert.match(harness.document.body.textContent, /Handoff #1/);
      harness.document.body.findAll("button").find((button) => button.getAttribute("aria-label") === "Close handoff details").click();
      assert.doesNotMatch(harness.document.body.textContent, /Handoff #1/);

      globalThis.location.hash = "#/tasks/task-0002";
      globalThis.window.dispatchEvent({ type: "hashchange" });
      await waitFor(() => root.textContent.includes("No handoffs recorded for this task yet"));
      assert.match(root.textContent, /No handoffs recorded for this task yet/);
      globalThis.location.hash = "#/tasks/stale-task";
      globalThis.window.dispatchEvent({ type: "hashchange" });
      await waitFor(() => root.textContent.includes("Task not found"));
      assert.match(root.textContent, /Task not found/);

      globalThis.location.hash = "";
      globalThis.window.dispatchEvent({ type: "hashchange" });
      await waitFor(() => root.findAll("button").some((button) => /theme/i.test(button.textContent)));
      const theme = root.findAll("button").find((button) => /theme/i.test(button.textContent));
      theme.click();
      assert.equal(harness.document.documentElement.dataset.theme, "dark");
      assert.equal(globalThis.localStorage.getItem("agent-rig-theme"), "dark");
    } finally { harness.restore(); }
  } finally { server.close(); }
});
