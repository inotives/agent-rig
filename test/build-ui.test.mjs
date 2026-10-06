import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generated UI CSS includes DaisyUI components and configured themes", async () => {
  const css = await readFile(new URL("../dist/ui.css", import.meta.url), "utf8");

  assert.match(css, /\.btn/);
  assert.match(css, /\[data-theme=light\]/);
  assert.match(css, /\[data-theme=dark\]/);
});
