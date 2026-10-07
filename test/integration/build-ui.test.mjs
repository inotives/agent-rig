import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

test("generated CLI entrypoint is executable", async () => {
  const mode = (await stat(new URL("../../dist/index.js", import.meta.url))).mode;

  assert.notEqual(mode & 0o111, 0);
});

test("generated UI CSS includes DaisyUI components and configured themes", async () => {
  const css = await readFile(new URL("../../dist/ui.css", import.meta.url), "utf8");

  assert.match(css, /\.btn/);
  assert.match(css, /\[data-theme=light\]/);
  assert.match(css, /\[data-theme=dark\]/);
});
