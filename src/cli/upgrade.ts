import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@iarna/toml";
import { parse as parseYaml } from "yaml";
import { createWorkflowStore, readWorkspaceWorkflowConfig, SQLiteWorkflowStore, validateTaskMutation } from "../workflow/index.js";

const templates = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");
const begin = "<!-- agent-rig:managed-context:start -->";
const end = "<!-- agent-rig:managed-context:end -->";

/** Refresh only managed instructions. Never launch processes or mutate workflow state. */
export function runUpgrade(args: string[], cwd: string): number {
  if (args.includes("--help") || args.includes("-h")) {
    console.log("Usage: agent-rig upgrade [--dry-run]\nBack up .agent-rig beside the deployment, then refresh managed instructions.\nStop workflow writers before upgrading. Invalid task state stops the upgrade without repair.");
    return 0;
  }
  let backup: string | undefined;
  try {
    if (args.some((arg) => arg !== "--dry-run")) throw new Error("Unknown upgrade option. Use upgrade [--dry-run].");
    cwd = resolve(cwd);
    const root = join(cwd, ".agent-rig");
    safePath(root, root);
    if (!lstatSync(root).isDirectory()) throw new Error(`Missing deployment directory: ${root}`);
    if (existsSync(join(root, "_shared", "loop.lock"))) throw new Error("Stop the diagnostic loop and remove its lock before upgrading.");
    const changes = managedChanges(root);
    const problems = taskProblems(cwd);
    if (problems.length) {
      for (const problem of problems) console.error(`Invalid task state: ${problem}`);
      throw new Error("Upgrade stopped. No files changed. Ask the planner to repair the reported records explicitly.");
    }
    console.log(`Deployment: ${root}`);
    console.log("Task state: valid");
    if (!changes.length) {
      console.log("Managed instructions are current. No files changed.");
      return 0;
    }
    for (const change of changes) console.log(`${args.includes("--dry-run") ? "Would update" : "Update"}: ${change.path}`);
    if (args.includes("--dry-run")) return 0;
    backup = mkdtempSync(join(cwd, ".agent-rig-backup-"));
    console.log(`Backup directory: ${backup}`);
    cpSync(root, join(backup, ".agent-rig"), { recursive: true, dereference: false, verbatimSymlinks: true });
    console.log(`Backup complete: ${join(backup, ".agent-rig")}`);
    console.log(`Recovery: stop workflow writers; move ${root} aside; copy ${join(backup, ".agent-rig")} to ${root}.`);
    for (const change of changes) {
      safePath(root, change.path);
      mkdirSync(dirname(change.path), { recursive: true });
      writeFileSync(change.path, change.content, "utf8");
    }
    console.log("Upgrade complete. Workflow data and local skills and tools were preserved.");
    return 0;
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    if (backup) console.error(`Upgrade failed. Backup directory: ${backup}. Check that its .agent-rig copy is complete before recovery.`);
    return 1;
  }
}

function safePath(root: string, target: string) {
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`Managed path must stay inside ${root}: ${target}`);
  let current = root;
  for (const part of ["", ...rel.split(/[\\/]/).filter(Boolean)]) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link in managed path: ${current}`);
      if (current === target && stat.isFile() && stat.nlink > 1) throw new Error(`Refusing multiple hard links in managed path: ${current}`);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
}

function managedChanges(root: string) {
  const changes: Array<{ path: string; content: string }> = [];
  const add = (path: string, content: string) => {
    safePath(root, path);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) changes.push({ path, content });
  };
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const dir = join(root, entry.name);
    const config = join(dir, "agent.toml");
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in agent directory: ${dir}`);
    if (!entry.isDirectory() || !existsSync(config) || entry.name === "_shared") continue;
    safePath(root, config);
    const data = parse(readFileSync(config, "utf8"));
    const table = (data.agent && typeof data.agent === "object" ? data.agent : data) as Record<string, unknown>;
    if (!["planner", "worker", "reviewer"].includes(String(table.role))) continue;
    if (typeof table.instructions !== "string" || !table.instructions.trim()) throw new Error(`Invalid instructions path: ${config}`);
    const target = resolve(dir, table.instructions);
    if (relative(dir, target).startsWith("..") || isAbsolute(relative(dir, target))) throw new Error(`Instructions must stay inside ${dir}`);
    const parts = relative(dir, target).toLowerCase().split(/[\\/]/);
    const contextTarget = typeof table.context === "string" ? resolve(dir, table.context) : join(dir, "context.md");
    if (parts.some((part) => ["skills", "tools", "configs", "config", "profiles", "assets", "tasks", "handoff_logs"].includes(part) || part.startsWith(".")) ||
        ["context.md", "skill.md", "workflow.md", "readme.md"].includes(parts.at(-1) ?? "") ||
        target.toLowerCase() === contextTarget.toLowerCase() || !target.toLowerCase().endsWith(".md")) {
      throw new Error(`Instructions target is a protected local asset: ${target}`);
    }
    add(target, readFileSync(join(templates, "profiles", `${table.role}.md`), "utf8").replaceAll("<agent>", entry.name));
  }
  const workflow = readFileSync(join(templates, "workflow.md"), "utf8");
  add(join(root, "_shared", "workflow.md"), workflow);
  const contextPath = join(root, "_shared", "context.md");
  safePath(root, contextPath);
  let context = readFileSync(contextPath, "utf8");
  const contract = workflow.match(/## 3\. Run The Planner-Manager Worker And Reviewer Flow\n([\s\S]*?)(?=## 4\.)/);
  if (!contract) throw new Error("Installed workflow template has no coordination contract.");
  const managed = `${begin}\n# AgentRig Coordination Contract\n${contract[1].trim()}\n\n${readFileSync(join(templates, "safe-operations.md"), "utf8").trim()}\n${end}`;
  if (context.includes(begin) || context.includes(end)) {
    const start = context.indexOf(begin);
    const finish = context.indexOf(end);
    if (start < 0 || finish < start || context.indexOf(begin, start + begin.length) >= 0 || context.indexOf(end, finish + end.length) >= 0) throw new Error(`Invalid managed context markers: ${contextPath}`);
    if (!context.match(/^<!-- agent-rig:managed-context:start -->\r?$/m) || !context.match(/^<!-- agent-rig:managed-context:end -->\r?$/m)) throw new Error(`Invalid managed context markers: ${contextPath}`);
    context = context.slice(0, start) + managed + context.slice(finish + end.length);
  } else {
    // A heading bounds each legacy section. Unknown subsections remain local text.
    for (const heading of ["# AgentRig Coordination Contract", "## Safe Operations"]) {
      const matches = [...context.matchAll(new RegExp(`^${heading}\\r?$`, "gm"))];
      if (matches.length > 1) throw new Error(`Ambiguous legacy context boundaries: ${contextPath}`);
      if (matches.length === 1) {
        const start = matches[0].index!;
        const bodyStart = start + matches[0][0].length;
        const next = context.slice(bodyStart).search(/^#{1,6} /m);
        const finish = next < 0 ? context.length : bodyStart + next;
        // A nested heading could be local text within the generated section.
        // Keep it and everything after it rather than guessing its ownership.
        context = context.slice(0, start) + context.slice(finish);
      }
    }
    context = `${context.trimEnd()}\n\n${managed}\n`;
  }
  add(contextPath, context);
  return changes;
}

function taskProblems(cwd: string): string[] {
  const problems: string[] = [];
  const config = readWorkspaceWorkflowConfig(cwd);
  if (config.workflow_store.provider === "markdown") {
    const dir = join(cwd, ".agent-rig", "_shared", "tasks");
    const ids = new Set<string>();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const path = join(dir, entry.name);
      try {
        const match = readFileSync(path, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!match) throw new Error("Missing YAML frontmatter");
        const meta = parseYaml(match[1]);
        if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("Frontmatter must be an object");
        for (const key of ["id", "title", "type", "status", "assigned_to", "created_by", "created_on", "updated_on", "priority"]) {
          if (typeof meta[key] !== "string" || (key !== "assigned_to" && !meta[key].trim())) throw new Error(`Missing or invalid ${key}`);
        }
        if (!Array.isArray(meta.depends_on) || meta.depends_on.some((id: unknown) => typeof id !== "string" || !id)) throw new Error("Invalid depends_on");
        if (ids.has(meta.id)) throw new Error(`Duplicate task ID: ${meta.id}`);
        ids.add(meta.id);
      } catch (cause) { problems.push(`${path}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    }
  }
  if (problems.length) return problems;
  const { store, projectIdentifier } = createWorkflowStore(cwd, { readonly: true });
  try {
    const tasks = store.listTasks(projectIdentifier);
    for (const task of tasks) {
      try {
        for (const key of ["id", "title", "createdBy", "createdOn", "updatedOn"] as const) {
          if (typeof task[key] !== "string" || !task[key].trim()) throw new Error(`Missing or invalid ${key}`);
        }
        if (!["task", "bug", "story", "epic", "chore", "research", "doc"].includes(task.type)) throw new Error(`Invalid type: ${task.type}`);
        if (!["low", "normal", "high"].includes(task.priority)) throw new Error(`Invalid priority: ${task.priority}`);
        if (["ready", "in_progress", "review"].includes(task.status) && !task.assignedTo.trim()) throw new Error("Active task requires assigned_to");
        if (task.parent && !tasks.some((parent) => parent.id === task.parent)) throw new Error(`Missing parent: ${task.parent}`);
        validateTaskMutation(task, task, tasks);
      }
      catch (cause) { problems.push(`${task.id}: ${cause instanceof Error ? cause.message : String(cause)}`); }
    }
  } finally { if (store instanceof SQLiteWorkflowStore) store.close(); }
  return problems;
}
