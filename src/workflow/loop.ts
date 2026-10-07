import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireWorkspace, Agent } from "../workspace/workspace.js";
import {
  assemblePrompt,
  dateStamp,
  fail,
  finish,
  handleLoopResult,
  loopFailureMessage,
  loopHelp,
  loopIntervalMs,
  loopMaxTicks,
  message,
  nextActionableTask,
  nextRunId,
  option,
  parseOptions,
  readSharedTasks,
  requireAgent,
  requireLoopAgent,
  runLoopAgent,
  selectLoopTask,
  sleep,
  updateAgentSession,
  updateSharedTask,
  withLock,
  type SharedTask
} from "./commands.js";

export async function runWatch(args: string[], cwd: string) {
  try {
    if (args.length !== 1 || args[0] !== "--once") return fail("Usage: agent-rig watch --once");
    return withLock(cwd, "watch.lock", "watch.lock already exists. Stop the running watcher or remove the stale lock.", () => processReady(cwd));
  } catch (cause) {
    return fail(message(cause));
  }
}

export async function runLoop(args: string[], cwd: string) {
  try {
    if (args.includes("--help") || args.includes("-h") || args.includes("help")) return loopHelp();
    const options = parseOptions(args, new Set(["--once", "--worker", "--reviewer", "--interval"]), new Set(["--once"]));
    const root = requireWorkspace(cwd);
    const workerName = option(options, "--worker") ?? "worker";
    const reviewerName = option(options, "--reviewer") ?? "reviewer";
    const intervalText = option(options, "--interval") ?? "60";
    const interval = Number(intervalText);
    if (!Number.isInteger(interval) || interval < 1) return fail(`Invalid interval: ${intervalText}`);
    const once = options.has("--once");
    const maxTicks = loopMaxTicks();
    const intervalMs = loopIntervalMs(interval);
    const workerAgent = requireLoopAgent(root, workerName, "worker");
    const reviewerAgent = requireLoopAgent(root, reviewerName, "reviewer");

    return await withLock(cwd, "loop.lock", "loop.lock already exists. Stop the running loop or remove the stale lock.", async () => {
      let ticks = 0;
      while (true) {
        runLoopTick(root, cwd, workerName, reviewerName, workerAgent, reviewerAgent);
        ticks += 1;
        if (once || (maxTicks > 0 && ticks >= maxTicks)) return 0;
        console.log(`Waiting ${interval} seconds before next poll.`);
        await sleep(intervalMs);
      }
    });
  } catch (cause) {
    return fail(message(cause));
  }
}

function runLoopTick(root: string, cwd: string, workerName: string, reviewerName: string, workerAgent: Agent, reviewerAgent: Agent) {
  const selection = selectLoopTask(readSharedTasks(root, cwd), workerName);
  if (selection.kind === "review") {
    const handoffCount = selection.task.store.listHandoffs(selection.task.projectIdentifier, selection.task.id).length;
    const result = runLoopAgent(root, cwd, reviewerAgent, selection.task);
    handleLoopResult(cwd, result, reviewerAgent, selection.task.id, handoffCount);
    if (result.exitStatus !== 0) throw new Error(result.failureSummary || loopFailureMessage(reviewerAgent.tool, result.exitStatus, reviewerName, "reviewer", selection.task.id, result.stderr, result.error));
    console.log(`Ran reviewer ${reviewerName} on ${selection.task.id}.`);
    return;
  }
  if (selection.kind === "worker") {
    updateSharedTask(selection.task, { status: "in_progress", updated_on: dateStamp(new Date()) });
    const handoffCount = selection.task.store.listHandoffs(selection.task.projectIdentifier, selection.task.id).length;
    const result = runLoopAgent(root, cwd, workerAgent, selection.task);
    handleLoopResult(cwd, result, workerAgent, selection.task.id, handoffCount);
    if (result.exitStatus !== 0) throw new Error(result.failureSummary || loopFailureMessage(workerAgent.tool, result.exitStatus, workerName, "worker", selection.task.id, result.stderr, result.error));
    console.log(`Ran worker ${workerName} on ${selection.task.id}.`);
    return;
  }
  console.log("No actionable loop task.");
}

async function processReady(cwd: string) {
  const root = requireWorkspace(cwd);
  const skipped: string[] = [];
  const task = nextActionableTask(readSharedTasks(root, cwd), undefined, skipped);
  for (const warning of skipped) console.warn(warning);
  if (task) {
    const agent = requireAgent(root, task.assigned_to);
    runOne(cwd, root, agent, task);
  }
  const count = task ? 1 : 0;
  console.log(`Processed ${count} task${count === 1 ? "" : "s"}.`);
  return 0;
}

function runOne(cwd: string, root: string, agent: Agent, task: SharedTask) {
  const started = new Date();
  const runId = nextRunId(join(root, agent.name, "runs"), task.id, started);
  updateSharedTask(task, { status: "in_progress", run_id: runId, started_at: started.toISOString(), message: "", updated_on: dateStamp(started) });
  updateAgentSession(root, agent, "running");
  try {
    const runDir = join(root, agent.name, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "prompt.md"), assemblePrompt(root, agent, task), "utf8");
    const blocked = task.meta.simulate === "blocked";
    const status = blocked ? "blocked" : "done";
    const msg = `Fake adapter ${blocked ? "blocked" : "completed"} ${task.id}.`;
    finish(root, agent, task, runDir, runId, status, msg, true);
  } catch (cause) {
    const msg = message(cause);
    const runDir = join(root, agent.name, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    finish(root, agent, task, runDir, runId, "blocked", msg, true);
  }
}
