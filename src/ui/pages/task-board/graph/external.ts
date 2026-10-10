import { TaskSummaryDto } from "../../../core/contracts.js";

/** Unique IDs of dependencies that are not in the loaded tasks. They belong to other phases or do not exist. */
export function externalDependencyIds(task: Pick<TaskSummaryDto, "depends_on">, loadedIds: ReadonlySet<string>): string[] {
  return [...new Set(task.depends_on ?? [])].filter((id) => !loadedIds.has(id));
}

export function externalDependencyCount(task: Pick<TaskSummaryDto, "depends_on">, loadedIds: ReadonlySet<string>) { return externalDependencyIds(task, loadedIds).length; }

/** Sentence for screen readers. */
export function externalDependencyLabel(count: number) { return count === 1 ? "1 dependency in another phase" : `${count} dependencies in other phases`; }

/** Short text for the marker on a graph node. */
export function externalMarkerText(count: number) { return `${count} external`; }
