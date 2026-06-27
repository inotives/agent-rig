#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { runInit } from "./init.js";
import { runValidate } from "./validate.js";

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: agent-rig <init|validate> [options]");
    return 0;
  }

  if (command === "init") {
    return runInit(args, cwd);
  }

  if (command === "validate") {
    return runValidate(args, cwd);
  }

  console.error(`Unknown command: ${command}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = await main();
  process.exitCode = code;
}
