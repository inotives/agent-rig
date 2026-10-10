import { PhaseSummaryDto, PhasesResponseDto } from "../../core/contracts.js";
import { relativeTime } from "../../common/time.js";
import { graphStatusLegend } from "../task-board/graph/render.js";

export type PhaseState = "active" | "complete";

const UNASSIGNED = "Unassigned";
const NUMBERED_PHASE = /^(?:phase-)?(\d+)$/;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, classes = "") { const element = document.createElement(tag); element.className = classes; return element; }

/** The number N of `phase-N` or a bare `N`. Any other value has no number. */
export function phaseNumber(phase: string): number | null {
  const match = NUMBERED_PHASE.exec(phase);
  return match ? Number(match[1]) : null;
}

/** `Phase N` for a numbered phase. Any other value is shown as it is. */
export function phaseLabel(phase: string) {
  const number = phaseNumber(phase);
  return number === null ? phase : `Phase ${number}`;
}

/** `active` when at least one task is not done. `complete` when all tasks are done. */
export function phaseState(summary: PhaseSummaryDto): PhaseState {
  return summary.total > 0 && summary.counts.done === summary.total ? "complete" : "active";
}

/** Open work first. Inside a group: numbered phases by number, newest first, then other names A to Z. `Unassigned` is last. */
export function orderPhases(phases: readonly PhaseSummaryDto[]): PhaseSummaryDto[] {
  const rank = (item: PhaseSummaryDto) => item.phase === UNASSIGNED ? 2 : phaseState(item) === "active" ? 0 : 1;
  return [...phases].sort((a, b) => {
    const group = rank(a) - rank(b);
    if (group) return group;
    const left = phaseNumber(a.phase);
    const right = phaseNumber(b.phase);
    if (left !== null && right !== null) return right - left || a.phase.localeCompare(b.phase);
    if (left !== null) return -1;
    if (right !== null) return 1;
    return a.phase.localeCompare(b.phase);
  });
}

function phaseHref(phase: string) { return `#/?phase=${encodeURIComponent(phase)}`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }

function renderPhaseCard(summary: PhaseSummaryDto, now: number) {
  const state = phaseState(summary);
  const label = phaseLabel(summary.phase);
  const card = node("article", "card card-compact min-w-0 bg-base-100 shadow-sm");
  card.dataset.phase = summary.phase;
  const body = node("div", "card-body min-w-0 gap-3");

  const top = node("div", "flex min-w-0 items-start justify-between gap-2");
  const title = node("h2", "card-title min-w-0 break-words text-base");
  title.textContent = label;
  const badge = node("span", `badge badge-sm shrink-0 ${state === "active" ? "badge-info" : "badge-success"}`);
  badge.textContent = state;
  top.append(title, badge);

  const progress = node("div", "flex flex-col gap-1");
  const bar = node("progress", `progress w-full ${state === "complete" ? "progress-success" : "progress-info"}`) as HTMLProgressElement;
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", `${label} progress`);
  bar.setAttribute("aria-valuenow", String(summary.counts.done));
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(summary.total));
  bar.value = summary.counts.done;
  bar.max = Math.max(summary.total, 1);
  const done = node("p", "text-xs tabular-nums opacity-70");
  done.textContent = `${summary.counts.done} of ${summary.total} done`;
  progress.append(bar, done);

  const chips = node("ul", "flex min-h-[1.25rem] flex-wrap gap-1.5");
  chips.setAttribute("aria-label", "Open tasks by status");
  for (const item of graphStatusLegend()) {
    if (item.status === "done") continue;
    const count = summary.counts[item.status as keyof PhaseSummaryDto["counts"]] ?? 0;
    if (count <= 0) continue;
    const entry = node("li");
    const chip = node("span", item.className);
    chip.dataset.statusChip = item.status;
    chip.textContent = `${count} ${item.label}`;
    entry.append(chip);
    chips.append(entry);
  }

  const footer = node("div", "mt-auto flex items-center justify-between gap-2 pt-1");
  const time = node("p", "min-w-0 truncate text-xs opacity-70");
  time.dataset.latestUpdate = "true";
  time.title = formatDate(summary.latest_updated_on);
  time.textContent = relativeTime(summary.latest_updated_on, now);
  const detail = node("a", "btn btn-primary btn-sm shrink-0") as HTMLAnchorElement;
  detail.href = phaseHref(summary.phase);
  detail.textContent = "Detail";
  detail.setAttribute("aria-label", `Open ${label}`);
  footer.append(time, detail);

  body.append(top, progress, chips, footer);
  card.append(body);
  return card;
}

/** A grid of phase cards in display order, or the empty state. */
export function renderPhaseCards(data: PhasesResponseDto, now: number = Date.now()) {
  if (!data.phases.length) {
    const empty = node("div", "alert alert-info text-sm");
    empty.textContent = "No phases yet";
    return empty;
  }
  const grid = node("div", "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4");
  for (const summary of orderPhases(data.phases)) grid.append(renderPhaseCard(summary, now));
  return grid;
}

export function renderPhaseSkeleton() {
  const grid = node("div", "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4");
  grid.setAttribute("aria-label", "Loading phases");
  for (let index = 0; index < 6; index += 1) grid.append(node("div", "h-40 animate-pulse rounded-box bg-base-300"));
  return grid;
}
