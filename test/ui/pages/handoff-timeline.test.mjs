import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { handoffStaggerDelay, handoffStatusTone, handoffPreviewText, relativeTime, renderHandoffTimeline } from "../../../dist/ui/pages/task-board/index.js";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("relativeTime gives short English phrases", () => {
  assert.equal(relativeTime(ago(5_000), NOW), "just now");
  assert.equal(relativeTime(ago(59_000), NOW), "just now");
  assert.equal(relativeTime(ago(MIN), NOW), "1 minute ago");
  assert.equal(relativeTime(ago(5 * MIN), NOW), "5 minutes ago");
  assert.equal(relativeTime(ago(HOUR), NOW), "1 hour ago");
  assert.equal(relativeTime(ago(2 * HOUR), NOW), "2 hours ago");
  assert.equal(relativeTime(ago(DAY), NOW), "1 day ago");
  assert.equal(relativeTime(ago(3 * DAY), NOW), "3 days ago");
  assert.equal(relativeTime(ago(30 * DAY), NOW), "30 days ago");
});

test("relativeTime shows the date after 30 days and handles bad or future input", () => {
  const old = ago(31 * DAY);
  assert.equal(relativeTime(old, NOW), new Date(old).toLocaleDateString());
  assert.equal(relativeTime(new Date(NOW + HOUR).toISOString(), NOW), "just now");
  assert.equal(relativeTime("not a date", NOW), "not a date");
});

test("handoffStatusTone maps every known status and falls back to neutral", () => {
  const expected = { done: "success", review: "secondary", ready: "info", blocked: "error", changes_requested: "warning", fixes_required: "warning", findings: "accent", handoff: "primary" };
  for (const [status, tone] of Object.entries(expected)) assert.equal(handoffStatusTone(status), tone, status);
  assert.equal(handoffStatusTone("something_new"), "neutral");
  assert.equal(handoffStatusTone(""), "neutral");
  assert.equal(handoffStatusTone("toString"), "neutral");
});

test("handoffPreviewText removes Markdown markers", () => {
  assert.equal(handoffPreviewText("# Title\n\n**Bold** and `code` and _it_"), "Title Bold and code and it");
  assert.equal(handoffPreviewText("- one\n- two\n> quote\n[link](http://x.y)"), "one two quote link");
  assert.equal(handoffPreviewText("```js\nlet a = 1;\n```\nafter"), "let a = 1; after");
  assert.equal(handoffPreviewText(""), "");
});

test("handoffPreviewText keeps snake_case words, paths and math", () => {
  assert.equal(handoffPreviewText("status changes_requested and blocked_by"), "status changes_requested and blocked_by");
  assert.equal(handoffPreviewText("see .agent-rig/_shared/handoff_logs now"), "see .agent-rig/_shared/handoff_logs now");
  assert.equal(handoffPreviewText("error SQLITE_BUSY raised"), "error SQLITE_BUSY raised");
  assert.equal(handoffPreviewText("file __init__.py here"), "file __init__.py here");
  assert.equal(handoffPreviewText("compute 2*3*4 ok"), "compute 2*3*4 ok");
});

test("handoffPreviewText still removes real emphasis and code markers", () => {
  assert.equal(handoffPreviewText("a **bold** b"), "a bold b");
  assert.equal(handoffPreviewText("a __bold__ b"), "a bold b");
  assert.equal(handoffPreviewText("a *it* b"), "a it b");
  assert.equal(handoffPreviewText("a _italic_ b"), "a italic b");
  assert.equal(handoffPreviewText("a ~~gone~~ b"), "a gone b");
  assert.equal(handoffPreviewText("a `code_x` b"), "a code_x b");
  assert.equal(handoffPreviewText("**changes_requested** now"), "changes_requested now");
  assert.equal(handoffPreviewText("(_note_) and **a**, **b**."), "(note) and a, b.");
});

class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = new Map(); this.listeners = new Map(); this.className = ""; this.textContent = ""; this.value = ""; this.title = ""; }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = [...c]; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  addEventListener(t, l) { this.listeners.set(t, [...(this.listeners.get(t) ?? []), l]); }
  fire(t) { for (const l of this.listeners.get(t) ?? []) l({}); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
  all() { return [this, ...this.children.flatMap((c) => c.all())]; }
}
const handoff = (sequence, over = {}) => ({ task_id: "task-1", sequence, sender: "worker", recipient: "reviewer", status: "changes_requested", message: "## Done\n**Fixed** the `bug`", created_at: ago(2 * HOUR), metadata: {}, ...over });

test("handoff entry shows node, chips, badge, preview, relative time and opens the modal", () => {
  const previous = globalThis.document;
  const body = new El("body");
  globalThis.document = { createElement: (t) => new El(t), body, addEventListener() {}, removeEventListener() {} };
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    const section = renderHandoffTimeline([handoff(1), handoff(2, { status: "weird", answers_sequence: 1, sender: "", message: "x".repeat(500) })]);
    const all = section.all();
    const nodes = all.filter((e) => e.tagName === "button");
    assert.equal(nodes.length, 2);
    const node = nodes.find((n) => n.getAttribute("aria-label") === "Open handoff 1 details");
    assert.ok(node);
    assert.match(node.className, /btn-warning/);
    assert.doesNotMatch(all.map((e) => e.className).join(" "), /blue|#|rgb|hsl/);
    // A chip is a badge element that holds one label span.
    const find = (re) => all.filter((e) => re.test(e.textContent) || e.children.some((c) => re.test(c.textContent)));
    assert.ok(find(/^worker$/).some((e) => /badge/.test(e.className)));
    assert.ok(find(/^reviewer$/).some((e) => /badge/.test(e.className)));
    assert.ok(find(/^changes requested$/).some((e) => /badge-warning/.test(e.className)));
    const preview = all.find((e) => e.textContent === "Done Fixed the bug");
    assert.ok(preview && /line-clamp-2/.test(preview.className));
    const time = all.find((e) => e.textContent === "2 hours ago");
    assert.equal(time.title, new Date(ago(2 * HOUR)).toLocaleString());
    assert.equal(all.filter((e) => e.textContent === "answers #1").length, 1);
    assert.ok(find(/^—$/).some((e) => /badge/.test(e.className)));
    assert.ok(find(/^weird$/).some((e) => /badge-neutral/.test(e.className)));
    node.fire("click");
    const dialog = body.children[0];
    assert.equal(dialog.tagName, "dialog");
    assert.ok(dialog.all().some((e) => e.textContent === "Handoff #1"));
  } finally {
    Date.now = realNow;
    globalThis.document = previous;
  }
});

test("handoff timeline search filters entries and shows empty states", () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (t) => new El(t), body: new El("body"), addEventListener() {}, removeEventListener() {} };
  try {
    const section = renderHandoffTimeline([handoff(1), handoff(2, { message: "other" })]);
    const search = section.all().find((e) => e.tagName === "input");
    const count = () => section.all().filter((e) => e.tagName === "article").length;
    assert.equal(count(), 2);
    search.value = "other"; search.fire("input");
    assert.equal(count(), 1);
    search.value = "zzz"; search.fire("input");
    assert.equal(count(), 0);
    assert.ok(section.all().some((e) => e.textContent === "No handoffs match your search."));
    assert.ok(renderHandoffTimeline([]).all().some((e) => e.textContent === "No handoffs recorded for this task yet."));
  } finally {
    globalThis.document = previous;
  }
});

function withDom(fn) {
  const previous = globalThis.document;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const body = new El("body");
  globalThis.document = { createElement: (t) => new El(t), body, addEventListener() {}, removeEventListener() {} };
  try { fn(body); } finally {
    globalThis.document = previous;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window;
  }
}
const setSelection = (value) => { globalThis.window = { getSelection: () => ({ toString: () => value }) }; };

test("card click opens the modal, but not after a text selection", () => {
  withDom((body) => {
    const section = renderHandoffTimeline([handoff(1)]);
    const card = section.all().find((e) => /cursor-pointer/.test(e.className));
    assert.ok(card);
    setSelection("some text");
    card.fire("click");
    assert.equal(body.children.length, 0);
    setSelection("");
    card.fire("click");
    assert.equal(body.children.length, 1);
    body.children.length = 0;
    delete globalThis.window;
    card.fire("click");
    assert.equal(body.children.length, 1);
    body.children.length = 0;
    globalThis.window = {};
    card.fire("click");
    assert.equal(body.children.length, 1);
  });
});

test("status badge truncates a long status and keeps the full status in title", () => {
  withDom(() => {
    const long = "a_very_long_status_word_".repeat(3);
    const all = renderHandoffTimeline([handoff(1, { status: long })]).all();
    const badge = all.find((e) => /badge/.test(e.className) && e.title === long);
    assert.ok(badge);
    assert.match(badge.className, /max-w-full/);
    assert.ok(badge.children.some((c) => /truncate/.test(c.className) && c.textContent === long.replaceAll("_", " ")));
  });
});

test("an empty or invalid created_at shows a dash and readable title text", () => {
  assert.equal(relativeTime("", NOW), "—");
  assert.equal(relativeTime("not a date", NOW), "not a date");
  withDom(() => {
    const all = renderHandoffTimeline([handoff(1, { created_at: "" })]).all();
    const time = all.find((e) => e.textContent === "—" && /text-xs/.test(e.className));
    assert.ok(time);
    assert.equal(time.title, "Unknown time");
    assert.ok(all.some((e) => /sr-only/.test(e.className) && e.textContent === "Unknown time"));
  });
});

test("the sr-only text holds the full date", () => {
  withDom(() => {
    const all = renderHandoffTimeline([handoff(1)]).all();
    const hidden = all.find((e) => /sr-only/.test(e.className));
    assert.ok(hidden);
    assert.equal(hidden.textContent, new Date(ago(2 * HOUR)).toLocaleString());
  });
});

test("handoffStaggerDelay is zero for none or one entry, ordered, and capped at 600 ms", () => {
  assert.equal(handoffStaggerDelay(0, 0), 0);
  assert.equal(handoffStaggerDelay(0, 1), 0);
  assert.equal(handoffStaggerDelay(5, 1), 0);
  assert.equal(handoffStaggerDelay(0, 4), 0);
  assert.equal(handoffStaggerDelay(1, 4), 60);
  assert.equal(handoffStaggerDelay(3, 4), 180);
  for (const count of [2, 10, 11, 12, 30, 100, 5000]) {
    let last = -1;
    for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 50))) {
      const delay = handoffStaggerDelay(i, count);
      assert.ok(delay >= last && delay <= 600, `${i}/${count}: ${delay}`);
      last = delay;
    }
    assert.ok(handoffStaggerDelay(count - 1, count) <= 600);
  }
  assert.equal(handoffStaggerDelay(99, 100), 600);
  assert.equal(handoffStaggerDelay(500, 100), 600);
});

test("built CSS has the timeline keyframes and a reduced-motion safe rule", async () => {
  const css = await readFile(new URL("../../../dist/ui.css", import.meta.url), "utf8");
  for (const name of ["timeline-rail", "timeline-entry", "timeline-node", "timeline-pulse"]) assert.match(css, new RegExp(`@keyframes ${name}\\{`), name);
  assert.match(css, /prefers-reduced-motion/);
  for (const cls of ["animate-timeline-rail", "animate-timeline-entry", "animate-timeline-node", "animate-timeline-node-newest"]) {
    const at = css.indexOf(`.motion-safe\\:${cls}{`);
    assert.ok(at > 0, `${cls} exists`);
    let depth = 0, open = -1;
    for (let j = at - 1; j >= 0 && open < 0; j--) { if (css[j] === "}") depth++; else if (css[j] === "{") { if (depth === 0) open = j; else depth--; } }
    assert.match(css.slice(css.lastIndexOf("}", open) + 1, open), /^@media \(prefers-reduced-motion:no-preference\)$/, `${cls} must sit inside the no-preference media query`);
  }
  assert.match(css, /animation:timeline-node [^;}]*,timeline-pulse [^;}]* 3\b/);
  assert.doesNotMatch(css, /timeline-pulse[^;}]*infinite/);
  assert.doesNotMatch(css, /^\.animate-timeline|[,}]\.animate-timeline/);
});

test("built CSS keeps each node animation while a button is pressed", async () => {
  const css = await readFile(new URL("../../../dist/ui.css", import.meta.url), "utf8");
  const rule = (selector) => { const at = css.indexOf(selector + "{"); assert.ok(at >= 0, selector + " exists"); return css.slice(at + selector.length + 1, css.indexOf("}", at)); };
  for (const name of ["animate-timeline-node", "animate-timeline-node-newest", "animate-none"]) {
    const base = rule(`.motion-safe\\:${name}`);
    for (const state of ["hover", "focus"]) {
      // Same 3-class weight as DaisyUI .btn:active:hover and .btn:active:focus, and later in the file.
      const press = rule(`.motion-safe\\:active\\:${state}\\:${name}:${state}:active`);
      assert.equal(press, base, `${name} on active:${state} must equal the base animation`);
      assert.ok(css.indexOf(`.motion-safe\\:active\\:${state}\\:${name}:`) > css.indexOf(`.btn:active:${state}`), `${name} on active:${state} comes after DaisyUI`);
    }
  }
});

test("entries carry motion classes and a stagger style, and only new entries animate after a search", () => {
  withDom(() => {
    const section = renderHandoffTimeline([handoff(1), handoff(2), handoff(3)]);
    const articles = () => section.all().filter((e) => e.tagName === "article");
    const nodes = () => section.all().filter((e) => e.tagName === "button");
    assert.match(section.all().find((e) => /origin-top/.test(e.className)).className, /motion-safe:animate-timeline-rail/);
    assert.deepEqual(articles().map((a) => a.getAttribute("style")), ["--stagger: 0ms", "--stagger: 60ms", "--stagger: 120ms"]);
    for (const a of articles()) assert.match(a.className, /motion-safe:animate-timeline-entry/);
    assert.match(nodes()[0].className, /(?:^|\s)motion-safe:animate-timeline-node-newest(?:\s|$)/);
    assert.match(nodes()[1].className, /motion-safe:animate-timeline-node(?!-)/);
    assert.doesNotMatch(nodes()[1].className, /newest/);
    const card = section.all().find((e) => /cursor-pointer/.test(e.className));
    assert.match(card.className, /motion-safe:hover:-translate-y-0\.5/);
    assert.match(card.className, /group-has-\[:focus-visible\]:shadow-md/);
    assert.match(card.className, /(?:^|\s)motion-safe:group-has-\[:focus-visible\]:-translate-y-0\.5(?:\s|$)/);
    assert.match(card.className, /(?:^|\s)motion-safe:transition-\[transform,box-shadow\](?:\s|$)/);
    assert.match(card.className, /(?:^|\s)motion-safe:duration-200(?:\s|$)/);
    assert.doesNotMatch(card.className, /(?:^|\s)(?:transition|duration)-/);
    // DaisyUI sets "animation" on .btn:active:hover and .btn:active:focus. Each node repeats its own animation there.
    const pressClasses = (n, name) => { for (const state of ["hover", "focus"]) assert.match(n.className, new RegExp(`(?:^|\\s)motion-safe:active:${state}:${name}(?:\\s|$)`), `${name} on active:${state}`); };
    pressClasses(nodes()[0], "animate-timeline-node-newest");
    pressClasses(nodes()[1], "animate-timeline-node");
    assert.match(articles()[0].className, /\bgroup\b/);
    const search = section.all().find((e) => e.tagName === "input");
    // Narrow the list: shown entries do not animate again.
    search.value = "worker"; search.fire("input");
    assert.equal(articles().length, 3);
    for (const a of articles()) { assert.doesNotMatch(a.className, /animate-timeline/); assert.equal(a.getAttribute("style"), null); }
    for (const n of nodes()) { assert.doesNotMatch(n.className, /animate-timeline/); pressClasses(n, "animate-none"); assert.match(n.className, /(?:^|\s)motion-safe:animate-none(?:\s|$)/); }
    search.value = "zzz"; search.fire("input");
    search.value = ""; search.fire("input");
    // All entries show again after an empty result: they animate, but the pulse does not run again.
    assert.equal(articles().length, 3);
    for (const a of articles()) assert.match(a.className, /motion-safe:animate-timeline-entry/);
    for (const n of nodes()) assert.doesNotMatch(n.className, /newest/);
  });
});

test("handoffPreviewText is fast on pathological input and keeps normal previews", () => {
  for (const bad of ["[".repeat(100_000), "a *".repeat(33_334), "*a b ".repeat(20_000), "_".repeat(100_000)]) {
    const start = performance.now();
    handoffPreviewText(bad);
    assert.ok(performance.now() - start < 50, "slow on " + bad.slice(0, 6));
  }
  const long = "**Start** of a long message with changes_requested. " + "word ".repeat(2000);
  const preview = handoffPreviewText(long);
  assert.ok(preview.startsWith("Start of a long message with changes_requested. word word"));
  assert.ok(preview.length <= 1000);
});

test("handoffPreviewText does not leave half an emoji at the cut", () => {
  const emoji = "\u{1F600}";
  // The emoji starts at index 999. The slice cuts it after the high surrogate.
  const cut = handoffPreviewText("a".repeat(999) + emoji + "tail");
  assert.equal(cut, "a".repeat(999));
  assert.doesNotMatch(cut, /[\uD800-\uDBFF]$/);
  // An emoji that fits stays whole.
  assert.equal(handoffPreviewText("a".repeat(998) + emoji + "tail"), "a".repeat(998) + emoji);
  assert.equal(handoffPreviewText("ok " + emoji), "ok " + emoji);
});
