import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { bubbleLayout } from "../../../dist/ui/pages/task-board/handoff-bubbles.js";

test("bubbleLayout is empty for no handoffs", () => {
  assert.deepEqual(bubbleLayout(0, 600).xs, []);
});

test("bubbleLayout keeps the maximum radius for a short row and stays left aligned", () => {
  const layout = bubbleLayout(3, 800);
  assert.equal(layout.radius, 13);
  assert.equal(layout.overlap, false);
  assert.equal(layout.xs.length, 3);
  assert.ok(layout.xs[0] < 40, "starts at the left");
  assert.ok(layout.xs[2] < 200, "does not stretch over the whole width");
  assert.equal(layout.width, 800);
});

test("bubbleLayout keeps bubbles large and overlaps them when the row is crowded", () => {
  const layout = bubbleLayout(30, 330);
  assert.ok(layout.radius >= 8, "bubbles stay large");
  assert.equal(layout.overlap, true);
  assert.equal(layout.width, 330, "the row fits without scrolling");
  assert.ok(layout.xs.at(-1) + layout.radius <= 330);
  for (let index = 1; index < layout.xs.length; index += 1) assert.ok(layout.xs[index] > layout.xs[index - 1], "each bubble sits right of the one before");
});

test("bubbleLayout radius never grows with more handoffs", () => {
  const radii = [2, 5, 10, 20, 40, 80].map((count) => bubbleLayout(count, 600).radius);
  assert.deepEqual([...radii].sort((a, b) => b - a), radii);
  assert.ok(radii.every((radius) => radius >= 4.5 && radius <= 13));
});

test("bubbleLayout grows wider than the container below the minimum radius", () => {
  const layout = bubbleLayout(80, 400);
  assert.equal(layout.radius, 4.5);
  assert.ok(layout.width > 400);
  assert.ok(layout.xs.at(-1) + layout.radius <= layout.width);
});

test("bubbleLayout handles one handoff and a zero width", () => {
  assert.equal(bubbleLayout(1, 300).xs.length, 1);
  assert.doesNotThrow(() => bubbleLayout(5, 0));
});

test("the build ships d3 locally and the page loads it before the module", async () => {
  const html = await readFile(new URL("../../../dist/index.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("/vendor/d3.min.js") !== -1 && html.indexOf("/vendor/d3.min.js") < html.indexOf('type="module"'));
  assert.ok((await readFile(new URL("../../../dist/vendor/d3.min.js", import.meta.url))).length > 100_000);
});
