import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { workflowStoreProviders, type ProjectIdentifier, type WorkflowStoreProvider } from "./model.js";

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

