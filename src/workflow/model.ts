export const workflowStoreProviders = ["markdown", "sqlite"] as const;

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

/** Check the resulting task graph before writing a normal edit or repair. */
export function validateTaskMutation(current: WorkflowTask, next: WorkflowTask, tasks: WorkflowTask[], repair = false): void {
  if (!(taskStatuses as readonly string[]).includes(next.status)) throw new Error(`Invalid status: ${next.status}`);
  if (!repair) {
    if (!(taskStatuses as readonly string[]).includes(current.status)) throw new Error(`Invalid current status: ${current.status}; use tasks repair`);
    const transitions: Record<string, string[]> = {
      todo: ["ready", "blocked", "done"], ready: ["todo", "in_progress", "blocked", "done"],
      // The diagnostic loop returns startup failures to ready without retrying.
      in_progress: ["ready", "review", "blocked", "done"], review: ["in_progress", "blocked", "done"],
      blocked: ["todo", "ready", "in_progress", "done"], done: []
    };
    if (current.status !== next.status && !transitions[current.status].includes(next.status)) {
      throw new Error(`Invalid task transition: ${current.status} -> ${next.status}; use tasks repair`);
    }
  }
  const graph = new Map(tasks.map((task) => [task.id, task]));
  graph.set(next.id, next);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error(`Dependency cycle: ${id}`);
    if (visited.has(id)) return;
    const task = graph.get(id);
    if (!task) throw new Error(`Missing dependency: ${id}`);
    if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error(`Duplicate dependency: ${id}`);
    visiting.add(id);
    for (const dependency of task.dependsOn) {
      if (dependency === id) throw new Error(`Task cannot depend on itself: ${id}`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  visit(next.id);
  if (["ready", "in_progress", "review", "done"].includes(next.status) && next.dependsOn.some((id) => graph.get(id)?.status !== "done")) {
    throw new Error(`Task ${next.id} has incomplete dependencies`);
  }
  // Reopening a predecessor must not invalidate an active or completed task.
  if (current.status === "done" && next.status !== "done" && tasks.some((task) => task.id !== next.id && ["ready", "in_progress", "review", "done"].includes(task.status) && task.dependsOn.includes(next.id))) {
    throw new Error(`Task ${next.id} has active or completed dependents`);
  }
}

/** Repair is an explicit planner action. Keep its audit separate from handoffs. */
export function taskRepairPatch(current: WorkflowTask, status: string, reason: string, actorRole?: string): WorkflowTaskPatch {
  if (actorRole !== "planner") throw new Error("Only the planner can repair a task");
  if (!reason.trim()) throw new Error("Task repair requires a reason");
  if (status === "done") throw new Error("Task repair cannot mark a task done");
  const history = current.metadata.repair_history;
  if (typeof history !== "undefined" && !Array.isArray(history)) throw new Error("Invalid repair_history; preserve the audit before repairing");
  const updatedOn = new Date().toISOString();
  return { status, updatedOn, metadata: { ...current.metadata, repair_history: [...(history ?? []), {
    actor: "planner", from_status: current.status, to_status: status, reason: reason.trim(), created_at: updatedOn
  }] } };
}

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

const handoffRoutes: Record<string, string> = {
  "worker\u0000reviewer": "review",
  "reviewer\u0000worker": "changes_requested",
  "planner\u0000worker": "changes_requested",
  "reviewer\u0000planner": "approved",
  "human\u0000planner": "changes_requested"
};

/** Validate a newly-created handoff. Historical imports intentionally bypass this check. */
export function validateNewHandoff(handoff: Pick<WorkflowHandoff, "sender" | "recipient" | "status">): void {
  const sender = handoff.sender.trim();
  const recipient = handoff.recipient.trim();
  const status = handoff.status.trim();
  if (!sender || !recipient) throw new Error("Handoff requires a non-empty sender and recipient");
  if (!status) throw new Error("Handoff requires a non-empty decision");
  const route = handoffRoutes[`${sender}\u0000${recipient}`];
  // The worker and the reviewer can always send `blocked` to the planner, also
  // where another decision has a route (reviewer -> planner: approved).
  const blockedRoute = (sender === "worker" || sender === "reviewer") && recipient === "planner";
  const expected = [route, blockedRoute ? "blocked" : undefined].filter((decision): decision is string => Boolean(decision));
  if (!expected.length) throw new Error(`Invalid handoff route: ${sender} -> ${recipient}`);
  if (!expected.includes(status)) throw new Error(`Invalid handoff decision for ${sender} -> ${recipient}: expected ${expected.join(" or ")}`);
}

/** Validate task status changes made by an identified workflow actor. */
export function validateTaskTransition(role: string, currentStatus: string, nextStatus: string): void {
  if (role === "planner") return;
  if (["done", "blocked"].includes(nextStatus)) throw new Error(`Only the planner can set a task to ${nextStatus}`);
  throw new Error(`${role} cannot transition task from ${currentStatus} to ${nextStatus}`);
}

/** Identified children return content; the planner records all workflow mutations. */
export function validateWorkflowWriter(role?: string): void {
  if (role && role !== "planner") throw new Error("Only the planner can mutate workflow state");
}

export type WorkflowTaskQuery = {
  status?: string;
  assignedTo?: string;
  /** Resolved phase, as given by `resolveTaskPhase` without a file name. */
  phase?: string;
};

export const taskStatuses = ["todo", "ready", "in_progress", "blocked", "review", "done"] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export type PhaseSummary = {
  phase: string;
  total: number;
  counts: Record<TaskStatus, number>;
  /** Latest `updatedOn` among the tasks of the phase ("" when none has a value). */
  latestUpdatedOn: string;
};

/** Resolve the UI-facing phase without persisting legacy inference. */
export function resolveTaskPhase(task: Pick<WorkflowTask, "phase" | "title">, sourceFilename = ""): string {
  if (task.phase?.trim()) return task.phase.trim();
  const token = `${task.title} ${sourceFilename}`.match(/(?:^|[^a-z0-9])phase(?:-|\s)(\d+)\b/i);
  return token ? `phase-${token[1]}` : "Unassigned";
}

/** Group tasks by resolved phase. Both providers use this, so their results are equal. */
export function summarizePhases(tasks: Iterable<Pick<WorkflowTask, "phase" | "title" | "status" | "updatedOn">>): PhaseSummary[] {
  const byPhase = new Map<string, PhaseSummary>();
  for (const task of tasks) {
    const phase = resolveTaskPhase(task);
    let summary = byPhase.get(phase);
    if (!summary) {
      summary = { phase, total: 0, counts: { todo: 0, ready: 0, in_progress: 0, blocked: 0, review: 0, done: 0 }, latestUpdatedOn: "" };
      byPhase.set(phase, summary);
    }
    summary.total += 1;
    if ((taskStatuses as readonly string[]).includes(task.status)) summary.counts[task.status as TaskStatus] += 1;
    if (task.updatedOn > summary.latestUpdatedOn) summary.latestUpdatedOn = task.updatedOn;
  }
  return [...byPhase.values()].sort((a, b) => a.phase.localeCompare(b.phase));
}
