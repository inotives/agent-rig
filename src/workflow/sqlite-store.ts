import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { ProjectIdentifier, WorkflowHandoff, WorkflowTask, WorkflowTaskPatch, WorkflowTaskQuery } from "./model.js";
import type { WorkflowStore } from "./store.js";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

