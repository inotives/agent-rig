import { TaskSummaryDto } from "../../core/contracts.js";
import { phaseLabel, phaseState } from "../phase-list/index.js";
import type { PhaseState } from "../phase-list/index.js";

export type PhaseHeaderInfo = { label: string; state: PhaseState; done: number; total: number; progress: string };

/** Label, state, and progress of one phase, from its loaded tasks. */
export function phaseHeaderInfo(phase: string, tasks: readonly Pick<TaskSummaryDto, "status">[]): PhaseHeaderInfo {
  const done = tasks.filter((task) => task.status === "done").length;
  const total = tasks.length;
  const counts = { todo: 0, ready: 0, in_progress: 0, blocked: 0, review: 0, done };
  return { label: phaseLabel(phase), state: phaseState({ phase, total, counts, latest_updated_on: "" }), done, total, progress: `${done} of ${total} done` };
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, classes = "") { const element = document.createElement(tag); element.className = classes; return element; }

/** "All phases / Phase N", with the state badge and the progress when the tasks are loaded. */
export function renderPhaseBreadcrumb(phase: string, tasks: readonly Pick<TaskSummaryDto, "status">[] | null) {
  const nav = node("nav", "flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm");
  nav.setAttribute("aria-label", "Breadcrumb");
  const back = node("a", "link link-primary");
  back.href = "#/";
  back.textContent = "All phases";
  const separator = node("span", "opacity-50");
  separator.setAttribute("aria-hidden", "true");
  separator.textContent = "/";
  const current = node("span", "font-semibold");
  current.setAttribute("aria-current", "page");
  current.textContent = phaseLabel(phase);
  nav.append(back, separator, current);
  if (tasks) {
    const info = phaseHeaderInfo(phase, tasks);
    const badge = node("span", `badge badge-sm ${info.state === "active" ? "badge-info" : "badge-success"}`);
    badge.textContent = info.state;
    const progress = node("span", "text-xs opacity-70");
    progress.textContent = info.progress;
    nav.append(badge, progress);
  }
  return nav;
}
