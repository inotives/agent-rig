import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { requireWorkspace } from "./workspace.js";
import {
  MarkdownWorkflowStore,
  SQLiteWorkflowStore,
  WorkflowHandoff,
  WorkflowTask,
  readWorkspaceWorkflowConfig
} from "./workflow-store.js";

const migrationKeys = ["storage_status", "migrated_to", "migrated_at"] as const;
const legacyHandoffFilename = /^\d{4}-\d{2}-\d{2}-(?:\d{4}|task-[a-z0-9-]+)_(?:.+_)?[a-z0-9-]+_[a-z][a-z0-9-]*\.md$/;

export function runWorkflow(args: string[], cwd: string): number {
  if (args.length === 3 && args[0] === "migrate" && args[1] === "--to" && args[2] === "sqlite") {
    try {
      migrateMarkdownToSQLite(cwd);
      console.log("Migrated Markdown workflow records to SQLite.");
      return 0;
    } catch (cause) {
      console.error(cause instanceof Error ? cause.message : String(cause));
      return 1;
    }
  }
  console.error("Usage: agent-rig workflow migrate --to sqlite");
  return 1;
}

export function migrateMarkdownToSQLite(cwd: string, now = new Date().toISOString()): void {
  const root = requireWorkspace(cwd);
  const configPath = join(root, "_shared", "agent-rig.json");
  const config = readWorkspaceWorkflowConfig(cwd);
  if (config.workflow_store.provider !== "markdown") throw new Error("Workflow migration requires Markdown to be the active provider.");

  const shared = join(root, "_shared");
  const databasePath = join(shared, "workflow.sqlite");
  if ([databasePath, `${databasePath}-wal`, `${databasePath}-shm`].some((path) => existsSync(path))) {
    throw new Error(`Refusing to overwrite existing SQLite database: ${databasePath}`);
  }

  const markdown = new MarkdownWorkflowStore(root, config.project_identifier);
  validateSourceFilenames(join(shared, "tasks"), join(shared, "handoff_logs"));
  const tasks = markdown.listTasks(config.project_identifier);
  const handoffs = markdown.listAllHandoffs(config.project_identifier);
  const taskFiles = taskSourceFiles(join(shared, "tasks"));
  const records = tasks.map((task) => withSourceFilename(task, taskFiles));
  validateSource(records, handoffs, config.project_identifier);

  const tempDir = mkdtempSync(join(shared, ".workflow-migration-"));
  const temporaryDatabase = join(tempDir, "workflow.sqlite");
  let installed = false;
  try {
    const sqlite = new SQLiteWorkflowStore(temporaryDatabase, config.project_identifier);
    try {
      for (const task of records) sqlite.importTask(task, handoffs.filter((handoff) => handoff.taskId === task.id));
      verifyImport(sqlite, records, handoffs, config.project_identifier);
    } finally {
      sqlite.close();
    }

    renameSync(temporaryDatabase, databasePath);
    installed = true;
    updateProvider(configPath, config.project_identifier);

    const markerFailures = annotateMarkdown(records, handoffs, taskFiles, join(shared, "handoff_logs"), now);
    if (markerFailures.length) console.error(`SQLite migration completed, but some Markdown markers failed: ${markerFailures.join(", ")}`);
  } catch (cause) {
    if (installed && readWorkspaceWorkflowConfig(cwd).workflow_store.provider === "markdown") removeDatabase(databasePath);
    throw cause;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function taskSourceFiles(directory: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!existsSync(directory)) return result;
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".md")) continue;
    const id = name.match(/^(task-[a-z0-9-]+?)(?:_|-)/)?.[1];
    if (!id) continue;
    if (result.has(id)) throw new Error(`Multiple source files found for task: ${id}`);
    result.set(id, name);
  }
  return result;
}

function validateSourceFilenames(tasksDirectory: string, handoffDirectory: string): void {
  if (existsSync(tasksDirectory)) {
    for (const name of readdirSync(tasksDirectory)) {
      if (!name.endsWith(".md") || name === ".gitkeep") continue;
      if (!/^task-[a-z0-9-]+_.+\.md$/.test(name)) throw new Error(`Unsupported task source filename: ${name}`);
    }
  }
  if (existsSync(handoffDirectory)) {
    for (const name of readdirSync(handoffDirectory)) {
      if (!name.endsWith(".md")) continue;
      if (!legacyHandoffFilename.test(name)) throw new Error(`Unsupported handoff source filename: ${name}`);
    }
  }
}

function withSourceFilename(task: WorkflowTask, files: Map<string, string>): WorkflowTask {
  const sourceFilename = files.get(task.id);
  if (!sourceFilename) throw new Error(`Unable to determine source filename for task: ${task.id}`);
  return { ...task, metadata: { ...task.metadata, source_filename: sourceFilename } };
}

function validateSource(tasks: WorkflowTask[], handoffs: WorkflowHandoff[], projectIdentifier: string): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id || ids.has(task.id)) throw new Error(`Invalid or duplicate task identifier: ${task.id}`);
    ids.add(task.id);
    if (typeof task.metadata.project_identifier !== "undefined" && task.metadata.project_identifier !== projectIdentifier) {
      throw new Error(`Task ${task.id} has a mismatched project_identifier.`);
    }
    rejectMarkers(task.metadata, `task ${task.id}`);
    if (!Array.isArray(task.dependsOn) || task.dependsOn.some((id) => typeof id !== "string" || !id)) throw new Error(`Task ${task.id} has invalid dependencies.`);
    if (task.dependsOn.includes(task.id)) throw new Error(`Task ${task.id} depends on itself.`);
    if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error(`Task ${task.id} has duplicate dependencies.`);
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`Task ${task.id} depends on unknown task: ${dependency}`);
    }
    if (task.parent && !ids.has(task.parent)) throw new Error(`Task ${task.id} has unknown parent: ${task.parent}`);
  }
  const sequences = new Map<string, Set<number>>();
  for (const handoff of handoffs) {
    if (!ids.has(handoff.taskId)) throw new Error(`Handoff references unknown task: ${handoff.taskId}`);
    rejectMarkers(handoff.metadata, `handoff ${handoff.taskId}`);
    if (typeof handoff.projectIdentifier !== "string" || handoff.projectIdentifier !== projectIdentifier) throw new Error(`Handoff for ${handoff.taskId} has a mismatched project identifier.`);
    if (!handoff.metadata.filename || typeof handoff.metadata.filename !== "string") throw new Error(`Handoff for ${handoff.taskId} is missing its source filename.`);
    if (!Number.isInteger(handoff.sequence) || handoff.sequence < 1) throw new Error(`Handoff for ${handoff.taskId} has an invalid sequence.`);
    const taskSequences = sequences.get(handoff.taskId) ?? new Set<number>();
    if (taskSequences.has(handoff.sequence)) throw new Error(`Handoff for ${handoff.taskId} has a duplicate sequence: ${handoff.sequence}`);
    taskSequences.add(handoff.sequence);
    sequences.set(handoff.taskId, taskSequences);
    if (typeof handoff.answersSequence !== "undefined" && (!Number.isInteger(handoff.answersSequence) || handoff.answersSequence < 1 || !taskSequences.has(handoff.answersSequence))) {
      throw new Error(`Handoff for ${handoff.taskId} has an invalid answers_sequence.`);
    }
  }
}

function rejectMarkers(metadata: Record<string, unknown>, label: string): void {
  if (migrationKeys.some((key) => Object.prototype.hasOwnProperty.call(metadata, key))) throw new Error(`Refusing to migrate already-marked ${label}.`);
}

function verifyImport(sqlite: SQLiteWorkflowStore, tasks: WorkflowTask[], handoffs: WorkflowHandoff[], projectIdentifier: string): void {
  const imported = sqlite.listTasks(projectIdentifier);
  if (imported.length !== tasks.length || sqlite.listAllHandoffs(projectIdentifier).length !== handoffs.length) throw new Error("SQLite migration verification failed: record counts differ.");
  for (const expected of tasks) {
    const actual = sqlite.getTask(projectIdentifier, expected.id);
    const imported = { ...expected, metadata: { ...expected.metadata, imported_handoff_count: handoffs.filter((handoff) => handoff.taskId === expected.id).length, ...(handoffs.filter((handoff) => handoff.taskId === expected.id).length < 2 ? { incomplete_handoff_trail: true } : {}) } };
    const actualDependencies = sqlite.listDependencies(projectIdentifier, expected.id).sort();
    const expectedDependencies = [...expected.dependsOn].sort();
    if (!actual || !sameTask(actual, imported) || JSON.stringify(actualDependencies) !== JSON.stringify(expectedDependencies)) throw new Error(`SQLite migration verification failed for task: ${expected.id}`);
  }
  for (const expected of handoffs) {
    const actual = sqlite.listHandoffs(projectIdentifier, expected.taskId).find((item) => item.sequence === expected.sequence);
    if (!actual || !sameHandoff(actual, expected)) throw new Error(`SQLite migration verification failed for handoff: ${String(expected.metadata.filename)}`);
  }
}

function sameTask(actual: WorkflowTask, expected: WorkflowTask): boolean {
  return actual.projectIdentifier === expected.projectIdentifier && actual.id === expected.id && actual.title === expected.title && actual.type === expected.type && actual.status === expected.status && actual.assignedTo === expected.assignedTo && actual.priority === expected.priority && actual.parent === expected.parent && actual.createdBy === expected.createdBy && actual.createdOn === expected.createdOn && actual.updatedOn === expected.updatedOn && actual.body === expected.body && stable(actual.metadata) === stable(expected.metadata);
}

function sameHandoff(actual: WorkflowHandoff, expected: WorkflowHandoff): boolean {
  return actual.projectIdentifier === expected.projectIdentifier && actual.taskId === expected.taskId && actual.sequence === expected.sequence && actual.sender === expected.sender && actual.recipient === expected.recipient && actual.status === expected.status && actual.message === expected.message && actual.createdAt === expected.createdAt && actual.answersSequence === expected.answersSequence && stable(actual.metadata) === stable(expected.metadata);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function updateProvider(configPath: string, projectIdentifier: string): void {
  const source = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const next = { ...source, workflow_store: { ...(source.workflow_store as Record<string, unknown> ?? {}), provider: "sqlite" }, project_identifier: projectIdentifier };
  const temporary = `${configPath}.migration-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(temporary, configPath);
}

function annotateMarkdown(tasks: WorkflowTask[], handoffs: WorkflowHandoff[], files: Map<string, string>, handoffDirectory: string, migratedAt: string): string[] {
  const failures: string[] = [];
  const paths = [...tasks.map((task) => files.get(task.id)).filter((name): name is string => Boolean(name)).map((name) => join(handoffDirectory, "..", "tasks", name)), ...handoffs.map((handoff) => join(handoffDirectory, String(handoff.metadata.filename)))];
  for (const path of paths) {
    try { replaceFrontmatter(path, migratedAt); } catch { failures.push(basename(path)); }
  }
  return failures;
}

export function replaceFrontmatter(path: string, migratedAt: string): void {
  const source = readFileSync(path, "utf8");
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) throw new Error(`Missing frontmatter: ${path}`);
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) throw new Error(`Missing frontmatter: ${path}`);
  const marker = stringifyYaml({ storage_status: "migrated", migrated_to: "sqlite", migrated_at: migratedAt }).trimEnd();
  const replacement = `${match[0].replace(/\r?\n---\r?\n?$/, "\n")}${marker}\n---\n`;
  const temporary = `${path}.migration-${process.pid}`;
  try {
    writeFileSync(temporary, replacement + source.slice(match[0].length), "utf8");
    renameSync(temporary, path);
  } catch (cause) {
    rmSync(temporary, { force: true });
    throw cause;
  }
}

function removeDatabase(path: string): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
}
