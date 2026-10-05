import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import Database from "better-sqlite3";

export const workflowStoreProviders = ["markdown", "sqlite"] as const;
const legacyHandoffFilename = /^\d{4}-\d{2}-\d{2}-(?:\d{4}|task-[a-z0-9-]+)_(?:.+_)?[a-z0-9-]+_[a-z][a-z0-9-]*\.md$/;
export type WorkflowStoreProvider = (typeof workflowStoreProviders)[number];

export type ProjectIdentifier = string;

export type WorkflowTask = {
  projectIdentifier: ProjectIdentifier;
  id: string;
  title: string;
  type: string;
  status: string;
  assignedTo: string;
  priority: string;
  parent: string;
  /** Canonical phase when explicitly assigned; legacy inference is display-only. */
  phase?: string;
  dependsOn: string[];
  dependencyReady: boolean;
  blockedBy: string[];
  createdBy: string;
  createdOn: string;
  updatedOn: string;
  body: string;
  metadata: Record<string, unknown>;
};

export type WorkflowTaskPatch = Partial<Pick<WorkflowTask, "title" | "type" | "status" | "assignedTo" | "priority" | "parent" | "phase" | "dependsOn" | "updatedOn" | "body" | "metadata">>;

export type WorkflowHandoff = {
  projectIdentifier: ProjectIdentifier;
  taskId: string;
  sequence: number;
  sender: string;
  recipient: string;
  status: string;
  message: string;
  createdAt: string;
  answersSequence?: number;
  metadata: Record<string, unknown>;
};

export type WorkflowTaskQuery = {
  status?: string;
  assignedTo?: string;
};

/** Resolve the UI-facing phase without persisting legacy inference. */
export function resolveTaskPhase(task: Pick<WorkflowTask, "phase" | "title">, sourceFilename = ""): string {
  if (task.phase?.trim()) return task.phase.trim();
  const token = `${task.title} ${sourceFilename}`.match(/(?:^|[^a-z0-9])phase(?:-|\s)(\d+)\b/i);
  return token ? `phase-${token[1]}` : "Unassigned";
}

/** Backend-neutral persistence boundary for live tasks and handoff conversations. */
export interface WorkflowStore {
  getTask(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowTask | undefined;
  listTasks(projectIdentifier: ProjectIdentifier, query?: WorkflowTaskQuery): WorkflowTask[];
  createTask(task: WorkflowTask): WorkflowTask;
  updateTask(projectIdentifier: ProjectIdentifier, taskId: string, patch: WorkflowTaskPatch): void;
  updateTaskWithHandoff(
    projectIdentifier: ProjectIdentifier,
    taskId: string,
    patch: WorkflowTaskPatch,
    handoff: Omit<WorkflowHandoff, "sequence"> & { sequence?: number },
    options?: { administrativeOverride?: boolean }
  ): WorkflowHandoff;
  completeTask(projectIdentifier: ProjectIdentifier, taskId: string, administrativeOverride?: boolean): void;
  listDependencies(projectIdentifier: ProjectIdentifier, taskId: string): string[];
  addHandoff(handoff: WorkflowHandoff): void;
  listHandoffs(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowHandoff[];
  listAllHandoffs(projectIdentifier: ProjectIdentifier): WorkflowHandoff[];
}

export function createWorkflowStore(cwd: string): { store: WorkflowStore; projectIdentifier: ProjectIdentifier } {
  const config = readWorkspaceWorkflowConfig(cwd);
  if (config.workflow_store.provider === "sqlite") {
    return {
      store: new SQLiteWorkflowStore(join(cwd, ".agent-rig", "_shared", "workflow.sqlite"), config.project_identifier),
      projectIdentifier: config.project_identifier
    };
  }
  return {
    store: new MarkdownWorkflowStore(join(cwd, ".agent-rig"), config.project_identifier),
    projectIdentifier: config.project_identifier
  };
}

export type SQLiteWorkflowStoreOptions = {
  workRole?: string;
  reviewRole?: string;
};

type SQLiteTaskRow = {
  project_identifier: string;
  task_id: string;
  title: string;
  type: string;
  status: string;
  assigned_to: string;
  priority: string;
  parent: string;
  phase: string | null;
  created_by: string;
  created_on: string;
  updated_on: string;
  body_markdown: string;
  metadata_json: string;
};

/** SQLite-backed workflow store. The database owns allocation and integrity transactions. */
export class SQLiteWorkflowStore implements WorkflowStore {
  private readonly db: Database.Database;
  private readonly workRole: string;
  private readonly reviewRole: string;

  constructor(
    databasePath: string,
    private readonly projectIdentifier: ProjectIdentifier,
    options: SQLiteWorkflowStoreOptions = {}
  ) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.workRole = options.workRole ?? "worker";
    this.reviewRole = options.reviewRole ?? "reviewer";
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    if (databasePath !== ":memory:") this.db.pragma("journal_mode = WAL");
    this.bootstrap();
  }

  close(): void { this.db.close(); }

  getTask(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowTask | undefined {
    this.assertProject(projectIdentifier);
    const row = this.db.prepare("SELECT * FROM tasks WHERE project_identifier = ? AND task_id = ?").get(projectIdentifier, taskId) as SQLiteTaskRow | undefined;
    return row ? this.toTask(row) : undefined;
  }

  listTasks(projectIdentifier: ProjectIdentifier, query: WorkflowTaskQuery = {}): WorkflowTask[] {
    this.assertProject(projectIdentifier);
    const clauses = ["project_identifier = ?"];
    const values: unknown[] = [projectIdentifier];
    if (typeof query.status !== "undefined") { clauses.push("status = ?"); values.push(query.status); }
    if (typeof query.assignedTo !== "undefined") { clauses.push("assigned_to = ?"); values.push(query.assignedTo); }
    const rows = this.db.prepare(`SELECT * FROM tasks WHERE ${clauses.join(" AND ")} ORDER BY task_id`).all(...values) as SQLiteTaskRow[];
    return rows.map((row) => this.toTask(row));
  }

  createTask(task: WorkflowTask): WorkflowTask {
    this.assertProject(task.projectIdentifier);
    let created: WorkflowTask;
    this.runTransaction(() => {
      const id = task.id || this.allocateTaskIdInTransaction();
      this.insertTask({ ...task, id, projectIdentifier: this.projectIdentifier });
      created = this.getTask(this.projectIdentifier, id)!;
    });
    return created!;
  }

  allocateTaskId(projectIdentifier: ProjectIdentifier): string {
    this.assertProject(projectIdentifier);
    return this.runTransaction(() => this.allocateTaskIdInTransaction());
  }

  updateTask(projectIdentifier: ProjectIdentifier, taskId: string, patch: WorkflowTaskPatch): void {
    this.assertProject(projectIdentifier);
    this.runTransaction(() => this.updateTaskInTransaction(projectIdentifier, taskId, patch));
  }

  /** Update a task and append its handoff in one commit, enforcing completion integrity. */
  updateTaskWithHandoff(
    projectIdentifier: ProjectIdentifier,
    taskId: string,
    patch: WorkflowTaskPatch,
    handoff: Omit<WorkflowHandoff, "sequence"> & { sequence?: number },
    options: { administrativeOverride?: boolean } = {}
  ): WorkflowHandoff {
    this.assertProject(projectIdentifier);
    return this.runTransaction(() => {
      this.updateTaskInTransaction(projectIdentifier, taskId, patch);
      const saved = this.appendHandoffInTransaction(handoff);
      if (patch.status === "done" && !options.administrativeOverride) this.assertCompleteTrail(taskId);
      return saved;
    });
  }

  listDependencies(projectIdentifier: ProjectIdentifier, taskId: string): string[] {
    this.assertProject(projectIdentifier);
    return (this.db.prepare("SELECT dependency_id FROM task_dependencies WHERE project_identifier = ? AND task_id = ? ORDER BY dependency_id").all(projectIdentifier, taskId) as { dependency_id: string }[]).map((row) => row.dependency_id);
  }

  addHandoff(handoff: WorkflowHandoff): void {
    this.assertProject(handoff.projectIdentifier);
    this.runTransaction(() => { this.appendHandoffInTransaction(handoff); });
  }

  appendHandoff(handoff: Omit<WorkflowHandoff, "sequence"> & { sequence?: number }): WorkflowHandoff {
    this.assertProject(handoff.projectIdentifier);
    return this.runTransaction(() => this.appendHandoffInTransaction(handoff));
  }

  listHandoffs(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowHandoff[] {
    this.assertProject(projectIdentifier);
    return this.listAllHandoffs(projectIdentifier).filter((handoff) => handoff.taskId === taskId);
  }

  listAllHandoffs(projectIdentifier: ProjectIdentifier): WorkflowHandoff[] {
    this.assertProject(projectIdentifier);
    const rows = this.db.prepare("SELECT * FROM handoffs WHERE project_identifier = ? ORDER BY task_id, sequence").all(projectIdentifier) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      projectIdentifier: String(row.project_identifier), taskId: String(row.task_id), sequence: Number(row.sequence),
      sender: String(row.sender), recipient: String(row.recipient), status: String(row.status),
      message: String(row.message_markdown), createdAt: String(row.created_at),
      ...(row.answers_sequence === null ? {} : { answersSequence: Number(row.answers_sequence) }),
      metadata: parseMetadata(String(row.metadata_json))
    }));
  }

  /** Import historical records without changing their lifecycle status. */
  importTask(task: WorkflowTask, handoffs: WorkflowHandoff[]): void {
    this.assertProject(task.projectIdentifier);
    this.runTransaction(() => {
      const metadata: Record<string, unknown> = { ...task.metadata, imported_handoff_count: handoffs.length };
      if (handoffs.length < 2) metadata.incomplete_handoff_trail = true;
      this.insertTask({ ...task, metadata });
      for (const handoff of handoffs) {
        this.assertProject(handoff.projectIdentifier);
        this.appendHandoffInTransaction(handoff);
      }
    });
  }

  completeTask(projectIdentifier: ProjectIdentifier, taskId: string, administrativeOverride = false): void {
    this.assertProject(projectIdentifier);
    this.runTransaction(() => {
      this.assertCompleteTrail(taskId, administrativeOverride);
      this.updateTaskInTransaction(projectIdentifier, taskId, { status: "done", updatedOn: new Date().toISOString() });
    });
  }

  private bootstrap(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        project_identifier TEXT NOT NULL, task_id TEXT NOT NULL, title TEXT NOT NULL,
        type TEXT NOT NULL, status TEXT NOT NULL, assigned_to TEXT NOT NULL,
        priority TEXT NOT NULL, parent TEXT NOT NULL, phase TEXT, created_by TEXT NOT NULL,
        created_on TEXT NOT NULL, updated_on TEXT NOT NULL, body_markdown TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (project_identifier, task_id)
      );
      CREATE TABLE IF NOT EXISTS task_dependencies (
        project_identifier TEXT NOT NULL, task_id TEXT NOT NULL, dependency_id TEXT NOT NULL,
        PRIMARY KEY (project_identifier, task_id, dependency_id),
        FOREIGN KEY (project_identifier, task_id) REFERENCES tasks(project_identifier, task_id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS handoffs (
        project_identifier TEXT NOT NULL, task_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        sender TEXT NOT NULL, recipient TEXT NOT NULL, status TEXT NOT NULL,
        message_markdown TEXT NOT NULL, created_at TEXT NOT NULL, answers_sequence INTEGER,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (project_identifier, task_id, sequence),
        FOREIGN KEY (project_identifier, task_id) REFERENCES tasks(project_identifier, task_id)
      );
      CREATE TABLE IF NOT EXISTS store_metadata (
        project_identifier TEXT NOT NULL, key TEXT NOT NULL, value_json TEXT NOT NULL,
        PRIMARY KEY (project_identifier, key)
      );
      CREATE INDEX IF NOT EXISTS tasks_project_status ON tasks(project_identifier, status);
      CREATE INDEX IF NOT EXISTS tasks_project_assignee ON tasks(project_identifier, assigned_to);
      CREATE INDEX IF NOT EXISTS dependencies_lookup ON task_dependencies(project_identifier, dependency_id);
      CREATE INDEX IF NOT EXISTS handoffs_recent ON handoffs(project_identifier, task_id, created_at, sequence);
    `);
    const columns = this.db.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "phase")) this.db.exec("ALTER TABLE tasks ADD COLUMN phase TEXT");
    this.db.prepare("INSERT INTO store_metadata (project_identifier, key, value_json) VALUES (?, ?, ?) ON CONFLICT(project_identifier, key) DO UPDATE SET value_json = excluded.value_json")
      .run(this.projectIdentifier, "schema_version", JSON.stringify(2));
  }

  private runTransaction<T>(operation: () => T): T {
    const transaction = this.db.transaction(operation) as unknown as { immediate: () => T };
    return transaction.immediate();
  }

  private insertTask(task: WorkflowTask): void {
    this.db.prepare(`INSERT INTO tasks (project_identifier, task_id, title, type, status, assigned_to, priority, parent, phase, created_by, created_on, updated_on, body_markdown, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      this.projectIdentifier, task.id, task.title, task.type, task.status, task.assignedTo, task.priority,
      task.parent, task.phase ?? null, task.createdBy, task.createdOn, task.updatedOn, task.body, JSON.stringify(task.metadata)
    );
    const dependency = this.db.prepare("INSERT INTO task_dependencies (project_identifier, task_id, dependency_id) VALUES (?, ?, ?)");
    for (const id of task.dependsOn) dependency.run(this.projectIdentifier, task.id, id);
  }

  private updateTaskInTransaction(projectIdentifier: string, taskId: string, patch: WorkflowTaskPatch): void {
    const current = this.getTask(projectIdentifier, taskId);
    if (!current) throw new Error(`Task not found: ${taskId}`);
    const next = { ...current, ...patch, projectIdentifier, metadata: patch.metadata ?? current.metadata };
    this.db.prepare(`UPDATE tasks SET title = ?, type = ?, status = ?, assigned_to = ?, priority = ?, parent = ?, phase = ?, updated_on = ?, body_markdown = ?, metadata_json = ? WHERE project_identifier = ? AND task_id = ?`).run(
      next.title, next.type, next.status, next.assignedTo, next.priority, next.parent, next.phase ?? null, next.updatedOn, next.body, JSON.stringify(next.metadata), projectIdentifier, taskId
    );
    if (patch.dependsOn) {
      this.db.prepare("DELETE FROM task_dependencies WHERE project_identifier = ? AND task_id = ?").run(projectIdentifier, taskId);
      const dependency = this.db.prepare("INSERT INTO task_dependencies (project_identifier, task_id, dependency_id) VALUES (?, ?, ?)");
      for (const id of patch.dependsOn) dependency.run(projectIdentifier, taskId, id);
    }
  }

  private appendHandoffInTransaction(handoff: Omit<WorkflowHandoff, "sequence"> & { sequence?: number }): WorkflowHandoff {
    if (!this.getTask(handoff.projectIdentifier, handoff.taskId)) throw new Error(`Task not found: ${handoff.taskId}`);
    const current = this.db.prepare("SELECT COALESCE(MAX(sequence), 0) AS sequence FROM handoffs WHERE project_identifier = ? AND task_id = ?").get(handoff.projectIdentifier, handoff.taskId) as { sequence: number };
    const sequence = handoff.sequence && handoff.sequence > current.sequence ? handoff.sequence : current.sequence + 1;
    const saved = { ...handoff, sequence };
    this.db.prepare(`INSERT INTO handoffs (project_identifier, task_id, sequence, sender, recipient, status, message_markdown, created_at, answers_sequence, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      saved.projectIdentifier, saved.taskId, saved.sequence, saved.sender, saved.recipient, saved.status, saved.message,
      saved.createdAt, saved.answersSequence ?? null, JSON.stringify(saved.metadata)
    );
    return saved;
  }

  private allocateTaskIdInTransaction(): string {
    const key = "next_task_number";
    const row = this.db.prepare("SELECT value_json FROM store_metadata WHERE project_identifier = ? AND key = ?").get(this.projectIdentifier, key) as { value_json: string } | undefined;
    const max = this.db.prepare("SELECT MAX(CAST(SUBSTR(task_id, 6) AS INTEGER)) AS value FROM tasks WHERE project_identifier = ? AND task_id GLOB 'task-[0-9]*'").get(this.projectIdentifier) as { value: number | null };
    const next = Math.max(Number(row ? JSON.parse(row.value_json) : 1), Number(max.value ?? 0) + 1);
    this.db.prepare("INSERT INTO store_metadata (project_identifier, key, value_json) VALUES (?, ?, ?) ON CONFLICT(project_identifier, key) DO UPDATE SET value_json = excluded.value_json").run(this.projectIdentifier, key, JSON.stringify(next + 1));
    return `task-${String(next).padStart(4, "0")}`;
  }

  private assertCompleteTrail(taskId: string, administrativeOverride = false): void {
    if (administrativeOverride) return;
    const handoffs = this.listHandoffs(this.projectIdentifier, taskId).slice(-2);
    if (handoffs.length < 2 || handoffs[0].sender !== this.workRole || handoffs[0].metadata.source_order_conflict || handoffs[1].sender !== this.reviewRole || handoffs[1].status !== "done") {
      throw new Error(`Task completion requires ${this.workRole} and ${this.reviewRole} handoffs`);
    }
  }

  private toTask(row: SQLiteTaskRow): WorkflowTask {
    const dependsOn = this.listDependencies(row.project_identifier, row.task_id);
    const all = this.listTasksRaw(row.project_identifier);
    const done = new Set(all.filter((task) => task.status === "done").map((task) => task.id));
    const ids = new Set(all.map((task) => task.id));
    const metadata = parseMetadata(row.metadata_json);
    const phase = row.phase ?? (typeof metadata.phase === "string" && metadata.phase.trim() ? metadata.phase.trim() : undefined);
    return { projectIdentifier: row.project_identifier, id: row.task_id, title: row.title, type: row.type, status: row.status,
      assignedTo: row.assigned_to, priority: row.priority, parent: row.parent, ...(phase ? { phase } : {}), dependsOn,
      dependencyReady: dependsOn.every((id) => ids.has(id) && done.has(id)), blockedBy: dependsOn.filter((id) => !ids.has(id) || !done.has(id)),
      createdBy: row.created_by, createdOn: row.created_on, updatedOn: row.updated_on, body: row.body_markdown,
      metadata: { ...metadata, ...(phase ? { phase } : {}) } };
  }

  private listTasksRaw(projectIdentifier: string): Array<{ id: string; status: string }> {
    return this.db.prepare("SELECT task_id AS id, status FROM tasks WHERE project_identifier = ?").all(projectIdentifier) as Array<{ id: string; status: string }>;
  }

  private assertProject(projectIdentifier: string): void {
    if (projectIdentifier !== this.projectIdentifier) throw new Error(`Unknown project identifier: ${projectIdentifier}`);
  }
}

function parseMetadata(value: string): Record<string, unknown> {
  try { const parsed: unknown = JSON.parse(value); return isRecord(parsed) ? parsed : {}; } catch { return {}; }
}

const taskFrontmatterOrder = [
  "id", "title", "type", "status", "assigned_to", "created_by", "created_on",
  "updated_on", "priority", "parent", "phase", "depends_on"
];

const handoffFrontmatterKeys = [
  "project_identifier", "task", "task_id", "sequence", "sender", "agent", "recipient",
  "status", "created_at", "createdAt", "answers_sequence"
];

/** Markdown-backed implementation of the workflow-store contract. */
export class MarkdownWorkflowStore implements WorkflowStore {
  private readonly tasksDirectory: string;
  private readonly handoffsDirectory: string;

  constructor(private readonly root: string, private readonly projectIdentifier: ProjectIdentifier) {
    this.tasksDirectory = join(root, "_shared", "tasks");
    this.handoffsDirectory = join(root, "_shared", "handoff_logs");
  }

  getTask(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowTask | undefined {
    return this.listTasks(projectIdentifier).find((task) => task.id === taskId);
  }

  listTasks(projectIdentifier: ProjectIdentifier, query: WorkflowTaskQuery = {}): WorkflowTask[] {
    this.assertProject(projectIdentifier);
    if (!existsSync(this.tasksDirectory)) return [];
    const parsed = this.taskRecords();
    const done = new Set(parsed.filter(({ metadata }) => metadata.status === "done").map(({ metadata }) => String(metadata.id ?? "")));
    const ids = new Set(parsed.map(({ metadata }) => String(metadata.id ?? "")));
    return parsed
      .map(({ file, metadata, body }) => this.toTask(file, metadata, body, done, ids))
      .filter((task) => (typeof query.status === "undefined" || task.status === query.status) && (typeof query.assignedTo === "undefined" || task.assignedTo === query.assignedTo))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  createTask(task: WorkflowTask): WorkflowTask {
    this.assertProject(task.projectIdentifier);
    mkdirSync(this.tasksDirectory, { recursive: true });
    const file = join(this.tasksDirectory, `${task.id}_${slug(task.title)}.md`);
    if (existsSync(file)) throw new Error(`Task already exists: ${task.id}`);
    writeFileSync(file, serializeTask(task), "utf8");
    return task;
  }

  updateTask(projectIdentifier: ProjectIdentifier, taskId: string, patch: WorkflowTaskPatch): void {
    this.assertProject(projectIdentifier);
    const record = this.taskRecord(taskId);
    if (!record) throw new Error(`Task not found: ${taskId}`);
    const current = this.toTask(record.file, record.metadata, record.body, new Set(), new Set());
    const next: WorkflowTask = { ...current, ...patch, projectIdentifier };
    next.metadata = patch.metadata ?? current.metadata;
    writeFileSync(record.file, serializeTask(next), "utf8");
  }

  updateTaskWithHandoff(
    projectIdentifier: ProjectIdentifier,
    taskId: string,
    patch: WorkflowTaskPatch,
    handoff: Omit<WorkflowHandoff, "sequence"> & { sequence?: number }
  ): WorkflowHandoff {
    this.assertProject(projectIdentifier);
    const record = this.taskRecord(taskId);
    if (!record) throw new Error(`Task not found: ${taskId}`);
    const current = this.toTask(record.file, record.metadata, record.body, new Set(), new Set());
    const next: WorkflowTask = { ...current, ...patch, projectIdentifier, metadata: patch.metadata ?? current.metadata };
    const existing = this.listHandoffs(projectIdentifier, taskId);
    const sequence = handoff.sequence && handoff.sequence > existing.length ? handoff.sequence : existing.length + 1;
    const saved = { ...handoff, sequence };
    const filename = typeof saved.metadata.filename === "string"
      ? saved.metadata.filename
      : `${handoffTimestamp(saved.createdAt)}_${saved.taskId}-${sequence}_markdown_${slug(saved.sender || "agent")}.md`;
    const handoffFile = join(this.handoffsDirectory, filename);
    const handoffExisted = existsSync(handoffFile);
    const original = readFileSync(record.file, "utf8");
    try {
      writeFileSync(record.file, serializeTask(next), "utf8");
      this.addHandoff({ ...saved, metadata: { ...saved.metadata, filename } });
      return { ...saved, metadata: { ...saved.metadata, filename } };
    } catch (cause) {
      writeFileSync(record.file, original, "utf8");
      if (!handoffExisted && existsSync(handoffFile)) {
        try { unlinkSync(handoffFile); } catch { /* preserve the original failure */ }
      }
      throw cause;
    }
  }

  completeTask(projectIdentifier: ProjectIdentifier, taskId: string, administrativeOverride = false): void {
    if (!administrativeOverride) {
      const handoffs = this.listHandoffs(projectIdentifier, taskId).slice(-2);
      if (handoffs.length < 2 || handoffs[0].sender !== "worker" || handoffs[0].metadata.source_order_conflict || handoffs[1].sender !== "reviewer" || handoffs[1].status !== "done") {
        throw new Error("Task completion requires worker and reviewer handoffs");
      }
    }
    this.updateTask(projectIdentifier, taskId, { status: "done", updatedOn: new Date().toISOString() });
  }

  listDependencies(projectIdentifier: ProjectIdentifier, taskId: string): string[] {
    return this.getTask(projectIdentifier, taskId)?.dependsOn ?? [];
  }

  addHandoff(handoff: WorkflowHandoff): void {
    this.assertProject(handoff.projectIdentifier);
    mkdirSync(this.handoffsDirectory, { recursive: true });
    const filename = typeof handoff.metadata.filename === "string"
      ? handoff.metadata.filename
      : `${handoffTimestamp(handoff.createdAt)}_${handoff.taskId}-${handoff.sequence}_markdown_${slug(handoff.sender || "agent")}.md`;
    const file = join(this.handoffsDirectory, filename);
    if (existsSync(file)) throw new Error(`Handoff already exists: ${filename}`);
    writeFileSync(file, serializeHandoff(handoff), "utf8");
  }

  listHandoffs(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowHandoff[] {
    return this.listAllHandoffs(projectIdentifier).filter((handoff) => handoff.taskId === taskId);
  }

  listAllHandoffs(projectIdentifier: ProjectIdentifier): WorkflowHandoff[] {
    this.assertProject(projectIdentifier);
    if (!existsSync(this.handoffsDirectory)) return [];
    return readdirSync(this.handoffsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && legacyHandoffFilename.test(entry.name))
      .map((entry) => ({ file: join(this.handoffsDirectory, entry.name), filename: entry.name }))
      .sort((a, b) => a.filename.localeCompare(b.filename))
      .map(({ file, filename }) => parseHandoffSafe(file, filename))
      .map((handoff) => ({ ...handoff, projectIdentifier: handoff.projectIdentifier || projectIdentifier }))
      .filter((handoff) => handoff.projectIdentifier === projectIdentifier)
      .reduce<WorkflowHandoff[]>((records, handoff) => {
        const sequence = handoff.sequence || records.filter((record) => record.taskId === handoff.taskId).length + 1;
        records.push({ ...handoff, sequence });
        return records;
      }, [])
      .sort((a, b) => a.taskId.localeCompare(b.taskId) || a.sequence - b.sequence || String(a.metadata.filename).localeCompare(String(b.metadata.filename)));
  }

  private taskRecords() {
    return readdirSync(this.tasksDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => {
        const file = join(this.tasksDirectory, entry.name);
        const parsed = parseMarkdown(file, "Task");
        return { file, ...parsed };
      });
  }

  private taskRecord(taskId: string) {
    return this.taskRecords().find(({ metadata }) => String(metadata.id ?? "") === taskId);
  }

  private toTask(file: string, metadata: Record<string, unknown>, body: string, done: Set<string>, ids: Set<string>): WorkflowTask {
    const dependsOn = Array.isArray(metadata.depends_on) ? metadata.depends_on.filter((value): value is string => typeof value === "string") : [];
    return {
      projectIdentifier: this.projectIdentifier,
      id: String(metadata.id ?? ""),
      title: String(metadata.title ?? ""),
      type: String(metadata.type ?? "task"),
      status: String(metadata.status ?? ""),
      assignedTo: String(metadata.assigned_to ?? ""),
      priority: String(metadata.priority ?? "normal"),
      parent: String(metadata.parent ?? ""),
      ...(typeof metadata.phase === "string" && metadata.phase.trim() ? { phase: metadata.phase.trim() } : {}),
      dependsOn,
      dependencyReady: dependsOn.every((id) => ids.has(id) && done.has(id)),
      blockedBy: dependsOn.filter((id) => !ids.has(id) || !done.has(id)),
      createdBy: String(metadata.created_by ?? ""),
      createdOn: String(metadata.created_on ?? ""),
      updatedOn: String(metadata.updated_on ?? ""),
      body,
      metadata: { ...omitKeys(metadata, taskFrontmatterOrder), ...(typeof metadata.phase === "string" && metadata.phase.trim() ? { phase: metadata.phase.trim() } : {}) }
    };
  }

  private assertProject(projectIdentifier: ProjectIdentifier) {
    if (projectIdentifier !== this.projectIdentifier) throw new Error(`Unknown project identifier: ${projectIdentifier}`);
  }
}

function parseHandoffSafe(file: string, filename: string): WorkflowHandoff {
  try {
    return parseHandoff(file, filename);
  } catch {
    const legacy = parseLegacyHandoff(file, filename);
    if (legacy) return legacy;
    const sender = filename.replace(/\.md$/, "").split("_").at(-1) ?? "";
    return {
      projectIdentifier: "",
      taskId: "",
      sequence: 0,
      sender,
      recipient: "",
      status: "",
      message: readFileSync(file, "utf8"),
      createdAt: "",
      metadata: { filename }
    };
  }
}

function parseLegacyHandoff(file: string, filename: string): WorkflowHandoff | undefined {
  const source = readFileSync(file, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return undefined;
  const metadata: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z][a-z0-9_]*)\s*:\s*(.*)$/i);
    if (!field) continue;
    metadata[field[1]] = field[2].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
  const taskId = metadata.task ?? metadata.task_id;
  if (!taskId) return undefined;
  return {
    projectIdentifier: metadata.project_identifier ?? "",
    taskId,
    sequence: Number(metadata.sequence ?? 0),
    sender: metadata.sender ?? metadata.agent ?? "",
    recipient: metadata.recipient ?? "",
    status: metadata.status ?? "",
    message: source.slice(match[0].length),
    createdAt: metadata.created_at ?? metadata.createdAt ?? "",
    ...(metadata.answers_sequence ? { answersSequence: Number(metadata.answers_sequence) } : {}),
    metadata: { ...metadata, filename }
  };
}

function parseMarkdown(file: string, kind: string) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`${kind} file is missing frontmatter: ${file}`);
  const metadata = parseYaml(match[1]);
  if (!isRecord(metadata)) throw new Error(`${kind} frontmatter must be an object: ${file}`);
  return { metadata, body: text.slice(match[0].length) };
}

export function serializeTask(task: WorkflowTask) {
  const metadata = {
    ...task.metadata,
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    assigned_to: task.assignedTo,
    created_by: task.createdBy,
    created_on: task.createdOn,
    updated_on: task.updatedOn,
    priority: task.priority,
    parent: task.parent,
    ...(task.phase ? { phase: task.phase } : {}),
    depends_on: task.dependsOn
  };
  return serializeMarkdown(orderMetadata(metadata, taskFrontmatterOrder), task.body);
}

export function parseHandoff(file: string, filename: string): WorkflowHandoff {
  const { metadata, body } = parseMarkdown(file, "Handoff");
  const sequence = typeof metadata.sequence === "number" ? metadata.sequence : 0;
  return {
    projectIdentifier: String(metadata.project_identifier ?? ""),
    taskId: String(metadata.task ?? metadata.task_id ?? ""),
    sequence,
    sender: String(metadata.sender ?? metadata.agent ?? ""),
    recipient: String(metadata.recipient ?? ""),
    status: String(metadata.status ?? ""),
    message: body,
    createdAt: String(metadata.created_at ?? metadata.createdAt ?? handoffSourceTimestamp(filename)),
    ...(typeof metadata.answers_sequence === "number" ? { answersSequence: metadata.answers_sequence } : {}),
    metadata: { ...omitKeys(metadata, handoffFrontmatterKeys), filename }
  };
}

function handoffSourceTimestamp(filename: string): string {
  const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})_/);
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function serializeHandoff(handoff: WorkflowHandoff) {
  const metadata: Record<string, unknown> = {
    ...handoff.metadata,
    project_identifier: handoff.projectIdentifier,
    task: handoff.taskId,
    sequence: handoff.sequence,
    sender: handoff.sender,
    recipient: handoff.recipient,
    status: handoff.status,
    created_at: handoff.createdAt,
    ...(typeof handoff.answersSequence === "undefined" ? {} : { answers_sequence: handoff.answersSequence })
  };
  delete metadata.filename;
  return serializeMarkdown(metadata, handoff.message);
}

function serializeMarkdown(metadata: Record<string, unknown>, body: string) {
  const rendered = stringifyYaml(metadata).trimEnd();
  return `---\n${rendered}\n---\n${body}`;
}

function orderMetadata(metadata: Record<string, unknown>, order: string[]) {
  const ordered: Record<string, unknown> = {};
  for (const key of order) if (typeof metadata[key] !== "undefined") ordered[key] = metadata[key];
  for (const key of Object.keys(metadata).sort()) if (!(key in ordered) && typeof metadata[key] !== "undefined") ordered[key] = metadata[key];
  return ordered;
}

function omitKeys(metadata: Record<string, unknown>, keys: string[]) {
  const result = { ...metadata };
  for (const key of keys) delete result[key];
  return result;
}

function handoffTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "0000-00-00-0000";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
}

export type WorkspaceWorkflowConfig = {
  workflow_store: {
    provider: WorkflowStoreProvider;
  };
  project_identifier: ProjectIdentifier;
};

export const defaultWorkflowStoreProvider: WorkflowStoreProvider = "markdown";

export function isWorkflowStoreProvider(value: unknown): value is WorkflowStoreProvider {
  return typeof value === "string" && (workflowStoreProviders as readonly string[]).includes(value);
}

export function isProjectIdentifier(value: unknown): value is ProjectIdentifier {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,39}$/.test(value);
}

export function projectIdentifierFromDirectory(cwd: string): ProjectIdentifier {
  const directory = basename(cwd) || "project";
  const slug = directory.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const candidate = slug || "project";
  return /^[a-z]/.test(candidate) ? candidate : `project-${candidate}`.slice(0, 40);
}

export function resolveWorkspaceWorkflowConfig(cwd: string, data: unknown): WorkspaceWorkflowConfig {
  if (!isRecord(data)) throw new Error("Workspace configuration must be a JSON object.");
  const store = data.workflow_store;
  const provider = isRecord(store) && typeof store.provider !== "undefined" ? store.provider : defaultWorkflowStoreProvider;
  if (!isWorkflowStoreProvider(provider)) throw new Error(`Unknown workflow store provider: ${String(provider)}`);

  const identifier = typeof data.project_identifier === "undefined" ? projectIdentifierFromDirectory(cwd) : data.project_identifier;
  if (!isProjectIdentifier(identifier)) throw new Error(`Invalid project_identifier: ${String(identifier)}`);
  return { workflow_store: { provider }, project_identifier: identifier };
}

export function readWorkspaceWorkflowConfig(cwd: string): WorkspaceWorkflowConfig {
  const path = join(cwd, ".agent-rig", "_shared", "agent-rig.json");
  return resolveWorkspaceWorkflowConfig(cwd, JSON.parse(readFileSync(path, "utf8")));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
