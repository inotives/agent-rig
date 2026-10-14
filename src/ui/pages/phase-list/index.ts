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

/** Last updated first. Equal times: numbered phases by number, newest first, then other names A to Z. `Unassigned` is last. */
export function orderPhases(phases: readonly PhaseSummaryDto[]): PhaseSummaryDto[] {
  const updated = (item: PhaseSummaryDto) => { const time = Date.parse(item.latest_updated_on); return Number.isNaN(time) ? 0 : time; };
  return [...phases].sort((a, b) => {
    const group = Number(a.phase === UNASSIGNED) - Number(b.phase === UNASSIGNED);
    if (group) return group;
    const recent = updated(b) - updated(a);
    if (recent) return recent;
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
  const accent = state === "active" ? "from-teal-400 via-sky-400 to-blue-400" : "from-lime-400 via-lime-300 to-teal-400";
  const card = node("article", "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-sm transition duration-300 hover:-translate-y-0.5 dark:border-white/10 dark:bg-gradient-to-br dark:from-white/[0.07] dark:to-white/[0.02] dark:shadow-none dark:backdrop-blur dark:hover:border-teal-400/40 dark:hover:shadow-[0_0_32px_-8px_rgba(45,212,191,0.45)]");
  card.dataset.phase = summary.phase;
  const glow = node("div", `absolute inset-x-0 top-0 h-px bg-gradient-to-r ${accent} opacity-70 transition-opacity group-hover:opacity-100`);
  glow.setAttribute("aria-hidden", "true");
  const body = node("div", "flex min-w-0 flex-1 flex-col gap-4 p-5");

  const top = node("div", "flex min-w-0 items-start justify-between gap-2");
  const title = node("h2", "min-w-0 break-words text-lg font-semibold tracking-tight");
  title.textContent = label;
  const badge = node("span", `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest ${state === "active" ? "border-teal-400/40 bg-teal-400/10 text-teal-600 dark:text-teal-300" : "border-lime-400/40 bg-lime-400/10 text-lime-600 dark:text-lime-300"}`);
  const dot = node("span", `h-1.5 w-1.5 rounded-full ${state === "active" ? "animate-pulse bg-teal-400" : "bg-lime-400"}`);
  dot.setAttribute("aria-hidden", "true");
  const stateText = node("span");
  stateText.textContent = state;
  badge.append(dot, stateText);
  top.append(title, badge);

  const progress = node("div", "flex flex-col gap-1");
  const bar = node("progress", `progress h-1.5 w-full bg-base-300 dark:bg-white/10 [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-gradient-to-r ${state === "complete" ? "[&::-webkit-progress-value]:from-lime-400 [&::-webkit-progress-value]:to-teal-400 [&::-moz-progress-bar]:bg-lime-400" : "[&::-webkit-progress-value]:from-teal-400 [&::-webkit-progress-value]:to-blue-400 [&::-moz-progress-bar]:bg-teal-400"}`) as HTMLProgressElement;
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", `${label} progress`);
  bar.setAttribute("aria-valuenow", String(summary.counts.done));
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(summary.total));
  bar.value = summary.counts.done;
  bar.max = Math.max(summary.total, 1);
  const done = node("p", "font-mono text-xs tabular-nums opacity-60");
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

  const footer = node("div", "mt-auto flex items-center justify-between gap-2 border-t border-base-300 pt-3 dark:border-white/10");
  const time = node("p", "min-w-0 truncate font-mono text-xs opacity-60");
  time.dataset.latestUpdate = "true";
  time.title = formatDate(summary.latest_updated_on);
  time.textContent = relativeTime(summary.latest_updated_on, now);
  const detail = node("a", "btn btn-sm shrink-0 rounded-full border-teal-400/40 bg-teal-400/10 text-teal-700 transition hover:border-teal-400 hover:bg-teal-400/20 dark:text-teal-200") as HTMLAnchorElement;
  detail.href = phaseHref(summary.phase);
  detail.textContent = "Detail";
  detail.setAttribute("aria-label", `Open ${label}`);
  footer.append(time, detail);

  body.append(top, progress, chips, footer);
  card.append(glow, body);
  return card;
}

/** A grid of phase cards in display order, or the empty state. */
export function renderPhaseCards(data: PhasesResponseDto, now: number = Date.now()) {
  if (!data.phases.length) {
    const empty = node("div", "alert alert-info text-sm");
    empty.textContent = "No phases yet";
    return empty;
  }
  const grid = node("div", "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4");
  for (const summary of orderPhases(data.phases)) grid.append(renderPhaseCard(summary, now));
  return grid;
}

export function renderPhaseSkeleton() {
  const grid = node("div", "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4");
  grid.setAttribute("aria-label", "Loading phases");
  for (let index = 0; index < 6; index += 1) grid.append(node("div", "h-44 animate-pulse rounded-2xl bg-base-300 dark:bg-white/5"));
  return grid;
}

export type PhaseFilter = { q: string; from: string; to: string };
export const EMPTY_PHASE_FILTER: PhaseFilter = { q: "", from: "", to: "" };
const MAX_QUERY_LENGTH = 100;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A valid `YYYY-MM-DD` day, or an empty string. */
function validDay(value: string) { return DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : ""; }
/**
 * The local calendar day of a date or a timestamp, or an empty string when there is none.
 * A date has no time zone and stays as it is. A timestamp becomes the day in the viewer's time zone,
 * the same day that the card shows.
 */
export function dayOf(value: string) {
  if (DAY.test(value)) return validDay(value);
  if (!DAY.test(value.slice(0, 10))) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
}

/** Read the filter from the hash query. Unknown or invalid values are ignored. */
export function parsePhaseFilter(hash: string): PhaseFilter {
  const query = hash.split("?", 2)[1];
  if (!query) return EMPTY_PHASE_FILTER;
  const params = new URLSearchParams(query);
  const q = (params.get("q") ?? "").trim();
  return { q: q.length <= MAX_QUERY_LENGTH && !/[\u0000-\u001f\u007f\ufffd]/.test(q) ? q : "", from: validDay(params.get("from")?.trim() ?? ""), to: validDay(params.get("to")?.trim() ?? "") };
}

/** The landing hash for a filter. An empty filter gives `#/`. */
export function phaseFilterHash(filter: PhaseFilter) {
  const params = new URLSearchParams();
  if (filter.q.trim()) params.set("q", filter.q.trim());
  if (validDay(filter.from)) params.set("from", filter.from);
  if (validDay(filter.to)) params.set("to", filter.to);
  const query = params.toString();
  return query ? `#/?${query}` : "#/";
}

export function phaseFilterActive(filter: PhaseFilter) { return filter.q.trim() !== "" || filter.from !== "" || filter.to !== ""; }
export function phaseRangeInverted(filter: PhaseFilter) { return filter.from !== "" && filter.to !== "" && filter.from > filter.to; }

/** Phases that match the search text and the date range. Both ends of the range are inclusive. An inverted range matches nothing. */
export function filterPhases(phases: readonly PhaseSummaryDto[], filter: PhaseFilter): PhaseSummaryDto[] {
  if (phaseRangeInverted(filter)) return [];
  const needle = filter.q.trim().toLowerCase();
  const ranged = filter.from !== "" || filter.to !== "";
  return phases.filter((item) => {
    if (needle && !item.phase.toLowerCase().includes(needle) && !phaseLabel(item.phase).toLowerCase().includes(needle)) return false;
    if (!ranged) return true;
    const day = dayOf(item.latest_updated_on);
    return day !== "" && (filter.from === "" || day >= filter.from) && (filter.to === "" || day <= filter.to);
  });
}

function filterField(id: string, labelText: string, type: string, value: string, classes: string) {
  const field = node("div", classes);
  const label = node("label", "text-[0.65rem] font-medium uppercase tracking-widest opacity-60");
  label.htmlFor = id;
  label.textContent = labelText;
  const input = node("input", "input input-sm w-full min-w-0 rounded-full border-base-300 bg-base-100 px-4 focus:border-teal-400 focus:outline-teal-400 dark:border-white/10 dark:bg-white/[0.04]");
  input.id = id;
  input.type = type;
  input.value = value;
  field.append(label, input);
  return { field, input };
}

/**
 * The landing view: a filter bar and the phase cards. The filter works on `data` in the browser.
 * `onFilterChange` receives each new filter so the caller can keep it in the URL.
 */
export function renderPhaseLanding(data: PhasesResponseDto, initial: PhaseFilter, onFilterChange: (filter: PhaseFilter) => void, now: number = Date.now()) {
  if (!data.phases.length) return renderPhaseCards(data, now);
  let filter = initial;
  const root = node("div", "flex flex-col gap-4");
  const bar = node("div", "flex flex-wrap items-end gap-3 rounded-2xl border border-base-300 bg-base-100 p-4 dark:border-white/10 dark:bg-white/[0.03] dark:backdrop-blur");
  bar.setAttribute("role", "search");
  const search = filterField("phase-filter-q", "Search phases", "search", filter.q, "flex w-full flex-col gap-1 sm:w-64");
  const from = filterField("phase-filter-from", "Updated from", "date", filter.from, "flex min-w-0 flex-1 flex-col gap-1 sm:w-40 sm:flex-none");
  const to = filterField("phase-filter-to", "Updated to", "date", filter.to, "flex min-w-0 flex-1 flex-col gap-1 sm:w-40 sm:flex-none");
  search.input.placeholder = "Phase name or number";
  const clear = node("button", "btn btn-ghost btn-sm rounded-full") as HTMLButtonElement;
  clear.type = "button";
  clear.textContent = "Clear";
  const actions = node("div", "flex h-8 w-full items-center gap-3 sm:w-auto");
  const count = node("p", "text-sm tabular-nums opacity-70");
  count.setAttribute("aria-live", "polite");
  count.dataset.filterCount = "true";
  actions.append(clear, count);
  bar.append(search.field, from.field, to.field, actions);
  const results = node("div");

  function update() {
    const active = phaseFilterActive(filter);
    const matches = filterPhases(data.phases, filter);
    clear.disabled = !active;
    count.textContent = active ? `${matches.length} of ${data.phases.length} phases` : "";
    if (matches.length) { results.replaceChildren(renderPhaseCards({ ...data, phases: matches }, now)); return; }
    const empty = node("div", "flex flex-wrap items-center gap-3 rounded-2xl border border-base-300 bg-base-100 p-4 text-sm dark:border-white/10 dark:bg-white/[0.03]");
    empty.dataset.phaseEmpty = "true";
    const message = node("span");
    message.textContent = phaseRangeInverted(filter) ? "No phases match. Updated from is later than Updated to." : "No phases match";
    const again = node("button", "btn btn-sm rounded-full border-teal-400/40 bg-teal-400/10") as HTMLButtonElement;
    again.type = "button";
    again.textContent = "Clear";
    again.addEventListener("click", reset);
    empty.append(message, again);
    results.replaceChildren(empty);
  }
  function change(next: PhaseFilter) { filter = next; update(); onFilterChange(filter); }
  function reset() { search.input.value = ""; from.input.value = ""; to.input.value = ""; change(EMPTY_PHASE_FILTER); }
  search.input.addEventListener("input", () => change({ ...filter, q: search.input.value }));
  from.input.addEventListener("input", () => change({ ...filter, from: validDay(from.input.value) }));
  to.input.addEventListener("input", () => change({ ...filter, to: validDay(to.input.value) }));
  clear.addEventListener("click", reset);
  update();
  root.append(bar, results);
  return root;
}
