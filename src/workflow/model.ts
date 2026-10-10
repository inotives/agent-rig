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
  "planner\u0000planner": "approved"
};

/** Validate a newly-created handoff. Historical imports intentionally bypass this check. */
export function validateNewHandoff(handoff: Pick<WorkflowHandoff, "sender" | "recipient" | "status">): void {
  const sender = handoff.sender.trim();
  const recipient = handoff.recipient.trim();
  const status = handoff.status.trim();
  if (!sender || !recipient) throw new Error("Handoff requires a non-empty sender and recipient");
  if (!status) throw new Error("Handoff requires a non-empty decision");
  const expected = handoffRoutes[`${sender}\u0000${recipient}`]
    ?? (((sender === "worker" || sender === "reviewer") && recipient === "planner") ? "blocked" : undefined);
  if (!expected) throw new Error(`Invalid handoff route: ${sender} -> ${recipient}`);
  if (status !== expected) throw new Error(`Invalid handoff decision for ${sender} -> ${recipient}: expected ${expected}`);
}

/** Validate task status changes made by an identified workflow actor. */
export function validateTaskTransition(role: string, currentStatus: string, nextStatus: string): void {
  if (role === "planner") return;
  if (role === "worker" && currentStatus === "in_progress" && nextStatus === "review") return;
  if (role === "reviewer" && currentStatus === "review" && nextStatus === "review") return;
  if (["done", "blocked"].includes(nextStatus)) throw new Error(`Only the planner can set a task to ${nextStatus}`);
  throw new Error(`${role} cannot transition task from ${currentStatus} to ${nextStatus}`);
}

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
