import { HandoffDto, TaskDetailDto, TaskSummaryDto, WorkflowSummaryDto } from "../../core/contracts.js";

export const STATUS_COLUMNS = ["todo", "ready", "in_progress", "blocked", "review", "done"] as const;
export type StatusColumn = (typeof STATUS_COLUMNS)[number];
export type TaskSummary = TaskSummaryDto;
export type WorkflowSummary = WorkflowSummaryDto;
export type TaskDetail = TaskDetailDto;
export type Handoff = HandoffDto;
export type UiRoute = { kind: "board" } | { kind: "task"; taskId: string };
export type UiLoadState = "idle" | "loading" | "ready" | "error";
export type UiState = { route: UiRoute; selectedPhase: string; selectedTaskId: string | null; loadState: UiLoadState; error: string | null; data?: WorkflowSummary; lastGoodData?: WorkflowSummary; theme: "light" | "dark" };

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, normal: 3, low: 4 };
const THEME_KEY = "agent-rig-theme";
const UNASSIGNED_PHASE = "Unassigned";
const ALL_PHASES = "__all__";
const PHASE_QUERY_KEY = "phase";
const PHASE_PATTERN = /^phase-\d+$/;

export function sortTasks(tasks: readonly TaskSummary[]) { return [...tasks].sort((a, b) => { const priority = (PRIORITY_ORDER[a.priority.toLowerCase()] ?? 99) - (PRIORITY_ORDER[b.priority.toLowerCase()] ?? 99); return priority || Date.parse(b.updated_on) - Date.parse(a.updated_on) || a.id.localeCompare(b.id); }); }
export function filterTasks(tasks: readonly TaskSummary[], phase: string) { return phase === "__all__" ? [...tasks] : tasks.filter((task) => task.phase === phase); }
export function sortHandoffs(handoffs: readonly Handoff[]) { return [...handoffs].sort((a, b) => b.sequence - a.sequence); }
export function filterHandoffs(handoffs: readonly Handoff[], query: string) { const needle = query.trim().toLowerCase(); return handoffs.filter((item) => [item.sequence, item.sender, item.recipient, item.status, item.message, item.created_at, JSON.stringify(item.metadata)].some((value) => String(value ?? "").toLowerCase().includes(needle))); }
export function preferredTheme(): "light" | "dark" { const saved = localStorage.getItem(THEME_KEY); if (saved === "light" || saved === "dark") return saved; return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
export function applyTheme(theme: "light" | "dark") { setTheme(theme, true); }
export function parseRoute(hash = typeof location === "undefined" ? "#/" : location.hash): UiRoute {
  const match = hash.split("?", 1)[0].match(/^#\/tasks\/(.+)$/);
  if (!match) return { kind: "board" };
  try { return { kind: "task", taskId: decodeURIComponent(match[1]) }; } catch { return { kind: "board" }; }
}
function phaseFromHash(hash: string) {
  const query = hash.split("?", 2)[1];
  if (!query) return ALL_PHASES;
  const value = new URLSearchParams(query).get(PHASE_QUERY_KEY)?.trim() ?? "";
  return value === UNASSIGNED_PHASE || PHASE_PATTERN.test(value) ? value : ALL_PHASES;
}
export function routeHash(route: UiRoute, selectedPhase = ALL_PHASES) {
  const path = route.kind === "board" ? "#/" : `#/tasks/${encodeURIComponent(route.taskId)}`;
  return selectedPhase === ALL_PHASES ? path : `${path}?${PHASE_QUERY_KEY}=${encodeURIComponent(selectedPhase)}`;
}
export function createUiState(hash = typeof location === "undefined" ? "#/" : location.hash): UiState { const route = parseRoute(hash); return { route, selectedPhase: phaseFromHash(hash), selectedTaskId: route.kind === "task" ? route.taskId : null, loadState: "idle", error: null, theme: preferredTheme() }; }
export function setUiRoute(state: UiState, hash: string): UiState { const route = parseRoute(hash); const hasPhase = hash.includes("phase="); return { ...state, route, selectedPhase: hasPhase ? phaseFromHash(hash) : state.selectedPhase, selectedTaskId: route.kind === "task" ? route.taskId : null, error: null }; }
export function beginUiLoad(state: UiState): UiState { return { ...state, loadState: "loading", error: null }; }
export function completeUiLoad(state: UiState, data: WorkflowSummary): UiState { return { ...state, loadState: "ready", data, lastGoodData: data, error: null }; }
export function failUiLoad(state: UiState, error: string): UiState { return { ...state, loadState: "error", error, data: state.lastGoodData }; }
function setTheme(theme: "light" | "dark", persist: boolean) { document.documentElement.classList.toggle("dark", theme === "dark"); document.documentElement.dataset.theme = theme; if (persist) localStorage.setItem(THEME_KEY, theme); }
function node<K extends keyof HTMLElementTagNameMap>(tag: K, classes = "") { const element = document.createElement(tag); element.className = classes; return element; }
function text(value: unknown, fallback = "—") { return value === null || typeof value === "undefined" || value === "" ? fallback : String(value); }
function labelValue(label: string, value: unknown) { const wrapper = node("div", "min-w-0"); const name = node("dt", "text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"); name.textContent = label; const content = node("dd", "truncate text-xs text-slate-700 dark:text-slate-200"); content.textContent = text(value); wrapper.append(name, content); return wrapper; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }

export type TaskGraphNode = { task: TaskSummary; layer: number; row: number; x: number; y: number; width: number; height: number };
export type TaskGraphEdge = { from: string; to: string };
export type TaskGraphLayout = { nodes: TaskGraphNode[]; edges: TaskGraphEdge[]; width: number; height: number; hasCycle: boolean };
export type TaskPreviewRect = { left: number; top: number; width: number; height: number };
export type TaskPreviewPosition = { left: number; top: number };

export function positionTaskPreview(taskRect: TaskPreviewRect, wrapperRect: TaskPreviewRect, previewWidth: number, previewHeight: number, gap = 12): TaskPreviewPosition {
  const relativeLeft = taskRect.left - wrapperRect.left;
  const relativeTop = taskRect.top - wrapperRect.top;
  const wrapperWidth = Math.max(0, wrapperRect.width);
  const wrapperHeight = Math.max(0, wrapperRect.height);
  const maxLeft = Math.max(0, wrapperWidth - previewWidth);
  const maxTop = Math.max(0, wrapperHeight - previewHeight);
  const rightPosition = relativeLeft + taskRect.width + gap;
  const leftPosition = relativeLeft - previewWidth - gap;
  const left = rightPosition + previewWidth <= wrapperWidth ? rightPosition : leftPosition;
  return { left: Math.min(maxLeft, Math.max(0, left)), top: Math.min(maxTop, Math.max(0, relativeTop)) };
}

/** Deterministic left-to-right layout. Cyclic components are placed in a warning row. */
export function layoutTaskGraph(tasks: readonly TaskSummary[]): TaskGraphLayout {
  const ordered = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(ordered.map((task) => [task.id, task]));
  const dependencies = new Map(ordered.map((task) => [task.id, (task.depends_on ?? []).filter((id) => byId.has(id)).sort()]));
  const dependents = new Map(ordered.map((task) => [task.id, [] as string[]]));
  for (const [id, deps] of dependencies) for (const dependency of deps) dependents.get(dependency)?.push(id);
  for (const children of dependents.values()) children.sort();
  const remaining = new Set(ordered.map((task) => task.id));
  const layers = new Map<string, number>();
  while (remaining.size) {
    const ready = [...remaining].filter((id) => (dependencies.get(id) ?? []).every((dependency) => !remaining.has(dependency))).sort();
    if (!ready.length) break;
    for (const id of ready) { layers.set(id, Math.max(0, ...(dependencies.get(id) ?? []).map((dependency) => (layers.get(dependency) ?? 0) + 1))); remaining.delete(id); }
  }
  const hasCycle = remaining.size > 0;
  const components: string[][] = [];
  const unvisited = new Set(ordered.filter((task) => !remaining.has(task.id)).map((task) => task.id));
  while (unvisited.size) {
    const start = [...unvisited].sort()[0]; const component: string[] = []; const queue = [start]; unvisited.delete(start);
    while (queue.length) { const id = queue.shift()!; component.push(id); const neighbours = [...(dependencies.get(id) ?? []), ...(dependents.get(id) ?? [])].sort(); for (const neighbour of neighbours) if (unvisited.delete(neighbour)) queue.push(neighbour); }
    components.push(component.sort());
  }
  const columns = new Map<number, string[]>();
  for (const id of [...layers.keys()].sort()) { const layer = layers.get(id)!; columns.set(layer, [...(columns.get(layer) ?? []), id]); }
  for (const ids of columns.values()) ids.sort();
  const width = 220; const height = 86; const gapX = 48; const gapY = 34; const rowGap = 34;
  const positions = new Map<string, { x: number; y: number; row: number }>();
  let maxWidth = width;
  let rowY = 18;
  let row = 0;
  for (const component of components.sort((a, b) => a[0].localeCompare(b[0]))) {
    const componentColumns = new Map<number, string[]>();
    for (const id of component) { const layer = layers.get(id) ?? 0; componentColumns.set(layer, [...(componentColumns.get(layer) ?? []), id]); }
    for (const ids of componentColumns.values()) ids.sort();
    let componentHeight = height;
    for (const [layer, ids] of [...componentColumns.entries()].sort(([a], [b]) => a - b)) {
      ids.forEach((id, index) => positions.set(id, { x: layer * (width + gapX) + 18, y: rowY + index * (height + gapY), row }));
      componentHeight = Math.max(componentHeight, ids.length * height + Math.max(0, ids.length - 1) * gapY);
    }
    maxWidth = Math.max(maxWidth, Math.max(0, ...[...componentColumns.keys()]) * (width + gapX) + width + 36);
    rowY += componentHeight + rowGap;
    row += 1;
  }
  if (hasCycle) { const cycleIds = [...remaining].sort(); const cycleRow = Math.max(1, row); cycleIds.forEach((id, index) => positions.set(id, { x: index * (width + gapX) + 18, y: rowY + 18, row: cycleRow })); maxWidth = Math.max(maxWidth, cycleIds.length * (width + gapX) + 36); rowY += height + rowGap; row = cycleRow + 1; }
  const nodes = ordered.map((task) => { const position = positions.get(task.id)!; return { task, layer: layers.get(task.id) ?? 0, row: position.row, x: position.x, y: position.y, width, height }; });
  const edges = ordered.flatMap((task) => (dependencies.get(task.id) ?? []).map((from) => ({ from, to: task.id })));
  const maxY = Math.max(0, ...nodes.map((node) => node.y + node.height));
  return { nodes, edges, width: maxWidth, height: Math.max(height, maxY + 18), hasCycle };
}

const STATUS_RAILS: Record<string, string> = { todo: "#64748b", ready: "#3b82f6", in_progress: "#f59e0b", blocked: "#ef4444", review: "#8b5cf6", done: "#22c55e" };
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
function svg<K extends keyof SVGElementTagNameMap>(tag: K) { return document.createElementNS("http://www.w3.org/2000/svg", tag); }
function graphCanvas(tasks: readonly TaskSummary[], selectedTaskId: string | null, onSelect: (id: string) => void) {
  const layout = layoutTaskGraph(tasks); const wrapper = node("section", "card relative mt-5 bg-base-100 p-3 shadow-sm");
  const heading = node("div", "mb-2 flex items-center justify-between gap-2"); const title = node("h2", "text-lg font-bold"); title.textContent = "Task flow"; const hint = node("p", "text-xs text-slate-500 dark:text-slate-400"); hint.textContent = "Dependencies flow left to right. Cards are not draggable."; heading.append(title, hint); wrapper.append(heading);
  const controls = node("div", "join mb-2"); const fit = node("button", "btn btn-ghost btn-sm join-item"); fit.type = "button"; fit.textContent = "Fit to view"; fit.setAttribute("aria-label", "Fit task flow to view"); const zoomOut = node("button", "btn btn-ghost btn-sm join-item"); zoomOut.type = "button"; zoomOut.textContent = "−"; zoomOut.setAttribute("aria-label", "Zoom out task flow"); const zoomIn = node("button", "btn btn-ghost btn-sm join-item"); zoomIn.type = "button"; zoomIn.textContent = "+"; zoomIn.setAttribute("aria-label", "Zoom in task flow"); controls.append(fit, zoomOut, zoomIn); wrapper.append(controls);
  if (layout.hasCycle) { const warning = node("div", "alert alert-warning mb-2 py-2 text-xs"); warning.textContent = "Dependency cycle detected; cyclic tasks are shown in the fallback row."; wrapper.append(warning); }
  const preview = node("div", "card card-compact pointer-events-none absolute z-10 hidden w-72 max-w-xs overflow-hidden bg-base-100 text-xs shadow-xl"); preview.dataset.taskPreview = "true"; preview.setAttribute("role", "status"); wrapper.append(preview);
  const viewport = node("div", "overflow-x-auto"); const svgRoot = svg("svg"); svgRoot.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`); svgRoot.setAttribute("role", "group"); svgRoot.setAttribute("aria-label", "Task dependency flow"); svgRoot.classList.add("min-w-[48rem]");
  let zoom = 1; const setZoom = (next: number) => { zoom = Math.max(1, Math.min(2.5, next)); const viewWidth = layout.width / zoom; const viewHeight = layout.height / zoom; svgRoot.setAttribute("viewBox", `${(layout.width - viewWidth) / 2} ${(layout.height - viewHeight) / 2} ${viewWidth} ${viewHeight}`); }; fit.addEventListener("click", () => setZoom(1)); zoomOut.addEventListener("click", () => setZoom(zoom - 0.25)); zoomIn.addEventListener("click", () => setZoom(zoom + 0.25));
  const defs = svg("defs"); const marker = svg("marker"); marker.id = "task-flow-arrow"; marker.setAttribute("viewBox", "0 0 10 10"); marker.setAttribute("refX", "9"); marker.setAttribute("refY", "5"); marker.setAttribute("markerWidth", "6"); marker.setAttribute("markerHeight", "6"); marker.setAttribute("orient", "auto-start-reverse"); const arrow = svg("path"); arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z"); arrow.setAttribute("fill", "currentColor"); marker.append(arrow); defs.append(marker); svgRoot.append(defs);
  const byId = new Map(layout.nodes.map((item) => [item.task.id, item])); for (const edge of layout.edges) { const from = byId.get(edge.from)!; const to = byId.get(edge.to)!; const path = svg("path"); path.setAttribute("d", `M ${from.x + from.width} ${from.y + from.height / 2} C ${from.x + from.width + 24} ${from.y + from.height / 2}, ${to.x - 24} ${to.y + to.height / 2}, ${to.x} ${to.y + to.height / 2}`); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("opacity", "0.35"); path.setAttribute("marker-end", "url(#task-flow-arrow)"); svgRoot.append(path); }
  for (const item of layout.nodes) { const task = item.task; const group = svg("g"); group.setAttribute("tabindex", "0"); group.setAttribute("role", "button"); group.setAttribute("aria-label", `${task.id}: ${task.title}; status ${task.status}`); group.setAttribute("transform", `translate(${item.x},${item.y})`); if (selectedTaskId === task.id) group.classList.add("[&>rect]:stroke-blue-500"); const card = svg("rect"); card.setAttribute("width", String(item.width)); card.setAttribute("height", String(item.height)); card.setAttribute("rx", "10"); card.setAttribute("fill", "currentColor"); card.setAttribute("class", "text-white/95 dark:text-slate-800"); const rail = svg("rect"); rail.setAttribute("width", "7"); rail.setAttribute("height", String(item.height)); rail.setAttribute("rx", "4"); rail.setAttribute("fill", STATUS_RAILS[task.status] ?? STATUS_RAILS.todo); const id = svg("text"); id.setAttribute("x", "18"); id.setAttribute("y", "23"); id.setAttribute("fill", "currentColor"); id.setAttribute("class", "text-[11px] font-mono text-slate-500 dark:text-slate-300"); id.textContent = task.id; const label = svg("text"); label.setAttribute("x", "18"); label.setAttribute("y", "45"); label.setAttribute("fill", "currentColor"); label.setAttribute("class", "text-[13px] font-semibold text-slate-900 dark:text-white"); label.textContent = task.title.length > 25 ? `${task.title.slice(0, 24)}…` : task.title; const status = svg("text"); status.setAttribute("x", "18"); status.setAttribute("y", "68"); status.setAttribute("fill", "currentColor"); status.setAttribute("class", "text-[11px] text-slate-600 dark:text-slate-300"); status.textContent = task.status.replaceAll("_", " "); group.append(card, rail, id, label, status); const select = () => onSelect(task.id); const showPreview = () => { renderTaskPreview(preview, task); preview.classList.remove("hidden"); const position = positionTaskPreview(group.getBoundingClientRect(), wrapper.getBoundingClientRect(), preview.offsetWidth, preview.offsetHeight); preview.style.left = `${position.left}px`; preview.style.top = `${position.top}px`; }; const hidePreview = () => preview.classList.add("hidden"); group.addEventListener("click", select); group.addEventListener("mouseenter", showPreview); group.addEventListener("mouseleave", hidePreview); group.addEventListener("focus", showPreview); group.addEventListener("blur", hidePreview); group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } }); svgRoot.append(group); }
  viewport.append(svgRoot); wrapper.append(viewport); return wrapper;
}

function taskCard(task: TaskSummary) { const card = node("article", "card card-compact bg-base-100 shadow-sm"); const body = node("div", "card-body"); const heading = node("div", "flex items-start justify-between gap-2"); const title = node("h3", "card-title line-clamp-2 text-sm"); title.textContent = text(task.title); const id = node("a", "link link-primary shrink-0 font-mono text-[11px]"); id.href = `#/tasks/${encodeURIComponent(task.id)}`; id.textContent = task.id; heading.append(title, id); const details = node("dl", "mt-3 grid grid-cols-2 gap-x-3 gap-y-2"); details.append(labelValue("Priority", task.priority), labelValue("Assignee", task.assigned_to), labelValue("Phase", task.phase), labelValue("Handoffs", task.handoff_count), labelValue("Updated", formatDate(task.updated_on))); body.append(heading, details); card.append(body); return card; }
function column(status: StatusColumn, tasks: readonly TaskSummary[]) { const section = node("section", "card min-h-48 min-w-[18rem] flex-1 bg-base-200 p-3"); const header = node("div", "mb-3 flex items-center justify-between"); const heading = node("h2", "text-sm font-bold"); heading.textContent = status.replaceAll("_", " "); const count = node("span", `badge badge-${STATUS_TONES[status]} badge-sm`); count.textContent = String(tasks.length); header.append(heading, count); const cards = node("div", "space-y-2"); if (!tasks.length) { const empty = node("div", "alert alert-info py-3 text-xs"); empty.textContent = "No tasks"; cards.append(empty); } else for (const task of tasks) cards.append(taskCard(task)); section.append(header, cards); return section; }
function skeleton() { const element = node("div", "grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"); for (const status of STATUS_COLUMNS) { const block = node("div", "h-56 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"); block.setAttribute("aria-label", `Loading ${status} column`); element.append(block); } return element; }
async function getJson<T>(path: string): Promise<T> { const response = await fetch(path, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error(response.status === 404 ? "Task not found" : `Request failed (${response.status})`); return response.json() as Promise<T>; }
async function loadSummary() { return getJson<WorkflowSummary>("/api/workflow"); }

/** Escape first, then apply a small Markdown subset. Raw HTML is never interpreted. */
export function renderMarkdown(markdown: string): string { const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); const inline = (value: string) => value.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => /^(?:https?:\/\/|mailto:)/i.test(href) ? `<a href="${href}" rel="noreferrer">${label}</a>` : label); const lines = escape(markdown || "").split("\n"); const output: string[] = []; let list = false; let code = false; for (const line of lines) { if (line.trimStart().startsWith("```")) { code = !code; output.push(code ? "<pre><code>" : "</code></pre>"); continue; } if (code) { output.push(line); continue; } const heading = line.match(/^(#{1,3})\s+(.+)$/); const bullet = line.match(/^\s*[-*]\s+(.+)$/); if (!line.trim()) { if (list) { output.push("</ul>"); list = false; } continue; } if (bullet) { if (!list) { output.push("<ul>"); list = true; } output.push(`<li>${inline(bullet[1])}</li>`); continue; } if (list) { output.push("</ul>"); list = false; } if (heading) output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); else output.push(`<p>${inline(line)}</p>`); } if (list) output.push("</ul>"); if (code) output.push("</code></pre>"); return output.join(""); }
function badge(value: unknown, tone = "neutral") { const result = node("span", `badge badge-${tone} badge-sm`); result.textContent = text(value); return result; }
function statusLegend() { const legend = node("div", "mb-4 flex flex-wrap items-center gap-2 text-xs"); const label = node("span", "font-semibold"); label.textContent = "Status"; legend.append(label); for (const status of STATUS_COLUMNS) legend.append(badge(status.replaceAll("_", " "), STATUS_TONES[status])); return legend; }

export function openHandoffModal(handoff: Handoff, trigger: HTMLElement | undefined = typeof document !== "undefined" ? document.activeElement as HTMLElement : undefined) { const dialog = node("dialog", "modal"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", "handoff-dialog-title"); const card = node("div", "card modal-box bg-base-100 shadow-xl"); const top = node("div", "card-title flex items-start justify-between gap-3"); const title = node("h2", "text-lg"); title.setAttribute("id", "handoff-dialog-title"); title.textContent = `Handoff #${handoff.sequence}`; const close = node("button", "btn btn-ghost btn-sm btn-circle"); close.type = "button"; close.setAttribute("aria-label", "Close handoff details"); close.textContent = "×"; top.append(title, close); const details = node("dl", "mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"); details.append(labelValue("Timestamp", formatDate(handoff.created_at)), labelValue("Sender", handoff.sender), labelValue("Recipient", handoff.recipient), labelValue("Status", handoff.status)); const content = node("div", "prose prose-sm mt-4 max-w-none dark:prose-invert"); content.innerHTML = renderMarkdown(handoff.message); const metadata = document.createElement("details"); metadata.className = "collapse-arrow collapse mt-5 border border-base-300 bg-base-200"; const summary = document.createElement("summary"); summary.className = "collapse-title cursor-pointer text-sm font-medium"; summary.textContent = "Metadata JSON"; const json = node("pre", "collapse-content overflow-x-auto text-xs"); json.textContent = JSON.stringify(handoff.metadata ?? {}, null, 2); metadata.append(summary, json); card.append(top, details, content, metadata); dialog.append(card); document.body.append(dialog); let cleaned = false; const cleanup = () => { if (cleaned) return; cleaned = true; dialog.remove(); document.removeEventListener("keydown", escape); trigger?.focus?.(); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cleanup(); }; close.addEventListener("click", cleanup); dialog.addEventListener("cancel", (event) => { event.preventDefault(); cleanup(); }); dialog.addEventListener("close", cleanup); dialog.addEventListener("click", (event) => { if (event.target === dialog) cleanup(); }); document.addEventListener("keydown", escape); const nativeDialog = dialog as HTMLDialogElement; if (typeof nativeDialog.showModal === "function") nativeDialog.showModal(); else dialog.setAttribute("open", ""); close.focus?.(); }
function renderHandoffTimeline(handoffs: Handoff[]) {
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
  const rail = node("div", "absolute bottom-2 left-6 top-2 w-1 bg-base-300");
  const events = node("div", "relative space-y-1");
  timeline.append(rail, events);

  const renderEvents = () => {
    const filtered = sortHandoffs(filterHandoffs(handoffs, search.value));
    events.replaceChildren();
    if (!filtered.length) {
      const empty = node("p", "py-5 text-sm opacity-70");
      empty.textContent = handoffs.length ? "No handoffs match your search." : "No handoffs recorded for this task yet.";
      events.append(empty);
      return;
    }
    for (const item of filtered) {
      const event = node("article", "relative min-h-24 pb-5 last:pb-0");
      const detail = node("button", "btn btn-primary btn-circle btn-md absolute -left-14 top-0 z-10 border-4 border-base-100 bg-blue-500 text-white shadow-md hover:bg-blue-600");
      detail.type = "button";
      detail.textContent = String(item.sequence);
      detail.setAttribute("aria-label", "Open handoff " + item.sequence + " details");
      detail.addEventListener("click", () => openHandoffModal(item, detail));
      const status = node("p", "pt-1 text-sm font-semibold capitalize");
      status.textContent = item.status.replaceAll("_", " ") + " " + formatDate(item.created_at);
      const route = node("p", "mt-1 text-sm text-base-content/70");
      route.textContent = text(item.sender) + " → " + text(item.recipient);
      event.append(detail, status, route);
      events.append(event);
    }
  };
  search.addEventListener("input", renderEvents);
  renderEvents();
  body.append(heading, timeline);
  section.append(body);
  return section;
}

function renderTaskDetail(task: TaskDetail, handoffs: Handoff[], onBack: () => void) {
  const main = node("main", "mx-auto max-w-screen-xl px-4 py-5");
  const back = node("a", "mb-4 inline-flex text-sm text-primary hover:underline");
  back.href = "#/";
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
  const detailSplit = node("div", "mt-5 grid gap-5 lg:grid-cols-2 lg:items-start");
  detailSplit.append(markdown, handoffSection);
  main.append(back, heading, summary, detailSplit);
  return main;
}


export function mountBoard(root: HTMLElement) { let state = createUiState(); const app = node("div", "min-h-screen bg-base-200 text-base-content transition-colors"); const header = node("header", "navbar border-b border-base-300 bg-base-100"); const headerInner = node("div", "mx-auto flex w-full max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-4"); const brand = node("div"); const title = node("h1", "text-xl font-bold"); const subtitle = node("p", "text-sm italic opacity-70"); subtitle.textContent = "Read-only workflow visibility"; brand.append(title, subtitle); const controls = node("div", "flex items-center gap-2"); const phase = document.createElement("select"); phase.className = "select select-bordered select-sm"; phase.setAttribute("aria-label", "Filter by phase"); phase.addEventListener("change", () => { state = { ...state, selectedPhase: phase.value }; renderBoard(); }); const refresh = node("button", "btn btn-primary btn-sm"); refresh.type = "button"; refresh.textContent = "Refresh"; const theme = node("button", "btn btn-ghost btn-sm"); theme.type = "button"; theme.addEventListener("click", () => applyTheme(preferredTheme() === "dark" ? "light" : "dark")); controls.append(phase, refresh, theme); headerInner.append(brand, controls); header.append(headerInner); const main = node("main", "mx-auto max-w-screen-2xl px-4 py-5"); const status = node("p", "mb-2 text-sm opacity-70"); const legend = statusLegend(); const board = node("div", "grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"); const emptyDetail = node("aside", "card mt-5 bg-base-100 p-5 text-sm opacity-70"); emptyDetail.textContent = "Select a task to view its details."; main.append(status, legend, board, emptyDetail); app.append(header, main); root.replaceChildren(app); setTheme(state.theme, false);
  function renderBoard() { const current = state.data ?? state.lastGoodData; if (!current) return; title.textContent = `AgentRig: ${current.project_identifier}`; const phases = [...new Set([...current.phases, UNASSIGNED_PHASE])].sort((a, b) => a.localeCompare(b)); phase.replaceChildren(new Option("All phases", "__all__")); for (const value of phases) phase.append(new Option(value, value)); phase.value = phases.includes(state.selectedPhase) ? state.selectedPhase : "__all__"; state = { ...state, selectedPhase: phase.value }; const filtered = filterTasks(current.tasks, state.selectedPhase); if (typeof document.createElementNS === "function") { board.className = "overflow-x-auto"; board.replaceChildren(graphCanvas(sortTasks(filtered), state.selectedTaskId, (id) => { location.hash = routeHash({ kind: "task", taskId: id }, state.selectedPhase); })); } else { board.className = "grid grid-cols-1 gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"; const grouped = new Map<string, TaskSummary[]>(); for (const task of filtered) grouped.set(task.status, [...(grouped.get(task.status) ?? []), task]); board.replaceChildren(...STATUS_COLUMNS.map((name) => column(name, sortTasks(grouped.get(name) ?? [])))); } status.textContent = `${filtered.length} task${filtered.length === 1 ? "" : "s"}${state.selectedPhase === "__all__" ? "" : ` in ${state.selectedPhase}`}`; theme.textContent = preferredTheme() === "dark" ? "Light theme" : "Dark theme"; }
  async function renderRoute() { const id = state.selectedTaskId; main.replaceChildren(status, legend, board, emptyDetail); if (!id) { if (state.data || state.lastGoodData) renderBoard(); else board.replaceChildren(skeleton()); return; } renderBoard(); emptyDetail.replaceChildren(skeleton()); try { const [taskResponse, handoffResponse] = await Promise.all([getJson<{ task: TaskDetail }>(`/api/tasks/${encodeURIComponent(id)}`), getJson<{ handoffs: Handoff[] }>(`/api/tasks/${encodeURIComponent(id)}/handoffs`)]); const detail = renderTaskDetail(taskResponse.task, handoffResponse.handoffs, () => history.back()); const taskMetadata = document.createElement("details"); taskMetadata.className = "mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-800"; const taskMetadataSummary = document.createElement("summary"); taskMetadataSummary.className = "cursor-pointer font-medium"; taskMetadataSummary.textContent = "Task metadata"; const taskMetadataJson = node("pre", "mt-3 overflow-x-auto text-xs"); taskMetadataJson.textContent = JSON.stringify(taskResponse.task.metadata ?? {}, null, 2); taskMetadata.append(taskMetadataSummary, taskMetadataJson); detail.append(taskMetadata); emptyDetail.replaceChildren(detail); } catch (error) { const empty = node("div", "rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"); empty.textContent = error instanceof Error && error.message === "Task not found" ? "Task not found." : error instanceof Error ? error.message : "Unable to load task."; const back = node("a", "mt-3 inline-block underline"); back.href = "#/"; back.textContent = "Return to board"; empty.append(document.createElement("br"), back); emptyDetail.replaceChildren(empty); } }
  async function fetchAndRender(showLoading = false) { const scrollY = window.scrollY; state = beginUiLoad(state); if (showLoading && !state.lastGoodData) board.replaceChildren(skeleton()); refresh.disabled = true; try { state = completeUiLoad(state, await loadSummary()); main.querySelector("[data-workflow-alert]")?.remove(); if (state.route.kind === "board") renderBoard(); else await renderRoute(); } catch (error) { const message = error instanceof Error ? error.message : "Unable to load workflow data"; state = failUiLoad(state, message); const alert = node("div", "alert alert-error mb-4 p-4 text-sm"); alert.dataset.workflowAlert = "true"; alert.textContent = state.lastGoodData ? `${message}. Showing last successful data.` : `${message}.`; const retry = node("button", "btn btn-link btn-sm"); retry.textContent = "Retry"; retry.addEventListener("click", () => void fetchAndRender(true)); main.querySelector("[data-workflow-alert]")?.remove(); if (state.lastGoodData) { if (typeof main.insertBefore === "function") main.insertBefore(alert, board); else main.append(alert); renderBoard(); } else board.replaceChildren(alert); status.textContent = state.lastGoodData ? status.textContent : message; } finally { refresh.disabled = false; window.scrollTo?.(0, scrollY); } }
  phase.addEventListener("change", () => { location.hash = routeHash(state.route, phase.value); });
  const onHashChange = () => { state = setUiRoute(state, location.hash); void (state.data || state.lastGoodData ? renderRoute() : fetchAndRender()); }; window.addEventListener("hashchange", onHashChange); refresh.addEventListener("click", () => void fetchAndRender(true)); board.replaceChildren(skeleton()); void fetchAndRender(); return { refresh: fetchAndRender }; }

export function mountSlidingBoard(root: HTMLElement) {
  mountBoard(root);
  const app = root.firstElementChild as HTMLElement | null;
  const drawer = root.querySelector<HTMLElement>("main > aside");
  if (!app || !drawer) return;
  const trigger = { element: undefined as HTMLElement | undefined };
  const close = node("button", "btn btn-ghost btn-sm btn-circle fixed right-4 top-4 z-50 hidden");
  close.type = "button";
  close.setAttribute("aria-label", "Close task details");
  close.textContent = "×";
  const scrim = node("button", "pointer-events-none fixed inset-0 z-30 bg-black/40 opacity-0 transition-opacity duration-300");
  scrim.type = "button";
  scrim.setAttribute("aria-label", "Close task details");
  scrim.setAttribute("tabindex", "-1");
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-label", "Task details");
  drawer.tabIndex = -1;
  drawer.classList.remove("opacity-70");
  drawer.classList.add("fixed", "inset-y-0", "left-0", "z-40", "m-0", "w-[80vw]", "max-w-[calc(100vw-1rem)]", "overflow-y-auto", "bg-base-100", "opacity-100", "shadow-2xl", "transition-transform", "duration-300", "ease-out");
  const setOpen = (open: boolean) => {
    drawer.classList.toggle("-translate-x-full", !open);
    drawer.classList.toggle("translate-x-0", open);
     drawer.setAttribute("aria-hidden", String(!open));
     if (open) drawer.removeAttribute("inert"); else drawer.setAttribute("inert", "");
     close.classList.toggle("hidden", !open);
     if (open) scrim.removeAttribute("inert"); else scrim.setAttribute("inert", "");
    scrim.classList.toggle("pointer-events-none", !open);
    scrim.classList.toggle("opacity-0", !open);
    scrim.classList.toggle("pointer-events-auto", open);
    scrim.classList.toggle("opacity-100", open);
    if (open) close.focus(); else trigger.element?.focus?.();
  };
  const closeRoute = () => { const state = createUiState(location.hash); location.hash = routeHash({ kind: "board" }, state.selectedPhase); };
  close.addEventListener("click", closeRoute);
  scrim.addEventListener("click", closeRoute);
  const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); closeRoute(); } };
  close.addEventListener("keydown", closeOnEscape);
  drawer.addEventListener("keydown", closeOnEscape);
  app.append(scrim, close);
  const syncRoute = () => { const open = parseRoute().kind === "task"; if (open) trigger.element = document.activeElement as HTMLElement; setOpen(open); };
  window.addEventListener("hashchange", syncRoute);
  syncRoute();
}

if (typeof document !== "undefined") { const root = document.querySelector<HTMLElement>("#app"); if (root) mountSlidingBoard(root); }
