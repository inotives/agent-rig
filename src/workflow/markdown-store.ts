import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateNewHandoff, validateTaskTransition } from "./model.js";
import type { ProjectIdentifier, WorkflowHandoff, WorkflowTask, WorkflowTaskPatch, WorkflowTaskQuery } from "./model.js";
import type { WorkflowStore } from "./store.js";

const legacyHandoffFilename = /^\d{4}-\d{2}-\d{2}-(?:\d{4}|task-[a-z0-9-]+)_(?:.+_)?[a-z0-9-]+_[a-z][a-z0-9-]*\.md$/;

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

  constructor(
    private readonly root: string,
    private readonly projectIdentifier: ProjectIdentifier,
    private readonly actorRole?: string
  ) {
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
    if (this.actorRole && patch.status) validateTaskTransition(this.actorRole, current.status, patch.status);
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
    validateNewHandoff(handoff);
    const record = this.taskRecord(taskId);
    if (!record) throw new Error(`Task not found: ${taskId}`);
    const current = this.toTask(record.file, record.metadata, record.body, new Set(), new Set());
    if (this.actorRole && patch.status) validateTaskTransition(this.actorRole, current.status, patch.status);
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
      const task = this.getTask(projectIdentifier, taskId);
      const handoffs = this.listHandoffs(projectIdentifier, taskId).slice(-2);
      const plannerHandoff = handoffs.at(-1);
      if (task?.metadata.planner_owned_final_review === true && plannerHandoff?.sender === "planner" && plannerHandoff.recipient === "planner" && plannerHandoff.status === "approved") {
        this.updateTask(projectIdentifier, taskId, { status: "done", updatedOn: new Date().toISOString() });
        return;
      }
      if (handoffs.length < 2 || handoffs[0].sender !== "worker" || handoffs[0].metadata.source_order_conflict || handoffs[1].sender !== "reviewer" || handoffs[1].status !== "approved") {
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
    validateNewHandoff(handoff);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
