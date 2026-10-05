import { createWorkflowStore, resolveTaskPhase, WorkflowHandoff, WorkflowStore, WorkflowTask } from "./workflow-store.js";

export type WorkflowApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

export type WorkflowApiHandler = (method: string, pathname: string) => WorkflowApiResponse;

/** Create the read-only JSON boundary used by the local task-board UI. */
export function createWorkflowApi(cwd: string): WorkflowApiHandler {
  const { store, projectIdentifier } = createWorkflowStore(cwd);

  return (method, pathname) => {
    if (method !== "GET") return json(405, { error: "Method not allowed" }, { Allow: "GET" });

    const path = pathname.split("?", 1)[0];
    if (path === "/api/workflow") {
      return json(200, workflowSummary(store, projectIdentifier));
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

function workflowSummary(store: WorkflowStore, projectIdentifier: string) {
  const tasks = store.listTasks(projectIdentifier);
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
      handoff_count: store.listHandoffs(projectIdentifier, task.id).length
    }))
  };
}

function taskView(task: WorkflowTask) {
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

function handoffView(handoff: WorkflowHandoff) {
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
