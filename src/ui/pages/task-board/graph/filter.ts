import { TaskGraphLayout } from "./layout.js";

/** Search text, status set, and agent. An empty value means no limit on that part. */
export type GraphFilter = { query: string; statuses: ReadonlySet<string>; agent: string };
export const EMPTY_FILTER: GraphFilter = { query: "", statuses: new Set(), agent: "" };

export type GraphFilterMatch = { active: boolean; ids: ReadonlySet<string> | null; count: number; total: number; first: string | null };
type FilterTask = { id: string; title?: string | null; status: string; assigned_to?: string | null };

export const UNASSIGNED_AGENT = "unassigned";
const agentOf = (task: FilterTask) => task.assigned_to || UNASSIGNED_AGENT;

export function isFilterActive(filter: GraphFilter) { return filter.query.trim() !== "" || filter.statuses.size > 0 || filter.agent !== ""; }

export function toggleStatus(filter: GraphFilter, status: string): GraphFilter {
  const statuses = new Set(filter.statuses);
  if (!statuses.delete(status)) statuses.add(status);
  return { ...filter, statuses };
}

/** Search matches ID, title, and agent. Status and agent limits combine with AND. */
export function taskMatchesFilter(task: FilterTask, filter: GraphFilter) {
  if (filter.statuses.size > 0 && !filter.statuses.has(task.status)) return false;
  if (filter.agent !== "" && agentOf(task) !== filter.agent) return false;
  const query = filter.query.trim().toLowerCase();
  return query === "" || [task.id, task.title ?? "", task.assigned_to ?? ""].some((value) => value.toLowerCase().includes(query));
}

/** Match every task in a layout. The first match follows the layout node order. */
export function computeFilterMatch(layout: TaskGraphLayout, filter: GraphFilter): GraphFilterMatch {
  const total = layout.nodes.length;
  if (!isFilterActive(filter)) return { active: false, ids: null, count: total, total, first: null };
  const matches = layout.nodes.filter((item) => taskMatchesFilter(item.task, filter));
  return { active: true, ids: new Set(matches.map((item) => item.task.id)), count: matches.length, total, first: matches[0]?.task.id ?? null };
}

/** Sorted agent names found in the layout. */
export function agentOptions(layout: TaskGraphLayout) { return [...new Set(layout.nodes.map((item) => agentOf(item.task)))].sort(); }
