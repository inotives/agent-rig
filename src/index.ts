#!/usr/bin/env node
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInit } from "./init.js";
import { runValidate } from "./validate.js";
import { runAdd, runAgents, runCreds, runProfiles, runSkills } from "./manage.js";
import { runStart, runStatus } from "./live.js";
import { runTask, runTasks, runWatch } from "./tasks.js";
import { runDoctor } from "./doctor.js";

export async function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  const [command, ...args] = argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(helpText());
    return 0;
  }

  if (command === "--version" || command === "-v" || command === "version") {
    console.log(packageVersion());
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
  if (command === "doctor") return runDoctor(args, cwd);
  if (command === "profiles") return runProfiles(args, cwd);
  if (command === "skills") return runSkills(args, cwd);
  if (command === "status") return runStatus(args, cwd);
  if (command === "start") return runStart(args, cwd);
  if (command === "task") return runTask(args, cwd);
  if (command === "tasks") return runTasks(args, cwd);
  if (command === "watch") return runWatch(args, cwd);

  console.error(`Unknown command: ${command}`);
  return 1;
}

function helpText() {
  return `@inotives/agent-rig

Usage: agent-rig <command> [options]

Commands:
  init       Scaffold .agent-rig/ in the current project
  add        Add an agent to an existing workspace
  profiles   List or show editable agent profiles
  doctor     Check local AgentRig environment and workspace health
  validate   Validate workspace files
  agents     List configured agents
  creds      Manage credential declarations
  skills     Install or list skills
  status     Show live workspace state
  start      Print launch context for an agent
  task       Add legacy per-agent watch-loop tasks
  tasks      Create, list, and show shared task files
  watch      Run a filesystem watch loop
  version    Print package version

Examples:
  agent-rig init
  agent-rig init --yes
  agent-rig add api-worker --role worker --tool codex --profile worker`;
}

function packageVersion() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  return JSON.parse(readFileSync(file, "utf8")).version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const code = await main();
  process.exitCode = code;
}
