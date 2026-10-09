import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCALE, MIN_SCALE, clampScale, exceedsDragThreshold, fitView, panBy, viewBoxOf, zoomAt, zoomLabel } from "../../../../dist/ui/pages/task-board/graph/viewport.js";

const screenToWorld = (view, point) => ({ x: (point.x - view.tx) / view.scale, y: (point.y - view.ty) / view.scale });

test("clampScale keeps scale inside the limits", () => {
  assert.equal(clampScale(0), MIN_SCALE);
  assert.equal(clampScale(100), MAX_SCALE);
  assert.equal(clampScale(1), 1);
  assert.equal(clampScale(Number.NaN), 1);
});

test("zoomAt keeps the world point under the pointer fixed", () => {
  const view = { scale: 1, tx: 20, ty: 10 };
  const point = { x: 300, y: 200 };
  const before = screenToWorld(view, point);
  const next = zoomAt(view, 2, point);
  assert.equal(next.scale, 2);
  const after = screenToWorld(next, point);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
});

test("zoomAt respects the minimum and maximum scale", () => {
  const view = { scale: 1, tx: 0, ty: 0 };
  assert.equal(zoomAt(view, 1000, { x: 0, y: 0 }).scale, MAX_SCALE);
  assert.equal(zoomAt(view, 0.0001, { x: 0, y: 0 }).scale, MIN_SCALE);
  const atMax = zoomAt({ scale: MAX_SCALE, tx: 5, ty: 5 }, 2, { x: 50, y: 50 });
  assert.deepEqual(atMax, { scale: MAX_SCALE, tx: 5, ty: 5 });
});

test("panBy moves the view by the screen delta", () => {
  assert.deepEqual(panBy({ scale: 2, tx: 10, ty: 10 }, 5, -3), { scale: 2, tx: 15, ty: 7 });
});

test("fitView shows the whole content centered", () => {
  const view = fitView({ width: 1000, height: 400 }, { width: 500, height: 500 }, 0);
  assert.equal(view.scale, 0.5);
  assert.equal(view.tx, 0);
  assert.equal(view.ty, 150);
  const padded = fitView({ width: 1000, height: 400 }, { width: 500, height: 500 }, 20);
  assert.ok(padded.scale < 0.5);
  assert.ok(padded.tx >= 20 - 1e-9);
});

test("fitView does not enlarge small content and stays inside the limits", () => {
  assert.equal(fitView({ width: 100, height: 100 }, { width: 800, height: 600 }, 0).scale, 1);
  assert.equal(fitView({ width: 1e6, height: 1e6 }, { width: 800, height: 600 }, 0).scale, MIN_SCALE);
  assert.deepEqual(fitView({ width: 100, height: 100 }, { width: 0, height: 0 }, 0), { scale: 1, tx: 0, ty: 0 });
});

test("a large graph can be fit", () => {
  const view = fitView({ width: 6000, height: 4000 }, { width: 1200, height: 600 }, 16);
  assert.ok(view.scale > MIN_SCALE && view.scale < 0.2);
});

test("viewBoxOf maps a view to SVG viewBox text", () => {
  assert.equal(viewBoxOf({ scale: 1, tx: 0, ty: 0 }, { width: 800, height: 600 }), "0 0 800 600");
  assert.equal(viewBoxOf({ scale: 2, tx: -100, ty: -50 }, { width: 800, height: 600 }), "50 25 400 300");
});

test("zoomLabel gives a rounded percent", () => {
  assert.equal(zoomLabel(1), "100%");
  assert.equal(zoomLabel(0.456), "46%");
});

test("exceedsDragThreshold ignores small movement", () => {
  assert.equal(exceedsDragThreshold(0, 0, 2, 2), false);
  assert.equal(exceedsDragThreshold(0, 0, 5, 0), true);
  assert.equal(exceedsDragThreshold(10, 10, 10, 15), true);
});
