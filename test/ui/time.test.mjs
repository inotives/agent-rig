import assert from "node:assert/strict";
import test from "node:test";
import { elapsedHours, formatDay, formatHours } from "../../dist/ui/common/time.js";

test("formatDay shows a short date, keeps a date-only value on its own day, and handles bad input", () => {
  assert.equal(formatDay("2026-10-03"), "3 Oct 2026");
  assert.match(formatDay("2026-10-05T10:00:00.000Z"), /^\d{1,2} Oct 2026$/);
  assert.equal(formatDay(""), "—");
  assert.equal(formatDay("not a date"), "not a date");
});

test("elapsedHours gives whole hours, a floor label, and a dash for bad spans", () => {
  assert.equal(elapsedHours("2026-10-08T06:00:00Z", "2026-10-10T12:00:00Z"), "54 h");
  assert.equal(elapsedHours("2026-10-01", "2026-10-03"), "48 h");
  assert.equal(elapsedHours("2026-10-01T00:00:00Z", "2026-10-01T00:10:00Z"), "< 1 h");
  assert.equal(elapsedHours("2026-01-01", "2026-12-31"), "8,736 h");
  assert.equal(elapsedHours("", "2026-10-03"), "—");
  assert.equal(elapsedHours("2026-10-03", "2026-10-01"), "—");
  assert.equal(elapsedHours("bad", "2026-10-01"), "—");
});

test("formatHours rounds to whole hours and handles small and bad spans", () => {
  assert.equal(formatHours(90 * 3_600_000), "90 h");
  assert.equal(formatHours(10 * 60_000), "< 1 h");
  assert.equal(formatHours(0), "< 1 h");
  assert.equal(formatHours(-1), "—");
  assert.equal(formatHours(Number.NaN), "—");
});
