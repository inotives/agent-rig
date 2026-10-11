export type WorkflowApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type WorkflowApiHandler = (method: string, pathname: string) => WorkflowApiResponse;

export type TaskDto = {
  id: string;
  title: string;
  type: string;
  status: string;
  assigned_to: string;
  priority: string;
  phase: string;
  updated_on: string;
};

export type TaskSummaryDto = TaskDto & {
  handoff_count: number;
  depends_on?: string[];
};

export type WorkflowSummaryDto = {
  project_identifier: string;
  phases: string[];
  tasks: TaskSummaryDto[];
};

export type PhaseSummaryDto = {
  phase: string;
  total: number;
  counts: Record<"todo" | "ready" | "in_progress" | "blocked" | "review" | "done", number>;
  latest_updated_on: string;
};

export type PhasesResponseDto = {
  project_identifier: string;
  phases: PhaseSummaryDto[];
};

export type TaskDetailDto = TaskDto & {
  parent: string;
  depends_on: string[];
  dependency_ready: boolean;
  blocked_by: string[];
  created_by: string;
  created_on: string;
  body: string;
  metadata: Record<string, unknown>;
};

export type HandoffDto = {
  task_id: string;
  sequence: number;
  sender: string;
  recipient: string;
  status: string;
  message: string;
  created_at: string;
  answers_sequence?: number;
  metadata: Record<string, unknown>;
};
