import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInit } from "./init.js";
import { runValidate } from "./validate.js";
import { runAdd, runAgents, runCreds, runProfiles, runSkills } from "./manage.js";
import { runStart, runStatus } from "../workflow/lifecycle.js";
import { runTasks } from "../workflow/commands.js";
import { runLoop, runWatch } from "../workflow/loop.js";
import { runDoctor } from "./doctor.js";
import { runWorkflow } from "../workflow/migration.js";
import { runUi } from "../ui/core/server.js";
import { runPlan } from "./plan.js";

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

  if (command === "init") return runInit(args, cwd);
  if (command === "validate") return runValidate(args, cwd);
  if (command === "add") return runAdd(args, cwd);
  if (command === "agents") return runAgents(args, cwd);
  if (command === "creds") return runCreds(args, cwd);
  if (command === "doctor") return runDoctor(args, cwd);
  if (command === "profiles") return runProfiles(args, cwd);
  if (command === "skills") return runSkills(args, cwd);
  if (command === "status") return runStatus(args, cwd);
  if (command === "start") return runStart(args, cwd);
  if (command === "tasks") return runTasks(args, cwd);
  if (command === "loop") return runLoop(args, cwd);
  if (command === "watch") return runWatch(args, cwd);
  if (command === "workflow") return runWorkflow(args, cwd);
  if (command === "ui") return runUi(args, cwd);
  if (command === "plan") return runPlan(args, cwd);

  console.error(`Unknown command: ${command}`);
  return 1;
}

function helpText() {
  return `@inotives/agent-rig

Usage: agent-rig <command> [options]

Commands:
  init       Scaffold .agent-rig/ in the current project
  add        Add an agent to an existing workspace
  profiles   List, show, or update editable agent profiles
  doctor     Check local AgentRig environment and workspace health
  validate   Validate workspace files
  agents     List configured agents
  creds      Manage credential declarations
  skills     Install or list skills
  status     Show live workspace state
  start      Print launch context for an agent
  tasks      Create, update, list, and show shared task files
  loop       Run the worker-reviewer loop shell
  watch      Process one ready shared task with --once
  workflow   Manage workflow storage and migrations
  ui         Serve the local task-board UI
  plan       Discover issues and manage reviewed issue plans
  version    Print package version

Examples:
  agent-rig init
  agent-rig init --yes
  agent-rig add api-worker --role worker --tool codex --profile worker
  agent-rig plan github-issue
  agent-rig plan github-issue 123
  agent-rig plan branch 123
  agent-rig plan resume 123
  agent-rig plan approve 123
  agent-rig plan tasks 123`;
}

function packageVersion() {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  return JSON.parse(readFileSync(file, "utf8")).version;
}
