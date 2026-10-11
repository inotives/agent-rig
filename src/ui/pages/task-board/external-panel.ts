import { TaskDetailDto } from "../../core/contracts.js";
import { phaseLabel } from "../phase-list/index.js";

/** The panel asks for at most this many dependency tasks. The rest are counted. */
export const MAX_EXTERNAL_LOOKUPS = 20;
const NOT_FOUND = "Task not found";

export type ExternalDependency = { id: string; state: "found"; task: TaskDetailDto } | { id: string; state: "missing" | "error" };
export type ExternalDependencies = { entries: ExternalDependency[]; more: number };

const STATUS_BADGES: Record<string, string> = { todo: "badge-neutral", ready: "badge-info", in_progress: "badge-warning", blocked: "badge-error", review: "badge-secondary", done: "badge-success" };

function node<K extends keyof HTMLElementTagNameMap>(tag: K, classes = "") { const element = document.createElement(tag); element.className = classes; return element; }

/** Link to a task in its own phase view. */
export function externalTaskHref(task: { id: string; phase: string }) { return `#/tasks/${encodeURIComponent(task.id)}?phase=${encodeURIComponent(task.phase)}`; }

/** Load the first 20 dependency tasks. A missing task and a failed request show as separate states. */
export async function loadExternalDependencies(ids: readonly string[], fetchTask: (id: string) => Promise<TaskDetailDto>): Promise<ExternalDependencies> {
  const asked = ids.slice(0, MAX_EXTERNAL_LOOKUPS);
  const entries = await Promise.all(asked.map(async (id): Promise<ExternalDependency> => {
    try { return { id, state: "found", task: await fetchTask(id) }; } catch (error) { return { id, state: error instanceof Error && error.message === NOT_FOUND ? "missing" : "error" }; }
  }));
  return { entries, more: ids.length - asked.length };
}

/** List of dependencies in other phases. Returns null when there are none. */
export function renderExternalDependencies(result: ExternalDependencies) {
  if (!result.entries.length && !result.more) return null;
  const section = node("section", "card mt-4 bg-base-100 shadow-sm");
  section.dataset.externalDependencies = "true";
  const body = node("div", "card-body");
  const title = node("h2", "card-title text-lg");
  title.textContent = "Dependencies in other phases";
  const list = node("ul", "divide-y divide-base-300 text-sm");
  for (const entry of result.entries) {
    const item = node("li", "flex flex-wrap items-center gap-x-3 gap-y-1 py-2");
    if (entry.state === "found") {
      const link = node("a", "link link-primary font-mono text-xs");
      link.href = externalTaskHref(entry.task);
      link.textContent = entry.id;
      const name = node("span", "min-w-0 flex-1 break-words");
      name.textContent = entry.task.title;
      const phase = node("span", "badge badge-outline badge-sm");
      phase.textContent = phaseLabel(entry.task.phase);
      const status = node("span", `badge badge-sm ${STATUS_BADGES[entry.task.status] ?? "badge-neutral"}`);
      status.textContent = entry.task.status.replaceAll("_", " ");
      item.append(link, name, phase, status);
    } else {
      const id = node("span", "font-mono text-xs");
      id.textContent = entry.id;
      const note = node("span", "opacity-70");
      note.textContent = entry.state === "missing" ? "not found" : "could not load";
      item.append(id, note);
    }
    list.append(item);
  }
  body.append(title, list);
  if (result.more > 0) { const more = node("p", "text-xs opacity-70"); more.textContent = `and ${result.more} more`; body.append(more); }
  section.append(body);
  return section;
}
