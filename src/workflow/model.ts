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

