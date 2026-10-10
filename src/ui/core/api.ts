import { createWorkflowStore, resolveTaskPhase, WorkflowHandoff, WorkflowStore, WorkflowTask } from "../../workflow/index.js";
import { HandoffDto, PhasesResponseDto, TaskDetailDto, TaskSummaryDto, WorkflowApiHandler, WorkflowApiResponse, WorkflowSummaryDto } from "./contracts.js";

export type { WorkflowApiHandler, WorkflowApiResponse } from "./contracts.js";

/** Create the read-only JSON boundary used by the local task-board UI. */
export function createWorkflowApi(cwd: string): WorkflowApiHandler {
  const { store, projectIdentifier } = createWorkflowStore(cwd);

  return (method, pathname) => {
    if (method !== "GET") return json(405, { error: "Method not allowed" }, { Allow: "GET" });

    const queryStart = pathname.indexOf("?");
    const path = queryStart < 0 ? pathname : pathname.slice(0, queryStart);
    const query = queryStart < 0 ? "" : pathname.slice(queryStart + 1);
    if (path === "/api/phases") {
      return json(200, phasesResponse(store, projectIdentifier));
    }
    if (path === "/api/workflow") {
      const requested = readPhaseParameter(query);
      if (requested.kind === "invalid") return json(404, { error: "Invalid phase" });
      if (requested.kind === "repeated") return json(400, { error: "Repeated phase parameter" });
      if (requested.kind === "none") return json(200, workflowSummary(store, projectIdentifier));
      if (!store.listPhaseSummaries(projectIdentifier).some((summary) => summary.phase === requested.value)) {
        return json(404, { error: "Phase not found", phase: requested.value });
      }
      return json(200, workflowSummary(store, projectIdentifier, requested.value));
    }

    const taskPath = path.match(/^\/api\/tasks\/([^/]+)(\/handoffs)?$/);
    if (!taskPath) return json(404, { error: "Not found" });

    let taskId: string;
    try {
      taskId = decodeURIComponent(taskPath[1]);
    } catch {
      return json(404, { error: "Invalid task ID" });
    }
    const task = store.getTask(projectIdentifier, taskId);
    if (!task) return json(404, { error: "Task not found", task_id: taskId });

    if (taskPath[2]) {
      return json(200, {
        project_identifier: projectIdentifier,
        task_id: taskId,
        handoffs: store.listHandoffs(projectIdentifier, taskId)
          .sort((a, b) => b.sequence - a.sequence)
          .map(handoffView)
      });
    }

    return json(200, { project_identifier: projectIdentifier, task: taskView(task) });
  };
}

const maxPhaseLength = 200;

type PhaseParameter = { kind: "none" } | { kind: "invalid" } | { kind: "repeated" } | { kind: "value"; value: string };

/** Read the `phase` parameter. A missing parameter means no filter. An empty value is a value. */
function readPhaseParameter(query: string): PhaseParameter {
  let found: string | undefined;
  for (const pair of query.split("&")) {
    const separator = pair.indexOf("=");
    const rawKey = separator < 0 ? pair : pair.slice(0, separator);
    let key: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    } catch {
      continue;
    }
    if (key !== "phase") continue;
    if (found !== undefined) return { kind: "repeated" };
    const rawValue = separator < 0 ? "" : pair.slice(separator + 1);
    if (rawValue.length > maxPhaseLength * 9) return { kind: "invalid" };
    try {
      found = decodeURIComponent(rawValue.replace(/\+/g, " "));
    } catch {
      return { kind: "invalid" };
    }
    if (found.length > maxPhaseLength) return { kind: "invalid" };
  }
  return found === undefined ? { kind: "none" } : { kind: "value", value: found };
}

function phasesResponse(store: WorkflowStore, projectIdentifier: string): PhasesResponseDto {
  return {
    project_identifier: projectIdentifier,
    phases: store.listPhaseSummaries(projectIdentifier).map((summary) => ({
      phase: summary.phase,
      total: summary.total,
      counts: summary.counts,
      latest_updated_on: summary.latestUpdatedOn
    }))
  };
}

function workflowSummary(store: WorkflowStore, projectIdentifier: string, phase?: string): WorkflowSummaryDto {
  const tasks = store.listTasks(projectIdentifier, phase === undefined ? undefined : { phase });
  const phases = [...new Set(tasks.map((task) => resolveTaskPhase(task)))].sort((a, b) => a.localeCompare(b));
  return {
    project_identifier: projectIdentifier,
    phases,
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      assigned_to: task.assignedTo,
      priority: task.priority,
      phase: resolveTaskPhase(task),
      updated_on: task.updatedOn,
      handoff_count: store.listHandoffs(projectIdentifier, task.id).length,
      ...(task.dependsOn.length ? { depends_on: task.dependsOn } : {})
    }))
  };
}

function taskView(task: WorkflowTask): TaskDetailDto {
  return {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    assigned_to: task.assignedTo,
    priority: task.priority,
    parent: task.parent,
    phase: resolveTaskPhase(task),
    depends_on: task.dependsOn,
    dependency_ready: task.dependencyReady,
    blocked_by: task.blockedBy,
    created_by: task.createdBy,
    created_on: task.createdOn,
    updated_on: task.updatedOn,
    body: task.body,
    metadata: task.metadata
  };
}

function handoffView(handoff: WorkflowHandoff): HandoffDto {
  return {
    task_id: handoff.taskId,
    sequence: handoff.sequence,
    sender: handoff.sender,
    recipient: handoff.recipient,
    status: handoff.status,
    message: handoff.message,
    created_at: handoff.createdAt,
    ...(typeof handoff.answersSequence === "undefined" ? {} : { answers_sequence: handoff.answersSequence }),
    metadata: handoff.metadata
  };
}

function json(status: number, value: unknown, headers: Record<string, string> = {}): WorkflowApiResponse {
  return {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
    body: JSON.stringify(value)
  };
}
