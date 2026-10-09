import { computeLineage, TaskGraphLayout } from "./layout.js";

/** The task whose lineage is shown, plus every task and edge on its paths. */
export type GraphFocus = { taskId: string; nodes: ReadonlySet<string>; edges: ReadonlySet<string> };

export function edgeKey(from: string, to: string) { return `${from}>${to}`; }

/** Selection wins. Hover shows focus only when nothing is selected. */
export function focusTarget(selectedId: string | null, hoveredId: string | null) { return selectedId ?? hoveredId ?? null; }

/** Return the focus for one task, or null when there is no task or the task is not in the graph. */
export function computeGraphFocus(layout: TaskGraphLayout, taskId: string | null): GraphFocus | null {
  if (!taskId || !layout.nodes.some((item) => item.task.id === taskId)) return null;
  const lineage = computeLineage(layout, taskId);
  return { taskId, nodes: new Set([taskId, ...lineage.ancestors, ...lineage.descendants]), edges: new Set(lineage.edges.map((edge) => edgeKey(edge.from, edge.to))) };
}

/** One arrow marker per state. render.ts defines both. */
export const ARROW_ID = "task-flow-arrow";
export const ARROW_FOCUS_ID = "task-flow-arrow-focus";
export const edgeMarker = (state: GraphItemState) => `url(#${state === "focus" ? ARROW_FOCUS_ID : ARROW_ID})`;

export type GraphItemState = "focus" | "dim" | "none";
export function nodeFocusState(focus: GraphFocus | null, id: string): GraphItemState { return !focus ? "none" : focus.nodes.has(id) ? "focus" : "dim"; }
export function edgeFocusState(focus: GraphFocus | null, from: string, to: string): GraphItemState { return !focus ? "none" : focus.edges.has(edgeKey(from, to)) ? "focus" : "dim"; }

/** Full class names must stay literal so Tailwind can find them. Dimmed items stay readable and clickable. */
const NODE_DIM = "opacity-50";
const EDGE_DIM = "opacity-20";
const EDGE_BASE = "stroke-base-content/30";
const EDGE_FOCUS = "stroke-primary";
const CARD_BASE = "stroke-base-300";
const CARD_FOCUS = "stroke-primary";

function walk(element: Element, visit: (item: Element) => void) { for (const child of Array.from(element.children)) { visit(child); walk(child, visit); } }

/** Filter dimming. Lineage focus wins: the filter shows only when there is no focus. */
const filterNodeState = (matched: ReadonlySet<string> | null, id: string): GraphItemState => (matched && !matched.has(id) ? "dim" : "none");
const filterEdgeState = (matched: ReadonlySet<string> | null, from: string, to: string): GraphItemState => (matched && !(matched.has(from) && matched.has(to)) ? "dim" : "none");

/** Change only classes and one attribute on existing elements. The SVG is not rebuilt. `matched` is the set of task IDs that pass the filter, or null for no filter. */
export function applyGraphFocus(root: Element, focus: GraphFocus | null, matched: ReadonlySet<string> | null = null) {
  walk(root, (item) => {
    const id = item.getAttribute("data-task-id");
    if (id) {
      const state = focus ? nodeFocusState(focus, id) : filterNodeState(matched, id);
      item.classList.remove(NODE_DIM); if (state === "dim") item.classList.add(NODE_DIM);
      if (focus) item.setAttribute("data-lineage", state === "focus" ? (id === focus.taskId ? "self" : "path") : "dim"); else item.removeAttribute("data-lineage");
      for (const child of Array.from(item.children)) if (child.getAttribute("data-node-card")) { child.classList.remove(CARD_BASE, CARD_FOCUS); child.classList.add(state === "focus" ? CARD_FOCUS : CARD_BASE); }
      return;
    }
    const from = item.getAttribute("data-edge-from"); const to = item.getAttribute("data-edge-to");
    if (from && to) {
      const state = focus ? edgeFocusState(focus, from, to) : filterEdgeState(matched, from, to);
      item.classList.remove(EDGE_DIM, EDGE_BASE, EDGE_FOCUS); item.classList.add(state === "focus" ? EDGE_FOCUS : EDGE_BASE); if (state === "dim") item.classList.add(EDGE_DIM);
      item.setAttribute("stroke-width", state === "focus" ? "2.5" : "1.25"); item.setAttribute("marker-end", edgeMarker(state));
    }
  });
}
