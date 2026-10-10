import { HandoffDto, PhasesResponseDto, TaskDetailDto, TaskSummaryDto, WorkflowSummaryDto } from "../../core/contracts.js";
import { relativeTime } from "../../common/time.js";
import { parsePhaseFilter, phaseFilterHash, renderPhaseLanding, renderPhaseSkeleton } from "../phase-list/index.js";
import { loadExternalDependencies, renderExternalDependencies } from "./external-panel.js";
import type { ExternalDependencies } from "./external-panel.js";
import { externalDependencyIds } from "./graph/external.js";
import { renderPhaseBreadcrumb } from "./phase-header.js";
import { collapseDoneDefault, compactTaskIds } from "./graph/compact.js";
import { layoutTaskGraph } from "./graph/layout.js";
import { applyGraphFocus, computeGraphFocus, focusTarget } from "./graph/focus.js";
import { EMPTY_FILTER, GraphFilter, agentOptions, computeFilterMatch } from "./graph/filter.js";
import { renderGraphSvg } from "./graph/render.js";
import { renderGraphToolbar } from "./graph/toolbar.js";
import { GraphPoint, GraphSize, GraphView, ZOOM_STEP, exceedsDragThreshold, fitView, panBy, viewBoxOf, viewForRect, zoomAt, zoomLabel } from "./graph/viewport.js";
export { computeLineage, countEdgeCrossings, layoutTaskGraph } from "./graph/layout.js";
export type { TaskGraphEdge, TaskGraphLayout, TaskGraphNode, TaskLineage } from "./graph/layout.js";

export const STATUS_COLUMNS = ["todo", "ready", "in_progress", "blocked", "review", "done"] as const;
export type StatusColumn = (typeof STATUS_COLUMNS)[number];
export type TaskSummary = TaskSummaryDto;
export type WorkflowSummary = WorkflowSummaryDto;
export type TaskDetail = TaskDetailDto;
export type Handoff = HandoffDto;
export { relativeTime };
export type UiRoute = { kind: "board" } | { kind: "task"; taskId: string };
export type UiLoadState = "idle" | "loading" | "ready" | "error";
export type UiState = { route: UiRoute; selectedPhase: string | null; selectedTaskId: string | null; loadState: UiLoadState; error: string | null; data?: WorkflowSummary; lastGoodData?: WorkflowSummary; theme: "light" | "dark" };

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, normal: 3, low: 4 };
const THEME_KEY = "agent-rig-theme";
const PHASE_QUERY_KEY = "phase";
const MAX_PHASE_LENGTH = 200;
/** A phase value is any non-empty text with no control or replacement character. The server decides whether the phase exists. */
function validPhase(value: string) { return value.length > 0 && value.length <= MAX_PHASE_LENGTH && !/[\u0000-\u001f\u007f\ufffd]/.test(value); }

export function sortTasks(tasks: readonly TaskSummary[]) { return [...tasks].sort((a, b) => { const priority = (PRIORITY_ORDER[a.priority.toLowerCase()] ?? 99) - (PRIORITY_ORDER[b.priority.toLowerCase()] ?? 99); return priority || Date.parse(b.updated_on) - Date.parse(a.updated_on) || a.id.localeCompare(b.id); }); }
export function sortHandoffs(handoffs: readonly Handoff[]) { return [...handoffs].sort((a, b) => b.sequence - a.sequence); }
export function filterHandoffs(handoffs: readonly Handoff[], query: string) { const needle = query.trim().toLowerCase(); return handoffs.filter((item) => [item.sequence, item.sender, item.recipient, item.status, item.message, item.created_at, JSON.stringify(item.metadata)].some((value) => String(value ?? "").toLowerCase().includes(needle))); }
export function preferredTheme(): "light" | "dark" { const saved = localStorage.getItem(THEME_KEY); if (saved === "light" || saved === "dark") return saved; return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
export function applyTheme(theme: "light" | "dark") { setTheme(theme, true); }
export function parseRoute(hash = typeof location === "undefined" ? "#/" : location.hash): UiRoute {
  const match = hash.split("?", 1)[0].match(/^#\/tasks\/(.+)$/);
  if (!match) return { kind: "board" };
  try { return { kind: "task", taskId: decodeURIComponent(match[1]) }; } catch { return { kind: "board" }; }
}
function phaseFromHash(hash: string): string | null {
  const query = hash.split("?", 2)[1];
  if (!query) return null;
  const value = new URLSearchParams(query).get(PHASE_QUERY_KEY)?.trim() ?? "";
  return validPhase(value) ? value : null;
}
export function routeHash(route: UiRoute, selectedPhase: string | null = null) {
  const path = route.kind === "board" ? "#/" : `#/tasks/${encodeURIComponent(route.taskId)}`;
  return selectedPhase === null ? path : `${path}?${PHASE_QUERY_KEY}=${encodeURIComponent(selectedPhase)}`;
}
export function createUiState(hash = typeof location === "undefined" ? "#/" : location.hash): UiState { const route = parseRoute(hash); return { route, selectedPhase: phaseFromHash(hash), selectedTaskId: route.kind === "task" ? route.taskId : null, loadState: "idle", error: null, theme: preferredTheme() }; }
export function setUiRoute(state: UiState, hash: string): UiState { const route = parseRoute(hash); return { ...state, route, selectedPhase: phaseFromHash(hash), selectedTaskId: route.kind === "task" ? route.taskId : null, error: null }; }
export function beginUiLoad(state: UiState): UiState { return { ...state, loadState: "loading", error: null }; }
export function completeUiLoad(state: UiState, data: WorkflowSummary): UiState { return { ...state, loadState: "ready", data, lastGoodData: data, error: null }; }
export function failUiLoad(state: UiState, error: string): UiState { return { ...state, loadState: "error", error, data: state.lastGoodData }; }
function setTheme(theme: "light" | "dark", persist: boolean) { document.documentElement.classList.toggle("dark", theme === "dark"); document.documentElement.dataset.theme = theme; if (persist) localStorage.setItem(THEME_KEY, theme); }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, classes = "") { const element = document.createElement(tag); element.className = classes; return element; }
function text(value: unknown, fallback = "—") { return value === null || typeof value === "undefined" || value === "" ? fallback : String(value); }
function labelValue(label: string, value: unknown) { const wrapper = node("div", "min-w-0"); const name = node("dt", "text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"); name.textContent = label; const content = node("dd", "truncate text-xs text-slate-700 dark:text-slate-200"); content.textContent = text(value); wrapper.append(name, content); return wrapper; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }

export type TaskPreviewRect = { left: number; top: number; width: number; height: number };
export type TaskPreviewPosition = { left: number; top: number };

/** Place the preview beside the task: right, left, below, then above. Use the first spot that stays inside the wrapper and does not cover the task. */
export function positionTaskPreview(taskRect: TaskPreviewRect, wrapperRect: TaskPreviewRect, previewWidth: number, previewHeight: number, gap = 12): TaskPreviewPosition {
  const relativeLeft = taskRect.left - wrapperRect.left;
  const relativeTop = taskRect.top - wrapperRect.top;
  const wrapperWidth = Math.max(0, wrapperRect.width);
  const wrapperHeight = Math.max(0, wrapperRect.height);
  const clamp = (position: TaskPreviewPosition): TaskPreviewPosition => ({ left: Math.min(Math.max(0, wrapperWidth - previewWidth), Math.max(0, position.left)), top: Math.min(Math.max(0, wrapperHeight - previewHeight), Math.max(0, position.top)) });
  const covers = (position: TaskPreviewPosition) => position.left < relativeLeft + taskRect.width && position.left + previewWidth > relativeLeft && position.top < relativeTop + taskRect.height && position.top + previewHeight > relativeTop;
  const sides = [{ left: relativeLeft + taskRect.width + gap, top: relativeTop }, { left: relativeLeft - previewWidth - gap, top: relativeTop }].filter((position) => position.left >= 0 && position.left + previewWidth <= wrapperWidth).map(clamp);
  const stacked = [{ left: relativeLeft, top: relativeTop + taskRect.height + gap }, { left: relativeLeft, top: relativeTop - previewHeight - gap }].map(clamp);
  return [...sides, ...stacked].find((position) => !covers(position)) ?? clamp({ left: relativeLeft + taskRect.width + gap, top: relativeTop });
}

const STATUS_TONES: Record<string, string> = { todo: "neutral", ready: "info", in_progress: "warning", blocked: "error", review: "secondary", done: "success" };
const STATUS_PREVIEW_CLASSES: Record<string, string> = {
  todo: "bg-neutral text-neutral-content",
  ready: "bg-info text-info-content",
  in_progress: "bg-warning text-warning-content",
  blocked: "bg-error text-error-content",
  review: "bg-secondary text-secondary-content",
  done: "bg-success text-success-content"
};
export function taskPreviewTone(status: string) { return STATUS_TONES[status] ?? "neutral"; }
export function taskPreviewMetadata(task: TaskSummary) {
  return {
    Status: task.status.replaceAll("_", " "),
    Assignee: task.assigned_to || "unassigned",
    Phase: task.phase,
    Priority: task.priority,
    Handoffs: task.handoff_count
  };
}
export function taskPreviewHeaderClass(status: string) { return STATUS_PREVIEW_CLASSES[status] ?? STATUS_PREVIEW_CLASSES.todo; }
export function renderTaskPreview(preview: HTMLElement, task: TaskSummary) {
  preview.className = "card card-compact pointer-events-none absolute z-10 hidden w-72 max-w-xs overflow-hidden bg-base-100 text-xs shadow-xl";
  preview.dataset.taskPreview = "true";
  preview.setAttribute("role", "status");
  preview.replaceChildren();
  const header = node("div", `px-3 py-2 ${taskPreviewHeaderClass(task.status)}`);
  const title = node("h3", "font-semibold leading-tight"); title.textContent = text(task.title);
  const id = node("p", "mt-1 font-mono text-[11px] opacity-80"); id.textContent = task.id;
  header.append(title, id);
  const body = node("div", "card-body p-3");
  const details = node("dl", "grid grid-cols-2 gap-x-3 gap-y-2");
  for (const [label, value] of Object.entries(taskPreviewMetadata(task))) details.append(labelValue(label, value));
  body.append(details);
  preview.append(header, body);
}
/** Add pan, zoom, and the corner toolbar to a graph viewport. A drag starts only after a small move, so a click on a card still selects it. */
function attachGraphViewport(viewport: HTMLElement, svgRoot: SVGElement, layout: { width: number; height: number }, onPanStart: () => void) {
  const content: GraphSize = { width: layout.width, height: layout.height };
  let view: GraphView = { scale: 1, tx: 0, ty: 0 };
  const size = (): GraphSize => { const width = viewport.clientWidth; const height = viewport.clientHeight; return width > 0 && height > 0 ? { width, height } : content; };
  const apply = (next: GraphView) => { view = next; svgRoot.setAttribute("viewBox", viewBoxOf(view, size())); level.textContent = zoomLabel(view.scale); };
  const fit = () => apply(fitView(content, size(), viewport.clientWidth > 0 ? 16 : 0));
  const zoomCentre = (factor: number) => { const { width, height } = size(); apply(zoomAt(view, factor, { x: width / 2, y: height / 2 })); };
  const button = (label: string, textContent: string, onClick: () => void) => { const item = node("button", "btn btn-ghost btn-xs join-item"); item.type = "button"; item.textContent = textContent; item.setAttribute("aria-label", label); item.addEventListener("click", onClick); return item; };
  const level = node("span", "join-item flex min-w-[3.5rem] items-center justify-center bg-base-100 px-2 text-xs tabular-nums"); level.setAttribute("role", "status"); level.setAttribute("aria-label", "Zoom level"); level.textContent = zoomLabel(view.scale);
  const toolbar = node("div", "join absolute right-2 top-2 z-10 border border-base-300 bg-base-100 shadow-sm"); toolbar.setAttribute("role", "toolbar"); toolbar.setAttribute("aria-label", "Task flow view controls");
  toolbar.append(button("Fit task flow to view", "Fit", fit), button("Zoom out task flow", "−", () => zoomCentre(1 / ZOOM_STEP)), level, button("Zoom in task flow", "+", () => zoomCentre(ZOOM_STEP)));
  toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());

  let drag: { id: number; startX: number; startY: number; lastX: number; lastY: number; active: boolean } | null = null;
  viewport.addEventListener("pointerdown", (event) => { if (event.button !== 0 || !event.isPrimary) return; drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, active: false }; });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.active) {
      if (!exceedsDragThreshold(drag.startX, drag.startY, event.clientX, event.clientY)) return;
      drag.active = true; drag.lastX = drag.startX; drag.lastY = drag.startY; onPanStart(); viewport.classList.add("cursor-grabbing");
      try { viewport.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
    }
    apply(panBy(view, event.clientX - drag.lastX, event.clientY - drag.lastY)); drag.lastX = event.clientX; drag.lastY = event.clientY;
  });
  const end = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const moved = drag.active; drag = null; viewport.classList.remove("cursor-grabbing");
    if (moved) { const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault(); }; viewport.addEventListener("click", swallow, { capture: true, once: true }); setTimeout(() => viewport.removeEventListener("click", swallow, { capture: true }), 0); }
  };
  viewport.addEventListener("pointerup", end); viewport.addEventListener("pointercancel", end);
  viewport.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    apply(zoomAt(view, Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.002)), { x: event.clientX - rect.left, y: event.clientY - rect.top }));
  }, { passive: false });
  viewport.append(toolbar);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(fit);
  if (typeof ResizeObserver === "function") new ResizeObserver(() => fit()).observe(viewport);
  return { jumpTo: (rect: GraphPoint & GraphSize) => apply(viewForRect(rect, size())) };
}
function graphCanvas(tasks: readonly TaskSummary[], selectedTaskId: string | null, onSelect: (id: string) => void, initialFilter: GraphFilter, onFilterChange: (filter: GraphFilter) => void, collapseDone: boolean, onCollapseChange: (value: boolean) => void) {
  const layout = layoutTaskGraph(tasks, collapseDone ? compactTaskIds(tasks) : new Set()); const wrapper = node("section", "card relative mt-5 bg-base-100 p-3 shadow-sm");
  const heading = node("div", "mb-2 flex items-center justify-between gap-2"); const title = node("h2", "text-lg font-bold"); title.textContent = "Task flow"; const hint = node("p", "text-xs text-slate-500 dark:text-slate-400"); hint.textContent = "Dependencies flow left to right. Drag to pan. Ctrl or Cmd plus wheel to zoom."; heading.append(title, hint); wrapper.append(heading);
  if (layout.hasCycle) { const warning = node("div", "alert alert-warning mb-2 py-2 text-xs"); warning.textContent = "Dependency cycle detected; cyclic tasks are shown in the fallback row."; wrapper.append(warning); }
  const preview = node("div", "card card-compact pointer-events-none absolute z-10 hidden w-72 max-w-xs overflow-hidden bg-base-100 text-xs shadow-xl"); preview.dataset.taskPreview = "true"; preview.setAttribute("role", "status"); wrapper.append(preview);
  const viewport = node("div", "relative h-[60vh] min-h-[20rem] cursor-grab touch-none select-none overflow-hidden rounded-box border border-base-300");
  let hoveredId: string | null = null; let svgRoot: SVGElement | null = null;
  let match = computeFilterMatch(layout, initialFilter);
  const refreshFocus = () => { if (svgRoot) applyGraphFocus(svgRoot, computeGraphFocus(layout, focusTarget(selectedTaskId, hoveredId)), match.ids); };
  const hidePreview = () => { preview.classList.add("hidden"); if (hoveredId !== null) { hoveredId = null; refreshFocus(); } };
  const showPreview = (element: Element, task: TaskSummary) => { if (hoveredId !== task.id) { hoveredId = task.id; refreshFocus(); } renderTaskPreview(preview, task); preview.classList.remove("hidden"); const position = positionTaskPreview(element.getBoundingClientRect(), wrapper.getBoundingClientRect(), preview.offsetWidth, preview.offsetHeight); preview.style.left = `${position.left}px`; preview.style.top = `${position.top}px`; };
  const graph = renderGraphSvg(layout, selectedTaskId, { onSelect, onPreview: showPreview, onPreviewEnd: hidePreview }); svgRoot = graph; refreshFocus();
  const view = attachGraphViewport(viewport, graph, layout, hidePreview);
  const toolbar = renderGraphToolbar(initialFilter, agentOptions(layout), {
    onChange: (next) => { match = computeFilterMatch(layout, next); toolbar.showMatch(match); onFilterChange(next); refreshFocus(); },
    onJump: () => { const first = layout.nodes.find((item) => item.task.id === match.first); if (first) view.jumpTo({ x: first.x, y: first.y, width: first.width, height: first.height }); }
  }, { value: collapseDone, onChange: onCollapseChange });
  match = computeFilterMatch(layout, toolbar.filter()); toolbar.showMatch(match); refreshFocus();
  wrapper.append(toolbar.element);
  viewport.append(graph); wrapper.append(viewport); return wrapper;
}

function taskCard(task: TaskSummary) { const card = node("article", "card card-compact bg-base-100 shadow-sm"); const body = node("div", "card-body"); const heading = node("div", "flex items-start justify-between gap-2"); const title = node("h3", "card-title line-clamp-2 text-sm"); title.textContent = text(task.title); const id = node("a", "link link-primary shrink-0 font-mono text-[11px]"); id.href = routeHash({ kind: "task", taskId: task.id }, task.phase); id.textContent = task.id; heading.append(title, id); const details = node("dl", "mt-3 grid grid-cols-2 gap-x-3 gap-y-2"); details.append(labelValue("Priority", task.priority), labelValue("Assignee", task.assigned_to), labelValue("Phase", task.phase), labelValue("Handoffs", task.handoff_count), labelValue("Updated", formatDate(task.updated_on))); body.append(heading, details); card.append(body); return card; }
function column(status: StatusColumn, tasks: readonly TaskSummary[]) { const section = node("section", "card min-h-48 min-w-[18rem] flex-1 bg-base-200 p-3"); const header = node("div", "mb-3 flex items-center justify-between"); const heading = node("h2", "text-sm font-bold"); heading.textContent = status.replaceAll("_", " "); const count = node("span", `badge badge-${STATUS_TONES[status]} badge-sm`); count.textContent = String(tasks.length); header.append(heading, count); const cards = node("div", "space-y-2"); if (!tasks.length) { const empty = node("div", "alert alert-info py-3 text-xs"); empty.textContent = "No tasks"; cards.append(empty); } else for (const task of tasks) cards.append(taskCard(task)); section.append(header, cards); return section; }
function skeleton() { const element = node("div", "grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"); for (const status of STATUS_COLUMNS) { const block = node("div", "h-56 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"); block.setAttribute("aria-label", `Loading ${status} column`); element.append(block); } return element; }
async function getJson<T>(path: string, notFound = "Task not found"): Promise<T> { const response = await fetch(path, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(response.status === 404 ? notFound : `Request failed (${response.status})`); return response.json() as Promise<T>; }
const PHASE_NOT_FOUND = "Phase not found";
function phaseNotFound(phase: string) { const box = node("section", "card bg-base-100 p-6 shadow-sm"); box.dataset.phaseNotFound = "true"; const heading = node("h2", "text-lg font-bold"); heading.textContent = PHASE_NOT_FOUND; const detail = node("p", "mt-1 text-sm opacity-70"); detail.textContent = `No phase named "${phase}" exists in this project.`; const back = node("a", "btn btn-primary btn-sm mt-4 w-fit"); back.href = "#/"; back.textContent = "Back to all phases"; box.append(heading, detail, back); return box; }
function loadPhases() { return getJson<PhasesResponseDto>("/api/phases"); }
function loadPhase(phase: string) { return getJson<WorkflowSummary>(`/api/workflow?phase=${encodeURIComponent(phase)}`, PHASE_NOT_FOUND); }

/** Escape first, then apply a small Markdown subset. Raw HTML is never interpreted. */
export function renderMarkdown(markdown: string): string { const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); const inline = (value: string) => value.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => /^(?:https?:\/\/|mailto:)/i.test(href) ? `<a href="${href}" rel="noreferrer">${label}</a>` : label); const lines = escape(markdown || "").split("\n"); const output: string[] = []; let list = false; let code = false; for (const line of lines) { if (line.trimStart().startsWith("```")) { code = !code; output.push(code ? "<pre><code>" : "</code></pre>"); continue; } if (code) { output.push(line); continue; } const heading = line.match(/^(#{1,3})\s+(.+)$/); const bullet = line.match(/^\s*[-*]\s+(.+)$/); if (!line.trim()) { if (list) { output.push("</ul>"); list = false; } continue; } if (bullet) { if (!list) { output.push("<ul>"); list = true; } output.push(`<li>${inline(bullet[1])}</li>`); continue; } if (list) { output.push("</ul>"); list = false; } if (heading) output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); else output.push(`<p>${inline(line)}</p>`); } if (list) output.push("</ul>"); if (code) output.push("</code></pre>"); return output.join(""); }
function badge(value: unknown, tone = "neutral") { const result = node("span", `badge badge-${tone} badge-sm`); result.textContent = text(value); return result; }

export function openHandoffModal(handoff: Handoff, trigger: HTMLElement | undefined = typeof document !== "undefined" ? document.activeElement as HTMLElement : undefined) { const dialog = node("dialog", "modal"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", "handoff-dialog-title"); const card = node("div", "card modal-box bg-base-100 shadow-xl"); const top = node("div", "card-title flex items-start justify-between gap-3"); const title = node("h2", "text-lg"); title.setAttribute("id", "handoff-dialog-title"); title.textContent = `Handoff #${handoff.sequence}`; const close = node("button", "btn btn-ghost btn-sm btn-circle"); close.type = "button"; close.setAttribute("aria-label", "Close handoff details"); close.textContent = "×"; top.append(title, close); const details = node("dl", "mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"); details.append(labelValue("Timestamp", formatDate(handoff.created_at)), labelValue("Sender", handoff.sender), labelValue("Recipient", handoff.recipient), labelValue("Status", handoff.status)); const content = node("div", "prose prose-sm mt-4 max-w-none dark:prose-invert"); content.innerHTML = renderMarkdown(handoff.message); const metadata = document.createElement("details"); metadata.className = "collapse-arrow collapse mt-5 border border-base-300 bg-base-200"; const summary = document.createElement("summary"); summary.className = "collapse-title cursor-pointer text-sm font-medium"; summary.textContent = "Metadata JSON"; const json = node("pre", "collapse-content overflow-x-auto text-xs"); json.textContent = JSON.stringify(handoff.metadata ?? {}, null, 2); metadata.append(summary, json); card.append(top, details, content, metadata); dialog.append(card); document.body.append(dialog); let cleaned = false; const cleanup = () => { if (cleaned) return; cleaned = true; dialog.remove(); document.removeEventListener("keydown", escape); trigger?.focus?.(); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cleanup(); }; close.addEventListener("click", cleanup); dialog.addEventListener("cancel", (event) => { event.preventDefault(); cleanup(); }); dialog.addEventListener("close", cleanup); dialog.addEventListener("click", (event) => { if (event.target === dialog) cleanup(); }); document.addEventListener("keydown", escape); const nativeDialog = dialog as HTMLDialogElement; if (typeof nativeDialog.showModal === "function") nativeDialog.showModal(); else dialog.setAttribute("open", ""); close.focus?.(); }
const HANDOFF_TONES: Record<string, string> = { done: "success", review: "secondary", ready: "info", blocked: "error", changes_requested: "warning", fixes_required: "warning", findings: "accent", handoff: "primary" };
// Full class names, so Tailwind can find them.
const HANDOFF_NODE_CLASSES: Record<string, string> = { success: "btn-success", secondary: "btn-secondary", info: "btn-info", error: "btn-error", warning: "btn-warning", accent: "btn-accent", primary: "btn-primary", neutral: "btn-neutral" };
const HANDOFF_BADGE_CLASSES: Record<string, string> = { success: "badge-success", secondary: "badge-secondary", info: "badge-info", error: "badge-error", warning: "badge-warning", accent: "badge-accent", primary: "badge-primary", neutral: "badge-neutral" };

/** Map a handoff status to a DaisyUI color token. An unknown status is neutral. */
export function handoffStatusTone(status: string) { return Object.prototype.hasOwnProperty.call(HANDOFF_TONES, status) ? HANDOFF_TONES[status] : "neutral"; }

/** Plain one-line text from a Markdown message. */
export function handoffPreviewText(markdown: string) {
  // The preview shows 2 lines. A short slice keeps the regex chain fast on any input.
  return String(markdown ?? "").slice(0, 1000)
    .replace(/[\uD800-\uDBFF]$/, "")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/~~(?=\S)([^\n]*?\S)~~/g, "$1")
    .replace(/`+([^`\n]*)`+/g, "$1")
    .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, "$1")
    .replace(/(?<!\w)__(?=\S)([^\n]*?\S)__(?!\w|\.\w)/g, "$1")
    .replace(/(?<![\w*])\*(?=[^\s*])([^\n]*?[^\s*])\*(?!\w)/g, "$1")
    .replace(/(?<![\w_])_(?=[^\s_])([^\n]*?[^\s_])_(?!\w|\.\w)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const STAGGER_STEP_MS = 60;
const STAGGER_CAP_MS = 600;

/** Start delay in ms for entry `index` of `count`. The last delay is at most 600 ms in total. */
export function handoffStaggerDelay(index: number, count: number) {
  if (!(count > 1) || !(index > 0)) return 0;
  const step = Math.min(STAGGER_STEP_MS, STAGGER_CAP_MS / (count - 1));
  return Math.round(Math.min(index, count - 1) * step);
}

export function renderHandoffTimeline(handoffs: Handoff[]) {
  const section = node("section", "card min-w-0 bg-base-100 shadow-sm");
  const body = node("div", "card-body min-w-0");
  const heading = node("div", "flex flex-wrap items-center justify-between gap-2");
  const title = node("h2", "card-title text-lg");
  title.textContent = "Handoff timeline";
  const search = node("input", "input input-bordered input-sm w-full sm:w-auto") as HTMLInputElement;
  search.type = "search";
  search.placeholder = "Search handoffs";
  search.setAttribute("aria-label", "Search handoffs");
  heading.append(title, search);

  const timeline = node("div", "relative mt-4 pl-14");
  const rail = node("div", "absolute bottom-2 left-6 top-2 w-1 origin-top bg-base-300 motion-safe:animate-timeline-rail");
  const events = node("div", "relative space-y-1");
  timeline.append(rail, events);

  const chip = (value: unknown, classes = "badge-ghost") => { const el = node("span", `badge badge-sm max-w-full ${classes}`); const label = node("span", "truncate"); label.textContent = text(value); el.append(label); return el; };
  // Motion: the first render animates every entry. A later render (search) animates only entries that were not shown before.
  let shown = new Set<number>();
  let firstRender = true;
  const newestSequence = handoffs.reduce((max, item) => Math.max(max, item.sequence), -Infinity);
  const renderEvents = () => {
    const filtered = sortHandoffs(filterHandoffs(handoffs, search.value));
    const previouslyShown = shown;
    shown = new Set(filtered.map((item) => item.sequence));
    const fresh = filtered.filter((item) => !previouslyShown.has(item.sequence));
    const animateNewest = firstRender;
    firstRender = false;
    events.replaceChildren();
    if (!filtered.length) {
      const empty = node("p", "py-5 text-sm opacity-70");
      empty.textContent = handoffs.length ? "No handoffs match your search." : "No handoffs recorded for this task yet.";
      events.append(empty);
      return;
    }
    const now = Date.now();
    for (const item of filtered) {
      const tone = handoffStatusTone(item.status);
      const freshIndex = fresh.indexOf(item);
      const isFresh = freshIndex >= 0;
      const isNewest = animateNewest && item.sequence === newestSequence;
      const event = node("article", `group relative min-w-0 pb-4 last:pb-0${isFresh ? " motion-safe:animate-timeline-entry" : ""}`);
      if (isFresh) event.setAttribute("style", `--stagger: ${handoffStaggerDelay(freshIndex, fresh.length)}ms`);
      // DaisyUI sets "animation" on .btn:active:hover and .btn:active:focus (3 classes). Repeat the same
      // animation under those states, so a press does not change it and a release does not restart it.
      // Write each class in full, so Tailwind can find it.
      const nodeMotion = isNewest
        ? " motion-safe:animate-timeline-node-newest motion-safe:active:hover:animate-timeline-node-newest motion-safe:active:focus:animate-timeline-node-newest"
        : isFresh
          ? " motion-safe:animate-timeline-node motion-safe:active:hover:animate-timeline-node motion-safe:active:focus:animate-timeline-node"
          : " motion-safe:animate-none motion-safe:active:hover:animate-none motion-safe:active:focus:animate-none";
      const detail = node("button", `btn btn-circle btn-md absolute -left-14 top-0 z-10 border-4 border-base-100 shadow-md ${HANDOFF_NODE_CLASSES[tone]}${nodeMotion}`);
      detail.type = "button";
      detail.textContent = String(item.sequence);
      detail.setAttribute("aria-label", "Open handoff " + item.sequence + " details");
      detail.addEventListener("click", () => openHandoffModal(item, detail));
      const card = node("div", "min-w-0 cursor-pointer rounded-box border border-base-300 bg-base-200 p-3 hover:shadow-md group-has-[:focus-visible]:shadow-md motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:group-has-[:focus-visible]:-translate-y-0.5");
      card.addEventListener("click", () => { if (typeof window !== "undefined" && window.getSelection?.()?.toString()) return; openHandoffModal(item, detail); });
      const top = node("div", "flex flex-wrap items-center gap-x-2 gap-y-1");
      const status = node("span", `badge badge-sm max-w-full capitalize ${HANDOFF_BADGE_CLASSES[tone]}`);
      status.title = item.status;
      const statusLabel = node("span", "truncate");
      statusLabel.textContent = item.status.replaceAll("_", " ");
      status.append(statusLabel);
      const fullDate = item.created_at ? formatDate(item.created_at) : "Unknown time";
      const time = node("span", "text-xs text-base-content/70");
      time.title = fullDate;
      time.textContent = relativeTime(item.created_at, now);
      const hidden = node("span", "sr-only");
      hidden.textContent = fullDate;
      top.append(status, time, hidden);
      const route = node("div", "mt-2 flex min-w-0 flex-wrap items-center gap-1 text-xs");
      const arrow = node("span", "text-base-content/60");
      arrow.textContent = "→";
      arrow.setAttribute("aria-label", "to");
      route.append(chip(item.sender), arrow, chip(item.recipient));
      if (item.answers_sequence !== undefined && item.answers_sequence !== null) { const answers = chip("answers #" + item.answers_sequence, "badge-outline"); route.append(answers); }
      const preview = node("p", "mt-2 line-clamp-2 break-words text-sm text-base-content/80");
      preview.textContent = handoffPreviewText(item.message);
      card.append(top, route, preview);
      event.append(detail, card);
      events.append(event);
    }
  };
  search.addEventListener("input", renderEvents);
  renderEvents();
  body.append(heading, timeline);
  section.append(body);
  return section;
}

function renderTaskDetail(task: TaskDetail, handoffs: Handoff[], onBack: () => void, external: ExternalDependencies = { entries: [], more: 0 }) {
  const main = node("main", "mx-auto max-w-screen-xl px-4 py-5");
  const back = node("a", "mb-4 inline-flex text-sm text-primary hover:underline");
  back.href = routeHash({ kind: "board" }, task.phase);
  back.textContent = "← Back to board";
  back.addEventListener("click", onBack);
  const heading = node("div", "flex flex-wrap items-start justify-between gap-3");
  const title = node("h1", "text-2xl font-bold");
  title.textContent = task.title;
  const id = node("p", "font-mono text-xs opacity-60");
  id.textContent = task.id;
  const headingText = node("div");
  headingText.append(title, id);
  heading.append(headingText, badge(task.status, STATUS_TONES[task.status] ?? "neutral"));
  const summary = node("section", "card mt-4 bg-base-100 shadow-sm");
  const summaryBody = node("div", "card-body");
  const summaryTitle = node("h2", "card-title text-lg");
  summaryTitle.textContent = "Summary";
  const metadata = node("dl", "grid grid-cols-2 gap-3 sm:grid-cols-4");
  metadata.append(
    labelValue("Type", task.type),
    labelValue("Assignee", task.assigned_to),
    labelValue("Priority", task.priority),
    labelValue("Phase", task.phase),
    labelValue("Created", formatDate(task.created_on)),
    labelValue("Updated", formatDate(task.updated_on)),
    labelValue("Dependencies", task.depends_on?.join(", ")),
    labelValue("Dependency ready", task.dependency_ready ? "Yes" : "No")
  );
  summaryBody.append(summaryTitle, metadata);
  summary.append(summaryBody);

  const markdown = node("article", "card bg-base-100 shadow-sm");
  const markdownBody = node("div", "card-body");
  const markdownTitle = node("h2", "card-title text-lg");
  markdownTitle.textContent = "Markdown";
  const content = node("div", "prose prose-sm max-w-none dark:prose-invert");
  content.innerHTML = renderMarkdown(task.body);
  markdownBody.append(markdownTitle, content);
  markdown.append(markdownBody);

  const handoffSection = renderHandoffTimeline(handoffs);
  const detailSplit = node("div", "mt-5 grid gap-5");
  detailSplit.append(markdown, handoffSection);
  const externalSection = renderExternalDependencies(external);
  main.append(back, heading, summary, ...(externalSection ? [externalSection] : []), detailSplit);
  return main;
}


export function mountBoard(root: HTMLElement) { let state = createUiState(); let graphFilter: GraphFilter = EMPTY_FILTER; let collapseChoice: boolean | null = null; let filterPhase = state.selectedPhase; let landing: PhasesResponseDto | undefined; let loadToken = 0; const app = node("div", "min-h-screen bg-base-200 text-base-content transition-colors"); const header = node("header", "navbar border-b border-base-300 bg-base-100"); const headerInner = node("div", "mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-4"); const brand = node("div"); const title = node("h1", "text-xl font-bold"); title.textContent = "AgentRig"; const subtitle = node("p", "text-sm italic opacity-70"); subtitle.textContent = "Read-only workflow visibility"; brand.append(title, subtitle); const controls = node("div", "flex items-center gap-2"); const crumbs = node("div", "w-full"); const refresh = node("button", "btn btn-primary btn-sm"); refresh.type = "button"; refresh.textContent = "Refresh"; const theme = node("button", "btn btn-ghost btn-sm"); theme.type = "button"; theme.addEventListener("click", () => applyTheme(preferredTheme() === "dark" ? "light" : "dark")); controls.append(refresh, theme); headerInner.append(brand, controls, crumbs); header.append(headerInner); const main = node("main", "mx-auto max-w-screen-2xl px-4 py-5"); const status = node("p", "mb-2 text-sm opacity-70"); const board = node("div", "grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"); const emptyDetail = node("aside", "card mt-5 bg-base-100 p-5 text-sm opacity-70"); emptyDetail.textContent = "Select a task to view its details."; main.append(status, board, emptyDetail); app.append(header, main); root.replaceChildren(app); setTheme(state.theme, false); theme.textContent = state.theme === "dark" ? "Light theme" : "Dark theme";
  function renderLanding(data: PhasesResponseDto) { title.textContent = `AgentRig: ${data.project_identifier}`; crumbs.classList.toggle("hidden", true); emptyDetail.classList.toggle("hidden", true); board.className = ""; board.replaceChildren(renderPhaseLanding(data, parsePhaseFilter(location.hash), (filter) => history.replaceState(null, "", phaseFilterHash(filter)))); status.textContent = `${data.phases.length} phase${data.phases.length === 1 ? "" : "s"}`; theme.textContent = preferredTheme() === "dark" ? "Light theme" : "Dark theme"; }
  function renderBoard() { const current = state.data ?? state.lastGoodData; const selected = state.selectedPhase; if (!current || selected === null) return; title.textContent = `AgentRig: ${current.project_identifier}`; crumbs.classList.toggle("hidden", false); crumbs.replaceChildren(renderPhaseBreadcrumb(selected, current.tasks)); emptyDetail.classList.toggle("hidden", false); const filtered = current.tasks; if (filterPhase !== selected) { filterPhase = selected; graphFilter = EMPTY_FILTER; collapseChoice = null; } if (typeof document.createElementNS === "function") { board.className = "overflow-x-auto"; board.replaceChildren(graphCanvas(sortTasks(filtered), state.selectedTaskId, (id) => { location.hash = routeHash({ kind: "task", taskId: id }, selected); }, graphFilter, (next) => { graphFilter = next; }, collapseChoice ?? collapseDoneDefault(filtered.length), (value) => { collapseChoice = value; renderBoard(); })); } else { board.className = "grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"; const grouped = new Map<string, TaskSummary[]>(); for (const task of filtered) grouped.set(task.status, [...(grouped.get(task.status) ?? []), task]); board.replaceChildren(...STATUS_COLUMNS.map((name) => column(name, sortTasks(grouped.get(name) ?? [])))); } status.textContent = `${filtered.length} task${filtered.length === 1 ? "" : "s"} in ${selected}`; theme.textContent = preferredTheme() === "dark" ? "Light theme" : "Dark theme"; }
  async function renderRoute() { const id = state.selectedTaskId; main.replaceChildren(status, board, emptyDetail); if (!id) { if (state.data || state.lastGoodData) renderBoard(); else board.replaceChildren(skeleton()); return; } renderBoard(); emptyDetail.replaceChildren(skeleton()); try { const [taskResponse, handoffResponse] = await Promise.all([getJson<{ task: TaskDetail }>(`/api/tasks/${encodeURIComponent(id)}`), getJson<{ handoffs: Handoff[] }>(`/api/tasks/${encodeURIComponent(id)}/handoffs`)]); const loadedIds = new Set((state.data ?? state.lastGoodData)?.tasks.map((item) => item.id) ?? []); const external = await loadExternalDependencies(externalDependencyIds(taskResponse.task, loadedIds), async (dependency) => (await getJson<{ task: TaskDetail }>(`/api/tasks/${encodeURIComponent(dependency)}`)).task); if (state.selectedTaskId !== id) return; const detail = renderTaskDetail(taskResponse.task, handoffResponse.handoffs, () => history.back(), external); const taskMetadata = document.createElement("details"); taskMetadata.className = "mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800"; const taskMetadataSummary = document.createElement("summary"); taskMetadataSummary.className = "cursor-pointer font-medium"; taskMetadataSummary.textContent = "Task metadata"; const taskMetadataJson = node("pre", "mt-3 overflow-x-auto text-xs"); taskMetadataJson.textContent = JSON.stringify(taskResponse.task.metadata ?? {}, null, 2); taskMetadata.append(taskMetadataSummary, taskMetadataJson); detail.append(taskMetadata); emptyDetail.replaceChildren(detail); } catch (error) { const empty = node("div", "rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"); empty.textContent = error instanceof Error && error.message === "Task not found" ? "Task not found." : error instanceof Error ? error.message : "Unable to load task."; const back = node("a", "mt-3 inline-block underline"); back.href = routeHash({ kind: "board" }, state.selectedPhase); back.textContent = "Return to board"; empty.append(document.createElement("br"), back); emptyDetail.replaceChildren(empty); } }
  async function fetchAndRender(showLoading = false) {
    const token = ++loadToken; const scrollY = window.scrollY; state = beginUiLoad(state);
    if (showLoading && !(state.selectedPhase === null ? landing : state.lastGoodData)) { if (state.selectedPhase === null) { board.className = ""; board.replaceChildren(renderPhaseSkeleton()); } else { crumbs.classList.toggle("hidden", false); crumbs.replaceChildren(renderPhaseBreadcrumb(state.selectedPhase, null)); board.replaceChildren(skeleton()); } }
    refresh.disabled = true;
    try {
      if (state.route.kind === "task" && state.selectedPhase === null) {
        const found = await getJson<{ task: TaskDetail }>(`/api/tasks/${encodeURIComponent(state.route.taskId)}`);
        if (token !== loadToken) return;
        const hash = routeHash(state.route, found.task.phase); history.replaceState(null, "", hash); state = setUiRoute(state, hash);
      }
      if (state.selectedPhase === null) { const data = await loadPhases(); if (token !== loadToken) return; landing = data; state = { ...state, loadState: "ready", error: null }; main.querySelector("[data-workflow-alert]")?.remove(); renderLanding(data); }
      else { const data = await loadPhase(state.selectedPhase); if (token !== loadToken) return; state = completeUiLoad(state, data); main.querySelector("[data-workflow-alert]")?.remove(); await renderRoute(); }
    } catch (error) {
      if (token !== loadToken) return;
      const message = error instanceof Error ? error.message : "Unable to load workflow data"; state = failUiLoad(state, message);
      const onLanding = state.selectedPhase === null; const good = onLanding ? landing : state.lastGoodData; const missing = message === PHASE_NOT_FOUND || message === "Task not found";
      const alert = node("div", "alert alert-error mb-4 p-4 text-sm"); alert.dataset.workflowAlert = "true"; alert.textContent = good ? `${message}. Showing last successful data.` : `${message}.`;
      if (missing) { const back = node("a", "btn btn-link btn-sm"); back.href = "#/"; back.textContent = "Back to all phases"; alert.append(back); } else { const retry = node("button", "btn btn-link btn-sm"); retry.textContent = "Retry"; retry.addEventListener("click", () => void fetchAndRender(true)); alert.append(retry); }
      main.querySelector("[data-workflow-alert]")?.remove();
      if (message === PHASE_NOT_FOUND && !onLanding && !good) { crumbs.classList.toggle("hidden", false); crumbs.replaceChildren(renderPhaseBreadcrumb(state.selectedPhase as string, null)); board.className = ""; board.replaceChildren(phaseNotFound(state.selectedPhase as string)); emptyDetail.classList.toggle("hidden", true); status.textContent = ""; theme.textContent = preferredTheme() === "dark" ? "Light theme" : "Dark theme"; return; }
      if (good) { if (typeof main.insertBefore === "function") main.insertBefore(alert, board); else main.append(alert); if (onLanding) renderLanding(landing as PhasesResponseDto); else renderBoard(); } else { board.replaceChildren(alert); emptyDetail.classList.toggle("hidden", true); }
      status.textContent = good ? status.textContent : message;
    } finally { if (token === loadToken) { refresh.disabled = false; window.scrollTo?.(0, scrollY); } }
  }
  const onHashChange = () => { const previous = state.selectedPhase; state = setUiRoute(state, location.hash); if (state.selectedPhase !== null && state.selectedPhase === previous && (state.data || state.lastGoodData)) { void renderRoute(); return; } state = { ...state, data: undefined, lastGoodData: undefined }; landing = undefined; void fetchAndRender(true); }; window.addEventListener("hashchange", onHashChange); refresh.addEventListener("click", () => void fetchAndRender(true)); board.replaceChildren(skeleton()); void fetchAndRender(); return { refresh: fetchAndRender }; }

export function mountSlidingBoard(root: HTMLElement) {
  mountBoard(root);
  const app = root.firstElementChild as HTMLElement | null;
  const drawer = root.querySelector<HTMLElement>("main > aside");
  if (!app || !drawer) return;
  const trigger = { element: undefined as HTMLElement | undefined };
  const close = node("button", "btn btn-ghost btn-sm btn-circle fixed right-4 top-4 z-50 hidden lg:left-[min(25rem,calc(40vw-3rem))] lg:right-auto");
  close.type = "button";
  close.setAttribute("aria-label", "Close task details");
  close.textContent = "×";
  const scrim = node("button", "pointer-events-none fixed inset-0 z-30 bg-black/40 opacity-0 transition-opacity duration-300 lg:hidden");
  scrim.type = "button";
  scrim.setAttribute("aria-label", "Close task details");
  scrim.setAttribute("tabindex", "-1");
  drawer.setAttribute("role", "dialog");
  const wide = typeof matchMedia === "function" ? matchMedia("(min-width: 1024px)") : null;
  const syncModal = () => { if (wide?.matches) drawer.removeAttribute("aria-modal"); else drawer.setAttribute("aria-modal", "true"); };
  syncModal();
  wide?.addEventListener?.("change", syncModal);
  drawer.setAttribute("aria-label", "Task details");
  drawer.tabIndex = -1;
  drawer.classList.remove("opacity-70");
  drawer.classList.add("fixed", "inset-y-0", "left-0", "z-40", "m-0", "w-[80vw]", "max-w-[calc(100vw-1rem)]", "overflow-y-auto", "bg-base-100", "opacity-100", "shadow-2xl", "transition-transform", "duration-300", "ease-out");
  drawer.classList.add("lg:w-[28rem]", "lg:max-w-[40vw]");
  const focusTrigger = () => { const id = trigger.element?.getAttribute?.("data-task-id"); const target = trigger.element?.isConnected === false && id ? Array.from(root.querySelectorAll<HTMLElement>("[data-task-id]")).find((item) => item.getAttribute("data-task-id") === id) : trigger.element; target?.focus?.(); trigger.element = undefined; };
  const setOpen = (open: boolean) => {
    drawer.classList.toggle("-translate-x-full", !open);
    drawer.classList.toggle("translate-x-0", open);
    app.classList.toggle("lg:pl-[min(28rem,40vw)]", open);
     drawer.setAttribute("aria-hidden", String(!open));
     if (open) drawer.removeAttribute("inert"); else drawer.setAttribute("inert", "");
     close.classList.toggle("hidden", !open);
     if (open) scrim.removeAttribute("inert"); else scrim.setAttribute("inert", "");
    scrim.classList.toggle("pointer-events-none", !open);
    scrim.classList.toggle("opacity-0", !open);
    scrim.classList.toggle("pointer-events-auto", open);
    scrim.classList.toggle("opacity-100", open);
    if (open) close.focus(); else focusTrigger();
  };
  const closeRoute = () => { const state = createUiState(location.hash); location.hash = routeHash({ kind: "board" }, state.selectedPhase); };
  close.addEventListener("click", closeRoute);
  scrim.addEventListener("click", closeRoute);
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeRoute(); } };
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && parseRoute().kind === "task" && !document.querySelector("dialog")) closeOnEscape(event); });
  close.addEventListener("keydown", closeOnEscape);
  drawer.addEventListener("keydown", closeOnEscape);
  app.append(scrim, close);
  root.addEventListener("focusin", (event) => { const item = (event.target as HTMLElement | null)?.closest?.("[data-task-id]") as HTMLElement | null | undefined; if (item) trigger.element = item; });
  const syncRoute = () => { const open = parseRoute().kind === "task"; setOpen(open); };
  window.addEventListener("hashchange", syncRoute);
  syncRoute();
}

if (typeof document !== "undefined") { const root = document.querySelector<HTMLElement>("#app"); if (root) mountSlidingBoard(root); }
