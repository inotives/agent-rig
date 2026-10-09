import { TaskSummaryDto } from "../../../core/contracts.js";

export const COMPACT_DEFAULT_THRESHOLD = 30;

/** Collapse done is on by default when more than 30 tasks are visible. */
export function collapseDoneDefault(visibleCount: number) { return visibleCount > COMPACT_DEFAULT_THRESHOLD; }

/** IDs of tasks to draw as compact nodes. Every visible done task is compact, whatever depends on it. */
export function compactTaskIds(tasks: readonly TaskSummaryDto[]): Set<string> {
  return new Set(tasks.filter((task) => task.status === "done").map((task) => task.id));
}
