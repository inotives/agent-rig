import { TaskSummaryDto } from "../../../core/contracts.js";
import { computeEdgePaths } from "./edges.js";
import { externalDependencyLabel, externalMarkerText } from "./external.js";
import { ARROW_FOCUS_ID, ARROW_ID, edgeMarker } from "./focus.js";
import { TaskGraphLayout, TaskGraphNode } from "./layout.js";

type TaskSummary = TaskSummaryDto;

const SVG_NS = "http://www.w3.org/2000/svg";
const TITLE_LINE_LENGTH = 26;

/** Full class names must stay literal so Tailwind can find them. */
const STATUS_ORDER = ["todo", "ready", "in_progress", "blocked", "review", "done"] as const;
const STATUS_CLASSES: Record<string, { rail: string; badge: string; badgeText: string; legend: string }> = {
  todo: { rail: "fill-neutral", badge: "fill-neutral", badgeText: "fill-neutral-content", legend: "badge badge-neutral badge-sm" },
  ready: { rail: "fill-info", badge: "fill-info", badgeText: "fill-info-content", legend: "badge badge-info badge-sm" },
  in_progress: { rail: "fill-warning", badge: "fill-warning", badgeText: "fill-warning-content", legend: "badge badge-warning badge-sm" },
  blocked: { rail: "fill-error", badge: "fill-error", badgeText: "fill-error-content", legend: "badge badge-error badge-sm" },
  review: { rail: "fill-secondary", badge: "fill-secondary", badgeText: "fill-secondary-content", legend: "badge badge-secondary badge-sm" },
  done: { rail: "fill-success", badge: "fill-success", badgeText: "fill-success-content", legend: "badge badge-success badge-sm" }
};
const PRIORITY_DOT_CLASSES: Record<string, string> = { critical: "fill-error", high: "fill-warning", medium: "fill-info", normal: "fill-base-content/40", low: "fill-base-content/20" };

export function graphStatusClasses(status: string) { return STATUS_CLASSES[status] ?? STATUS_CLASSES.todo; }
export function graphStatusLegend() { return STATUS_ORDER.map((status) => ({ status, label: status.replaceAll("_", " "), className: STATUS_CLASSES[status].legend })); }

/** Wrap a title to at most two lines. Add an ellipsis only when text is cut. */
export function wrapGraphTitle(title: string, lineLength = TITLE_LINE_LENGTH) {
  const lines: string[] = [];
  let current = "";
  for (const word of title.trim().split(/\s+/).filter(Boolean)) {
    if (current && `${current} ${word}`.length <= lineLength) { current = `${current} ${word}`; continue; }
    if (current) lines.push(current);
    let rest = word;
    while (rest.length > lineLength) { lines.push(rest.slice(0, lineLength)); rest = rest.slice(lineLength); }
    current = rest;
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines.length ? lines : [""];
  return [lines[0], `${lines[1].slice(0, lineLength - 1)}…`];
}

export function graphNodeText(task: TaskSummary) {
  return { id: task.id, title: wrapGraphTitle(task.title ?? ""), status: task.status.replaceAll("_", " "), agent: task.assigned_to || "unassigned", priority: task.priority, handoffs: String(task.handoff_count ?? 0) };
}

export function graphNodeAriaLabel(task: TaskSummary, external = 0) {
  const count = task.handoff_count ?? 0;
  return `${task.id}: ${task.title}; status ${task.status}; agent ${task.assigned_to || "unassigned"}; priority ${task.priority}; ${count} handoff${count === 1 ? "" : "s"}${external > 0 ? `; ${externalDependencyLabel(external)}` : ""}`;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string> = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}
function svgText(content: string, attributes: Record<string, string>) { const element = svg("text", attributes); element.textContent = content; return element; }

function renderEdges(layout: TaskGraphLayout) {
  const group = svg("g", { "data-graph-edges": "true" });
  for (const edge of computeEdgePaths(layout)) group.append(svg("path", { d: edge.d, fill: "none", "stroke-width": "1.25", class: "stroke-base-content/30", "marker-end": edgeMarker("none"), "data-edge-from": edge.from, "data-edge-to": edge.to }));
  return group;
}

export type GraphNodeHandlers = { onSelect: (id: string) => void; onPreview: (element: Element, task: TaskSummary) => void; onPreviewEnd: () => void };

function nodeGroup(item: TaskGraphNode, selected: boolean) {
  const group = svg("g", { tabindex: "0", role: "button", "aria-label": graphNodeAriaLabel(item.task, item.external), transform: `translate(${item.x},${item.y})`, class: "cursor-pointer outline-none", "data-task-id": item.task.id });
  if (selected) group.setAttribute("aria-current", "true");
  return group;
}
/** Small "N external" pill for a task that depends on tasks of other phases. `right` is the x of its right edge and `y` is the text baseline. */
function externalMarker(count: number, right: number, y: number) {
  const label = externalMarkerText(count); const width = Math.round(label.length * 5.6 + 12);
  const group = svg("g", { role: "img", "aria-label": externalDependencyLabel(count), "data-external-marker": "true" });
  const title = svg("title"); title.textContent = externalDependencyLabel(count);
  const pill = svg("rect", { x: String(right - width), y: String(y - 11), width: String(width), height: "15", rx: "7.5", class: "fill-base-200 stroke-base-300", "stroke-width": "1" });
  group.append(title, pill, svgText(label, { x: String(right - width / 2), y: String(y), "text-anchor": "middle", class: "fill-base-content/70 text-[10px] font-medium" }));
  return group;
}
function selectedRing(item: TaskGraphNode) { return svg("rect", { x: "-3", y: "-3", width: String(item.width + 6), height: String(item.height + 6), rx: "11", fill: "none", "stroke-width": "2", class: "stroke-primary", "data-selected-ring": "true" }); }
function wireNode(group: Element, task: TaskSummary, handlers: GraphNodeHandlers) {
  const select = () => handlers.onSelect(task.id); const show = () => handlers.onPreview(group, task);
  group.addEventListener("click", select);
  group.addEventListener("mouseenter", show); group.addEventListener("mouseleave", handlers.onPreviewEnd);
  group.addEventListener("focus", show); group.addEventListener("blur", handlers.onPreviewEnd);
  group.addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter" || (event as KeyboardEvent).key === " ") { event.preventDefault(); select(); } });
}

/** Compact node for a done task: status rail, task ID, and a small done mark. */
function renderCompactNode(item: TaskGraphNode, selected: boolean, handlers: GraphNodeHandlers) {
  const task = item.task; const classes = graphStatusClasses(task.status);
  const group = nodeGroup(item, selected);
  const card = svg("rect", { width: String(item.width), height: String(item.height), rx: "8", class: "fill-base-100 stroke-base-300", "stroke-width": "1", "data-node-card": "true" });
  const rail = svg("rect", { x: "0", y: "0", width: "6", height: String(item.height), rx: "3", class: classes.rail });
  const id = svgText(task.id, { x: "16", y: String(item.height / 2 + 4), class: "fill-base-content/60 font-mono text-[11px]" });
  const markY = item.height / 2;
  const mark = svg("circle", { cx: String(item.width - 16), cy: String(markY), r: "7", class: classes.badge, "data-done-mark": "true" });
  const tick = svg("path", { d: `M ${item.width - 19.5} ${markY} l 2.5 2.5 l 4.5 -5`, fill: "none", "stroke-width": "1.75", "stroke-linecap": "round", "stroke-linejoin": "round", class: "stroke-success-content" });
  group.append(...(selected ? [selectedRing(item)] : []), card, rail, id, mark, tick, ...(item.external > 0 ? [externalMarker(item.external, item.width - 30, item.height / 2 + 4)] : []));
  wireNode(group, task, handlers);
  return group;
}

function renderNode(item: TaskGraphNode, selected: boolean, handlers: GraphNodeHandlers) {
  if (item.compact) return renderCompactNode(item, selected, handlers);
  const task = item.task; const text = graphNodeText(task); const classes = graphStatusClasses(task.status);
  const group = nodeGroup(item, selected);
  const card = svg("rect", { width: String(item.width), height: String(item.height), rx: "8", class: "fill-base-100 stroke-base-300", "stroke-width": "1", "data-node-card": "true" });
  const ring = selected ? selectedRing(item) : null;
  const rail = svg("rect", { x: "0", y: "0", width: "6", height: String(item.height), rx: "3", class: classes.rail });
  const dotTitle = svg("title"); dotTitle.textContent = `${task.priority} priority`;
  const dot = svg("circle", { cx: String(item.width - 14), cy: "18", r: "4", class: PRIORITY_DOT_CLASSES[task.priority] ?? PRIORITY_DOT_CLASSES.normal }); dot.append(dotTitle);
  const id = svgText(text.id, { x: "16", y: "21", class: "fill-base-content/60 font-mono text-[11px]" });
  const title = svg("text", { x: "16", y: "42", class: "fill-base-content text-[12px] font-semibold" });
  text.title.forEach((line, index) => { const span = svg("tspan", { x: "16", dy: index === 0 ? "0" : "14" }); span.textContent = line; title.append(span); });
  const badgeWidth = Math.max(44, text.status.length * 6.2 + 14); const bottom = item.height - 18;
  const badge = svg("rect", { x: "16", y: String(bottom - 11), width: String(badgeWidth), height: "16", rx: "8", class: classes.badge });
  const badgeText = svgText(text.status, { x: String(16 + badgeWidth / 2), y: String(bottom + 1), "text-anchor": "middle", class: `${classes.badgeText} text-[10px] font-medium` });
  const agent = svgText(text.agent, { x: String(16 + badgeWidth + 8), y: String(bottom + 1), class: "fill-base-content/70 text-[11px]" });
  const handoffs = svgText(`⇄ ${text.handoffs}`, { x: String(item.width - 10), y: String(bottom + 1), "text-anchor": "end", class: "fill-base-content/60 text-[11px]" });
  const handoffsTitle = svg("title"); handoffsTitle.textContent = `${text.handoffs} handoffs`; handoffs.append(handoffsTitle);
  group.append(...(ring ? [ring] : []), card, rail, dot, id, title, badge, badgeText, agent, handoffs, ...(item.external > 0 ? [externalMarker(item.external, item.width - 28, 21)] : []));
  wireNode(group, task, handlers);
  return group;
}

/** Build the graph SVG. Edges are drawn before nodes so cards sit on top. */
export function renderGraphSvg(layout: TaskGraphLayout, selectedTaskId: string | null, handlers: GraphNodeHandlers) {
  const root = svg("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, role: "group", "aria-label": "Task dependency flow" });
  root.classList.add("block", "h-full", "w-full");
  const defs = svg("defs");
  for (const [id, fill] of [[ARROW_ID, "fill-base-content/40"], [ARROW_FOCUS_ID, "fill-primary"]]) {
    const marker = svg("marker", { id, viewBox: "0 0 10 10", refX: "10", refY: "5", markerWidth: "6", markerHeight: "6", orient: "auto" });
    marker.append(svg("path", { d: "M 0 0 L 10 5 L 0 10 z", class: fill })); defs.append(marker);
  }
  root.append(defs, renderEdges(layout));
  for (const item of layout.nodes) root.append(renderNode(item, selectedTaskId === item.task.id, handlers));
  return root;
}

/** Status legend. Each badge is a button that toggles one status in the filter. Full class names stay literal for Tailwind. */
const LEGEND_ON = ["ring-2", "ring-primary", "ring-offset-1", "ring-offset-base-100"];
const LEGEND_MUTED = "opacity-50";
export function renderGraphLegend(onToggle: (status: string) => void = () => {}) {
  const legend = document.createElement("ul"); legend.className = "flex flex-wrap items-center gap-2 text-xs"; legend.setAttribute("aria-label", "Status legend. Press a status to filter by it."); legend.dataset.graphLegend = "true";
  for (const item of graphStatusLegend()) {
    const entry = document.createElement("li"); const button = document.createElement("button");
    button.type = "button"; button.className = `${item.className} cursor-pointer`; button.textContent = item.label; button.dataset.status = item.status; button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => onToggle(item.status)); entry.append(button); legend.append(entry);
  }
  return legend;
}

/** Show which statuses are on. Pressed badges get a ring. Other badges fade while any status is on. */
export function syncGraphLegend(legend: Element, statuses: ReadonlySet<string>) {
  for (const button of Array.from(legend.querySelectorAll("button[data-status]"))) {
    const on = statuses.has(button.getAttribute("data-status") ?? "");
    button.setAttribute("aria-pressed", String(on));
    button.classList.remove(...LEGEND_ON, LEGEND_MUTED);
    if (on) button.classList.add(...LEGEND_ON); else if (statuses.size > 0) button.classList.add(LEGEND_MUTED);
  }
}
