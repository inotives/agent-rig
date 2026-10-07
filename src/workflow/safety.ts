import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { parse as parseYaml } from "yaml";
import { MarkdownWorkflowStore, SQLiteWorkflowStore, WorkflowHandoff, WorkflowTask, readWorkspaceWorkflowConfig } from "./index.js";
import { replaceFrontmatter } from "./migration.js";

export type SafetyReport = {
  imported: string[];
  skipped: string[];
  conflicted: string[];
  orphaned: string[];
  wouldLose: string[];
  backup?: string;
};

export type PlaceholderRepairReport = {
  repaired: string[];
  skipped: string[];
  refused: string[];
  dryRun: boolean;
};

type SourceRecord = { task: WorkflowTask; taskFile: string; handoffs: WorkflowHandoff[] };
class MarkdownSourceConflictError extends Error {}

function workspace(cwd: string) {
  const root = join(cwd, ".agent-rig");
  const shared = join(root, "_shared");
  const config = readWorkspaceWorkflowConfig(cwd);
  if (config.workflow_store.provider !== "sqlite") throw new Error("Workflow safety operations require SQLite to be the active provider.");
  return { root, shared, config };
}

function withWorkflowLock<T>(shared: string, operation: () => T): T {
  const lock = join(shared, "workflow.lock");
  if (existsSync(lock) || existsSync(join(shared, "loop.lock"))) throw new Error("The workflow is already locked by another operation.");
  mkdirSync(shared, { recursive: true });
  let fd: number | undefined;
  let acquired = false;
  try {
    fd = openSync(lock, "wx");
    acquired = true;
    writeFileSync(fd, `${process.pid}\n`, "utf8");
    return operation();
  } finally {
    if (typeof fd === "number") closeSync(fd);
    if (acquired) rmSync(lock, { force: true });
  }
}

function sourceRecords(shared: string, projectIdentifier: string): SourceRecord[] {
  const tasksDirectory = join(shared, "tasks");
  const handoffsDirectory = join(shared, "handoff_logs");
  const markdown = new MarkdownWorkflowStore(dirname(shared), projectIdentifier);
  const tasks = markdown.listTasks(projectIdentifier);
  const files = new Map<string, string>();
  if (existsSync(tasksDirectory)) for (const name of readdirSync(tasksDirectory)) {
    if (!name.endsWith(".md")) continue;
    const match = readFileSync(join(tasksDirectory, name), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    const metadata = parseYaml(match[1]);
    if (metadata && typeof metadata.id === "string") {
      const path = join(tasksDirectory, name);
      const previous = files.get(metadata.id);
      if (previous) throw new MarkdownSourceConflictError(`duplicate Markdown task ID ${metadata.id} in ${basename(previous)} and ${name}`);
      files.set(metadata.id, path);
    }
  }
  const handoffs = markdown.listAllHandoffs(projectIdentifier);
  return tasks.map((task) => ({
    task,
    taskFile: files.get(task.id) ?? join(tasksDirectory, String(task.metadata.source_filename ?? `${task.id}.md`)),
    handoffs: handoffs.filter((handoff) => handoff.taskId === task.id)
  }));
}

function marked(task: WorkflowTask) { return task.metadata.storage_status === "migrated" || task.metadata.migrated_to === "sqlite"; }

export function importMarkdownToSQLite(cwd: string, now = new Date().toISOString()): SafetyReport {
  const { shared, config } = workspace(cwd);
  return withWorkflowLock(shared, () => {
    const sqlite = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), config.project_identifier);
    try {
      const report: SafetyReport = { imported: [], skipped: [], conflicted: [], orphaned: [], wouldLose: [] };
      const records = sourceRecords(shared, config.project_identifier);
      const sourceHandoffs = new MarkdownWorkflowStore(dirname(shared), config.project_identifier).listAllHandoffs(config.project_identifier);
      const known = new Set(sqlite.listTasks(config.project_identifier).map((task) => task.id));
      const knownHandoffs = new Set(sqlite.listAllHandoffs(config.project_identifier).map((handoff) => `${handoff.taskId}:${handoff.sequence}`));
      const taskIds = new Set(records.map(({ task }) => task.id));
      for (const handoff of sourceHandoffs) if (!taskIds.has(handoff.taskId)) report.orphaned.push(`${handoff.taskId}:${handoff.sequence}`);
      for (const record of records) {
        if (marked(record.task)) { report.skipped.push(record.task.id); continue; }
        if (known.has(record.task.id)) { report.conflicted.push(record.task.id); continue; }
        sqlite.importTask(record.task, record.handoffs);
        report.imported.push(record.task.id);
        if (existsSync(record.taskFile)) replaceFrontmatter(record.taskFile, now);
        for (const handoff of record.handoffs) knownHandoffs.add(`${handoff.taskId}:${handoff.sequence}`);
      }
      return report;
    } finally { sqlite.close(); }
  });
}

const emptyTaskBody = "# Task\n\n## Context\n\n\n## Goal\n\n\n## Scope\n\n\n## Planner Notes\n\n\n## Implementation Plan\n\n\n## Acceptance Criteria\n\n- [ ] First verifiable criterion.\n\n## Notes\n\n";
const legacyEmptyTaskBody = emptyTaskBody.slice(0, -1);
const migrationMetadataKeys = new Set(["storage_status", "migrated_to", "migrated_at", "source_filename", "imported_handoff_count", "incomplete_handoff_trail", "blocked_reason", "blocked_on"]);

/** Explicitly repair only untouched SQLite placeholders from their matching Markdown source. */
export function repairSQLitePlaceholders(cwd: string, dryRun = false): PlaceholderRepairReport {
  const { shared, config } = workspace(cwd);
  return withWorkflowLock(shared, () => {
    const sqlite = new SQLiteWorkflowStore(join(shared, "workflow.sqlite"), config.project_identifier);
    try {
      const report: PlaceholderRepairReport = { repaired: [], skipped: [], refused: [], dryRun };
      let records: SourceRecord[];
      try { records = sourceRecords(shared, config.project_identifier); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        report.refused.push(`${cause instanceof MarkdownSourceConflictError ? "Markdown source conflict" : "Markdown source is malformed"}: ${message}`);
        return report;
      }
      const source = new Map(records.map((record) => [record.task.id, record]));
      for (const live of sqlite.listTasks(config.project_identifier)) {
        if (!isEmptyTaskBody(live.body)) {
          report.skipped.push(live.id);
          continue;
        }
        const record = source.get(live.id);
        if (!record) {
          report.refused.push(`${live.id}: missing matching Markdown task`);
          continue;
        }
        if (record.task.id !== live.id) {
          report.refused.push(`${live.id}: mismatched Markdown task ID`);
          continue;
        }
        if (record.handoffs.length || sqlite.listHandoffs(config.project_identifier, live.id).length) {
          report.refused.push(`${live.id}: task has handoffs`);
          continue;
        }
        if (isEmptyTaskBody(record.task.body)) {
          report.refused.push(`${live.id}: matching Markdown body is also a placeholder`);
          continue;
        }
        if (taskEvidenceDiffers(live, record.task)) {
          report.refused.push(`${live.id}: SQLite task has changed fields or metadata`);
          continue;
        }
        report.repaired.push(live.id);
        if (!dryRun) {
          const metadata = { ...live.metadata };
          if (typeof metadata.phase === "undefined" && typeof record.task.metadata.phase !== "undefined") metadata.phase = record.task.metadata.phase;
          sqlite.updateTask(config.project_identifier, live.id, { body: record.task.body, metadata });
        }
      }
      return report;
    } finally { sqlite.close(); }
  });
}

function isEmptyTaskBody(body: string): boolean {
  for (const prefix of [emptyTaskBody, legacyEmptyTaskBody, `\n\n${emptyTaskBody}`, `\n\n${legacyEmptyTaskBody}`]) {
    if (body === prefix) return true;
    const blockerSection = body.slice(prefix.length);
    if (/^## Blockers\n\n(?:- \d{4}-\d{2}-\d{2}: .+\n?)+$/.test(blockerSection)) return true;
  }
  return false;
}

function taskEvidenceDiffers(live: WorkflowTask, source: WorkflowTask): boolean {
  if (live.title !== source.title || live.type !== source.type || live.assignedTo !== source.assignedTo || live.priority !== source.priority || live.parent !== source.parent || live.createdBy !== source.createdBy || live.createdOn !== source.createdOn || JSON.stringify(live.dependsOn) !== JSON.stringify(source.dependsOn)) return true;
  const liveMetadata = Object.fromEntries(Object.entries(live.metadata).filter(([key]) => !migrationMetadataKeys.has(key)));
  const sourceMetadata = Object.fromEntries(Object.entries(source.metadata).filter(([key]) => !migrationMetadataKeys.has(key)));
  if (typeof live.metadata.phase === "undefined") delete sourceMetadata.phase;
  return stableValue(liveMetadata) !== stableValue(sourceMetadata);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function validateBackup(path: string, projectIdentifier?: string) {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Backup integrity check failed: ${String(integrity)}`);
    for (const table of ["tasks", "task_dependencies", "handoffs", "store_metadata"]) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)) throw new Error(`Backup schema is missing table: ${table}`);
    }
    if (projectIdentifier) db.prepare("SELECT 1 FROM store_metadata WHERE project_identifier = ? LIMIT 1").get(projectIdentifier);
  } finally { db.close(); }
}

export function backupWorkflowDatabase(cwd: string, output?: string, force = false, now = new Date().toISOString()): string {
  const { shared, config } = workspace(cwd);
  const source = join(shared, "workflow.sqlite");
  if (!existsSync(source)) throw new Error(`SQLite database not found: ${source}`);
  const destination = resolve(output ?? join(shared, "backups", `workflow-${now.replace(/[^0-9]/g, "").slice(0, 14)}.sqlite`));
  if (existsSync(destination) && !force) throw new Error(`Refusing to overwrite existing backup: ${destination}`);
  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  rmSync(temporary, { force: true });
  const db = new Database(source);
  const escaped = temporary.replaceAll("'", "''");
  try { db.exec(`VACUUM INTO '${escaped}'`); } finally { db.close(); }
  try { validateBackup(temporary, config.project_identifier); renameSync(temporary, destination); } catch (cause) { rmSync(temporary, { force: true }); throw cause; }
  return destination;
}

function taskEqual(a: WorkflowTask, b: WorkflowTask) { return a.id === b.id && a.title === b.title && a.status === b.status && a.body === b.body && JSON.stringify(a.dependsOn) === JSON.stringify(b.dependsOn) && JSON.stringify(a.metadata) === JSON.stringify(b.metadata); }
function handoffKey(handoff: WorkflowHandoff) { return `${handoff.taskId}:${handoff.sequence}`; }

export function rebuildSQLiteFromMarkdown(cwd: string, replace = false, confirmation = "", now = new Date().toISOString()): SafetyReport & { changed: boolean } {
  const { shared, config } = workspace(cwd);
  return withWorkflowLock(shared, () => {
    const databasePath = join(shared, "workflow.sqlite");
    const current = new SQLiteWorkflowStore(databasePath, config.project_identifier);
    try {
      const records = sourceRecords(shared, config.project_identifier);
      const existing = current.listTasks(config.project_identifier);
      const byId = new Map(existing.map((task) => [task.id, task]));
      const report: SafetyReport & { changed: boolean } = { imported: [], skipped: [], conflicted: [], orphaned: [], wouldLose: [], changed: false };
      for (const record of records) {
        const live = byId.get(record.task.id);
        if (!live) report.imported.push(record.task.id);
        else if (taskEqual(live, record.task)) report.skipped.push(record.task.id);
        else report.conflicted.push(record.task.id);
      }
      const sourceTaskIds = new Set(records.map(({ task }) => task.id));
      for (const task of existing) if (!sourceTaskIds.has(task.id)) report.wouldLose.push(task.id);
      for (const handoff of new MarkdownWorkflowStore(dirname(shared), config.project_identifier).listAllHandoffs(config.project_identifier)) if (!sourceTaskIds.has(handoff.taskId)) report.orphaned.push(handoffKey(handoff));
      if (!replace) return report;
      if (confirmation !== "REPLACE SQLITE") throw new Error("Replacement requires confirmation: REPLACE SQLITE");
      const backupName = `workflow-rebuild-${now.replace(/[^0-9]/g, "").slice(0, 14)}-${process.pid}.sqlite`;
      const backup = backupWorkflowDatabase(cwd, join(shared, "backups", backupName), false, now);
      report.backup = backup;
      const temporary = join(shared, `.workflow-rebuild-${process.pid}.sqlite`);
      rmSync(temporary, { force: true });
      const rebuilt = new SQLiteWorkflowStore(temporary, config.project_identifier);
      try {
        for (const record of records) {
          const live = byId.get(record.task.id);
          // SQLite is canonical after migration: preserve its complete record on
          // a same-ID divergence, while Markdown can add absent identities.
          rebuilt.importTask(live ?? record.task, live ? current.listHandoffs(config.project_identifier, live.id) : record.handoffs);
        }
        for (const task of existing.filter((item) => !sourceTaskIds.has(item.id))) rebuilt.importTask(task, current.listHandoffs(config.project_identifier, task.id));
      } finally { rebuilt.close(); }
      current.close();
      for (const suffix of ["", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
      renameSync(temporary, databasePath);
      report.changed = true;
      return report;
    } finally { try { current.close(); } catch { /* already closed after replacement */ } }
  });
}
