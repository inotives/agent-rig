#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runInit } from "./init.js";
import { runValidate } from "./validate.js";
import { runAdd, runAgents, runCreds, runSkills } from "./manage.js";
import { runStart, runStatus } from "./live.js";
import { runTask, runWatch } from "./tasks.js";

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h") {
    console.log("Usage: agent-rig <init|validate|add|agents|creds|skills|status|start|task|watch> [options]");
    return 0;
  }

  if (command === "init") {
    return runInit(args, cwd);
  }

  if (command === "validate") {
    return runValidate(args, cwd);
  }

  if (command === "add") return runAdd(args, cwd);
  if (command === "agents") return runAgents(args, cwd);
  if (command === "creds") return runCreds(args, cwd);
  if (command === "skills") return runSkills(args, cwd);
  if (command === "status") return runStatus(args, cwd);
  if (command === "start") return runStart(args, cwd);
  if (command === "task") return runTask(args, cwd);
  if (command === "watch") return runWatch(args, cwd);

  console.error(`Unknown command: ${command}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const code = await main();
  process.exitCode = code;
}
