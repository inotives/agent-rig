import assert from "node:assert/strict";
import test from "node:test";
import { applyTheme, filterHandoffs, filterTasks, preferredTheme, sortHandoffs, sortTasks, STATUS_COLUMNS } from "../dist/ui.js";
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
