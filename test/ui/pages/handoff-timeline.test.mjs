import assert from "node:assert/strict";
import test from "node:test";
import { handoffStatusTone, handoffPreviewText, relativeTime } from "../../../dist/ui/pages/task-board/index.js";

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
