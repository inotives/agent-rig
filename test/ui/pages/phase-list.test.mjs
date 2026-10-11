import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterPhases, orderPhases, parsePhaseFilter, phaseFilterHash, phaseLabel, phaseNumber, phaseState, renderPhaseCards, renderPhaseLanding, renderPhaseSkeleton } from "../../../dist/ui/pages/phase-list/index.js";
import { routeHash } from "../../../dist/ui/pages/task-board/index.js";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const counts = (over = {}) => ({ todo: 0, ready: 0, in_progress: 0, blocked: 0, review: 0, done: 0, ...over });
const summary = (phase, over = {}, latest = "2026-10-10T12:00:00Z") => { const c = counts(over); return { phase, total: Object.values(c).reduce((a, b) => a + b, 0), counts: c, latest_updated_on: latest }; };

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.value = ""; this.listeners = {}; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  fire(type) { this.listeners[type]?.(); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
}
const walk = (element, found = []) => { found.push(element); for (const child of element.children) walk(child, found); return found; };
const withDom = (run) => { const previous = globalThis.document; globalThis.document = { createElement: (tag) => new Element(tag) }; try { return run(); } finally { globalThis.document = previous; } };
const cardsOf = (root) => walk(root).filter((item) => item.tagName === "article");
const textOf = (element) => walk(element).map((item) => item.textContent).filter(Boolean).join(" | ");

test("phaseNumber reads phase-N and a bare N as the same number", () => {
  assert.equal(phaseNumber("phase-27"), 27);
  assert.equal(phaseNumber("26"), 26);
  assert.equal(phaseNumber("phase-5"), 5);
  assert.equal(phaseNumber("Unassigned"), null);
  assert.equal(phaseNumber("release-2"), null);
  assert.equal(phaseNumber("phase-"), null);
});

test("phaseLabel shows Phase N for numbered phases and the raw value otherwise", () => {
  assert.equal(phaseLabel("phase-27"), "Phase 27");
  assert.equal(phaseLabel("26"), "Phase 26");
  assert.equal(phaseLabel("Unassigned"), "Unassigned");
  assert.equal(phaseLabel("hardening"), "hardening");
});

test("phaseState is active when any task is not done and complete when all are done", () => {
  assert.equal(phaseState(summary("phase-1", { done: 2 })), "complete");
  assert.equal(phaseState(summary("phase-1", { done: 2, ready: 1 })), "active");
  assert.equal(phaseState(summary("phase-1", { review: 1 })), "active");
});

test("orderPhases puts open work first, newest first, other names next, Unassigned last", () => {
  const input = [
    summary("phase-25", { done: 3 }), summary("Unassigned", { todo: 1 }), summary("26", { ready: 1 }), summary("hardening", { done: 1 }),
    summary("phase-27", { in_progress: 1 }), summary("phase-13", { done: 1 }), summary("alpha", { todo: 1 }), summary("phase-9", { done: 1 })
  ];
  const order = orderPhases(input).map((item) => item.phase);
  assert.deepEqual(order, ["phase-27", "26", "alpha", "phase-25", "phase-13", "phase-9", "hardening", "Unassigned"]);
  assert.deepEqual(input.map((item) => item.phase)[0], "phase-25", "the input is not changed");
});

test("orderPhases puts Unassigned last even when all phases are complete", () => {
  const order = orderPhases([summary("Unassigned", { done: 1 }), summary("phase-3", { done: 1 }), summary("phase-4", { done: 1 })]).map((item) => item.phase);
  assert.deepEqual(order, ["phase-4", "phase-3", "Unassigned"]);
});

test("a card shows name, state, progress, chips, time, and a Detail link", () => withDom(() => {
  const grid = renderPhaseCards({ project_identifier: "p", phases: [summary("26", { done: 2, ready: 1, in_progress: 1, blocked: 0 }, "2026-10-09T12:00:00Z")] }, NOW);
  const [card] = cardsOf(grid);
  const text = textOf(card);
  assert.match(text, /Phase 26/);
  assert.match(text, /active/);
  assert.match(text, /2 of 4 done/);
  const bar = walk(card).find((item) => item.attrs.role === "progressbar");
  assert.equal(bar.tagName, "progress");
  assert.equal(bar.attrs["aria-valuenow"], "2");
  assert.equal(bar.attrs["aria-valuemin"], "0");
  assert.equal(bar.attrs["aria-valuemax"], "4");
  const chips = walk(card).filter((item) => item.dataset.statusChip).map((item) => `${item.dataset.statusChip}:${item.textContent}`);
  assert.deepEqual(chips, ["ready:1 ready", "in_progress:1 in progress"]);
  const time = walk(card).find((item) => item.dataset.latestUpdate);
  assert.equal(time.textContent, "2 days ago");
  assert.ok(time.title.length > 0 && time.title !== "2 days ago");
  const link = walk(card).find((item) => item.tagName === "a");
  assert.equal(link.href, "#/?phase=26");
  assert.match(link.className, /\bbtn\b/);
  assert.match(link.textContent, /Detail/);
}));

test("the Detail link uses the raw phase value and matches routeHash", () => withDom(() => {
  const phases = [summary("phase-27", { ready: 1 }), summary("Unassigned", { todo: 1 }), summary("a b&c", { todo: 1 })];
  const links = walk(renderPhaseCards({ project_identifier: "p", phases }, NOW)).filter((item) => item.tagName === "a").map((item) => item.href);
  for (const phase of ["phase-27", "Unassigned", "a b&c"]) assert.ok(links.includes(routeHash({ kind: "board" }, phase)), phase);
  assert.ok(links.includes("#/?phase=phase-27"));
}));

test("a complete phase shows the complete badge and a full progress bar", () => withDom(() => {
  const [card] = cardsOf(renderPhaseCards({ project_identifier: "p", phases: [summary("phase-20", { done: 5 })] }, NOW));
  assert.match(textOf(card), /complete/);
  assert.match(textOf(card), /5 of 5 done/);
  assert.equal(walk(card).find((item) => item.attrs.role === "progressbar").attrs["aria-valuenow"], "5");
  assert.equal(walk(card).filter((item) => item.dataset.statusChip).length, 0);
}));

test("phase names from data are set as text and never as HTML", () => withDom(() => {
  const name = "<img src=x onerror=alert(1)>";
  const grid = renderPhaseCards({ project_identifier: "p", phases: [summary(name, { todo: 1 })] }, NOW);
  assert.ok(textOf(grid).includes(name));
  assert.ok(!walk(grid).some((item) => "innerHTML" in item));
}));

test("cards follow the display order", () => withDom(() => {
  const phases = [summary("phase-25", { done: 1 }), summary("Unassigned", { todo: 1 }), summary("26", { ready: 1 }), summary("phase-27", { ready: 1 })];
  const titles = cardsOf(renderPhaseCards({ project_identifier: "p", phases }, NOW)).map((card) => walk(card).find((item) => item.tagName === "h2").textContent);
  assert.deepEqual(titles, ["Phase 27", "Phase 26", "Phase 25", "Unassigned"]);
}));

test("the grid has responsive columns and no overflow classes", () => withDom(() => {
  const grid = renderPhaseCards({ project_identifier: "p", phases: [summary("phase-1", { done: 1 })] }, NOW);
  for (const name of ["grid", "grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-4"]) assert.ok(grid.className.split(" ").includes(name), name);
  for (const name of ["lg:grid-cols-3", "2xl:grid-cols-4"]) assert.ok(!grid.className.split(" ").includes(name), name);
}));

const F = (over = {}) => ({ q: "", from: "", to: "", ...over });
const sample = [summary("phase-27", { ready: 1 }, "2026-10-10T12:00:00Z"), summary("26", { done: 1 }, "2026-10-05"), summary("hardening", { todo: 1 }, "2026-09-01"), summary("Unassigned", { todo: 1 }, "")];
const names = (list) => list.map((item) => item.phase);

test("filterPhases searches name and label, ignores case, matches part of the text", () => {
  assert.deepEqual(names(filterPhases(sample, F({ q: "26" }))), ["26"]);
  assert.deepEqual(names(filterPhases(sample, F({ q: "PHASE 26" }))), ["26"]);
  assert.deepEqual(names(filterPhases(sample, F({ q: "phase-27" }))), ["phase-27"]);
  assert.deepEqual(names(filterPhases(sample, F({ q: "HARD" }))), ["hardening"]);
  assert.deepEqual(names(filterPhases(sample, F({ q: "phase" }))), ["phase-27", "26"]);
  assert.equal(filterPhases(sample, F({ q: "zzz" })).length, 0);
  assert.equal(filterPhases(sample, F()).length, 4);
});

test("filterPhases range is inclusive, allows one open end, and hides empty dates", () => {
  assert.deepEqual(names(filterPhases(sample, F({ from: "2026-10-05", to: "2026-10-10" }))), ["phase-27", "26"]);
  assert.deepEqual(names(filterPhases(sample, F({ from: "2026-10-06" }))), ["phase-27"]);
  assert.deepEqual(names(filterPhases(sample, F({ to: "2026-09-30" }))), ["hardening"]);
  assert.ok(!names(filterPhases(sample, F({ from: "2000-01-01" }))).includes("Unassigned"));
  assert.ok(!names(filterPhases(sample, F({ to: "2100-01-01" }))).includes("Unassigned"));
  assert.ok(names(filterPhases(sample, F({ q: "una" }))).includes("Unassigned"));
});

test("filterPhases with an inverted range matches nothing and does not throw", () => {
  assert.deepEqual(filterPhases(sample, F({ from: "2026-10-10", to: "2026-10-01" })), []);
});

test("parsePhaseFilter and phaseFilterHash round-trip and ignore invalid values", () => {
  assert.deepEqual(parsePhaseFilter("#/"), F());
  assert.deepEqual(parsePhaseFilter("#/?q=26&from=2026-10-01&to=2026-10-10"), F({ q: "26", from: "2026-10-01", to: "2026-10-10" }));
  assert.deepEqual(parsePhaseFilter("#/?from=nope&to=2026-13-45&x=1"), F());
  assert.deepEqual(parsePhaseFilter("#/?q=%00"), F());
  assert.deepEqual(parsePhaseFilter("#/?q=a%20b"), F({ q: "a b" }));
  assert.equal(phaseFilterHash(F()), "#/");
  assert.equal(phaseFilterHash(F({ q: "26", from: "2026-10-01", to: "2026-10-10" })), "#/?q=26&from=2026-10-01&to=2026-10-10");
  assert.equal(phaseFilterHash(F({ q: "a b&c" })), "#/?q=a+b%26c");
  const filter = F({ q: "a b&c", from: "2026-10-01" });
  assert.deepEqual(parsePhaseFilter(phaseFilterHash(filter)), filter);
  assert.equal(phaseFilterHash(F({ from: "bad" })), "#/");
});

test("a phase route is not read as a filter route", () => {
  assert.deepEqual(parsePhaseFilter("#/?phase=26"), F());
  assert.equal(routeHash({ kind: "board" }, "26"), "#/?phase=26");
});

const landing = (filter, phases = sample) => { const changes = []; const root = renderPhaseLanding({ project_identifier: "p", phases }, filter, (next) => changes.push(next), NOW); const find = (id) => walk(root).find((item) => item.id === id); return { root, changes, q: find("phase-filter-q"), from: find("phase-filter-from"), to: find("phase-filter-to"), clear: walk(root).find((item) => item.tagName === "button" && item.textContent === "Clear"), count: walk(root).find((item) => item.dataset.filterCount) }; };

test("the landing has labelled inputs and shows all cards without a count when no filter is set", () => withDom(() => {
  const view = landing(F());
  assert.equal(cardsOf(view.root).length, 4);
  assert.equal(view.count.textContent, "");
  const labels = walk(view.root).filter((item) => item.tagName === "label").map((item) => `${item.htmlFor}:${item.textContent}`);
  assert.deepEqual(labels, ["phase-filter-q:Search phases", "phase-filter-from:Updated from", "phase-filter-to:Updated to"]);
  assert.equal(view.from.type, "date");
  assert.equal(view.clear.disabled, true);
}));

test("typing filters the cards, shows the count, and reports the filter", () => withDom(() => {
  const view = landing(F());
  view.q.value = "26"; view.q.fire("input");
  assert.equal(cardsOf(view.root).length, 1);
  assert.equal(view.count.textContent, "1 of 4 phases");
  assert.deepEqual(view.changes, [F({ q: "26" })]);
  assert.equal(view.clear.disabled, false);
  view.from.value = "2026-10-01"; view.from.fire("input");
  assert.equal(cardsOf(view.root).length, 1);
  view.to.value = "2026-10-04"; view.to.fire("input");
  assert.equal(cardsOf(view.root).length, 0);
  assert.match(textOf(view.root), /No phases match/);
}));

test("the initial filter is applied, an inverted range shows a message, and Clear resets", () => withDom(() => {
  const view = landing(F({ q: "phase", from: "2026-10-10", to: "2026-10-01" }));
  assert.equal(view.q.value, "phase");
  assert.equal(cardsOf(view.root).length, 0);
  assert.match(textOf(view.root), /Updated from is later than Updated to/);
  view.clear.fire("click");
  assert.equal(cardsOf(view.root).length, 4);
  assert.equal(view.q.value, "");
  assert.equal(view.from.value, "");
  assert.deepEqual(view.changes.at(-1), F());
  assert.equal(view.count.textContent, "");
}));

test("the empty-state Clear button resets the filter", () => withDom(() => {
  const view = landing(F({ q: "zzz" }));
  assert.match(textOf(view.root), /No phases match/);
  const buttons = walk(view.root).filter((item) => item.tagName === "button" && item.textContent === "Clear");
  assert.equal(buttons.length, 2);
  buttons[1].fire("click");
  assert.equal(cardsOf(view.root).length, 4);
  assert.deepEqual(view.changes.at(-1), F());
}));

test("the landing with no phases shows only the empty state", () => withDom(() => {
  const view = { root: renderPhaseLanding({ project_identifier: "p", phases: [] }, F(), () => {}, NOW) };
  assert.match(textOf(view.root), /No phases yet/);
  assert.equal(walk(view.root).filter((item) => item.tagName === "input").length, 0);
}));

test("no phases shows the empty state", () => withDom(() => {
  const view = renderPhaseCards({ project_identifier: "p", phases: [] }, NOW);
  assert.equal(cardsOf(view).length, 0);
  assert.match(textOf(view), /No phases yet/);
}));

test("the loading skeleton is labelled and has no links", () => withDom(() => {
  const skeleton = renderPhaseSkeleton();
  assert.ok(walk(skeleton).some((item) => /Loading phases/.test(item.attrs["aria-label"] ?? "")));
  assert.equal(walk(skeleton).filter((item) => item.tagName === "a").length, 0);
}));

test("the page source sets no HTML from data", () => {
  const source = readFileSync(new URL("../../../src/ui/pages/phase-list/index.ts", import.meta.url), "utf8");
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(source));
});

test("dayOf and the date filter use the local day of a timestamp, not the UTC day", async () => {
  const { dayOf } = await import("../../../dist/ui/pages/phase-list/index.js");
  const before = process.env.TZ;
  try {
    // 2026-10-10 20:00 UTC is already 2026-10-11 04:00 in Singapore (UTC+8) and still 2026-10-10 in New York.
    process.env.TZ = "Asia/Singapore";
    assert.equal(dayOf("2026-10-10T20:00:00Z"), "2026-10-11");
    assert.deepEqual(names(filterPhases([summary("p", {}, "2026-10-10T20:00:00Z")], F({ from: "2026-10-11", to: "2026-10-11" }))), ["p"]);
    assert.deepEqual(names(filterPhases([summary("p", {}, "2026-10-10T20:00:00Z")], F({ to: "2026-10-10" }))), []);
    process.env.TZ = "America/New_York";
    assert.equal(dayOf("2026-10-10T20:00:00Z"), "2026-10-10");
    assert.equal(dayOf("2026-10-11T02:00:00Z"), "2026-10-10");
    // A date without time keeps its own day in every zone.
    assert.equal(dayOf("2026-10-10"), "2026-10-10");
    // Missing or invalid values give no day.
    assert.equal(dayOf(""), "");
    assert.equal(dayOf("not a date"), "");
    assert.equal(dayOf("2026-10-10Tgarbage"), "");
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});
