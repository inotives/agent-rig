#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runInit } from "./init.js";

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: agent-rig init [--yes]");
    return 0;
  }

  if (command !== "init") {
    console.error(`Unknown command: ${command}`);
    return 1;
  }

  return runInit(args, cwd);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main();
  process.exitCode = code;
}
