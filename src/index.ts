#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { main } from "./cli/index.js";

export { main } from "./cli/index.js";

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const code = await main();
  process.exitCode = code;
}
