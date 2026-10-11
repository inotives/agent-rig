import { join } from "node:path";
import { MarkdownWorkflowStore } from "./markdown-store.js";
import { SQLiteWorkflowStore } from "./sqlite-store.js";
import { readWorkspaceWorkflowConfig } from "./config.js";
import type { PhaseSummary, ProjectIdentifier, WorkflowHandoff, WorkflowTask, WorkflowTaskPatch, WorkflowTaskQuery } from "./model.js";

export interface WorkflowStore {
  getTask(projectIdentifier: ProjectIdentifier, taskId: string): WorkflowTask | undefined;
  listTasks(projectIdentifier: ProjectIdentifier, query?: WorkflowTaskQuery): WorkflowTask[];
  /** One summary per resolved phase, sorted by phase name. */
  listPhaseSummaries(projectIdentifier: ProjectIdentifier): PhaseSummary[];
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
      store: new SQLiteWorkflowStore(join(cwd, ".agent-rig", "_shared", "workflow.sqlite"), config.project_identifier, { actorRole: process.env.AGENT_RIG_ROLE }),
      projectIdentifier: config.project_identifier
    };
  }
  return {
    store: new MarkdownWorkflowStore(join(cwd, ".agent-rig"), config.project_identifier, process.env.AGENT_RIG_ROLE),
    projectIdentifier: config.project_identifier
  };
}
