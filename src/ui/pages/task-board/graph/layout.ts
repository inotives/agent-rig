import { TaskSummaryDto } from "../../../core/contracts.js";
import { LANE_MARGIN, routeEdges } from "./edges.js";
import { externalDependencyCount } from "./external.js";

type TaskSummary = TaskSummaryDto;

export type TaskGraphNode = { task: TaskSummary; layer: number; row: number; x: number; y: number; width: number; height: number; compact: boolean; external: number };
export type TaskGraphEdge = { from: string; to: string };
export type TaskGraphLayout = { nodes: TaskGraphNode[]; edges: TaskGraphEdge[]; width: number; height: number; hasCycle: boolean };

export const FULL_NODE_HEIGHT = 100;
export const COMPACT_NODE_HEIGHT = 34;
const COMPACT_GAP_Y = 12;

type Adjacency = ReadonlyMap<string, readonly string[]>;

function indexOf(ids: readonly string[]) { return new Map(ids.map((id, index) => [id, index])); }

/** Count edge pairs that cross between the same two layers. Edges inside the same layer pair cross when their row order is inverted. */
function crossingsOf(columns: ReadonlyMap<number, string[]>, dependencies: Adjacency) {
  const position = new Map<string, { layer: number; index: number }>();
  for (const [layer, ids] of columns) ids.forEach((id, index) => position.set(id, { layer, index }));
  const edges: { from: number; to: number; fromLayer: number; toLayer: number }[] = [];
  for (const [id, deps] of dependencies) { const target = position.get(id); if (!target) continue; for (const dependency of deps) { const source = position.get(dependency); if (source) edges.push({ from: source.index, to: target.index, fromLayer: source.layer, toLayer: target.layer }); } }
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) for (let j = i + 1; j < edges.length; j += 1) {
    const a = edges[i]; const b = edges[j];
    if (a.fromLayer === b.fromLayer && a.toLayer === b.toLayer && (a.from - b.from) * (a.to - b.to) < 0) count += 1;
  }
  return count;
}

/** Barycenter sweeps (down, up, down, up). Ties use task ID. Keeps the best order found, starting from ID order. */
function orderByBarycenter(columns: Map<number, string[]>, dependencies: Adjacency, dependents: Adjacency) {
  const layers = [...columns.keys()].sort((a, b) => a - b);
  const snapshot = () => new Map([...columns].map(([layer, ids]) => [layer, [...ids]]));
  let best = snapshot(); let bestCrossings = crossingsOf(columns, dependencies);
  const sweep = (order: readonly number[], neighbours: Adjacency, fixedLayer: (layer: number) => number) => {
    for (const layer of order) {
      const reference = columns.get(fixedLayer(layer)); const ids = columns.get(layer);
      if (!reference || !ids) continue;
      const rank = indexOf(reference);
      const centre = (id: string) => { const ranks = (neighbours.get(id) ?? []).filter((other) => rank.has(other)).map((other) => rank.get(other)!); return ranks.length ? ranks.reduce((sum, value) => sum + value, 0) / ranks.length : null; };
      const current = indexOf(ids);
      const keys = new Map(ids.map((id) => [id, centre(id) ?? current.get(id)!]));
      ids.sort((a, b) => keys.get(a)! - keys.get(b)! || a.localeCompare(b));
    }
  };
  for (let pass = 0; pass < 4; pass += 1) {
    if (pass % 2 === 0) sweep(layers.slice(1), dependencies, (layer) => layers[layers.indexOf(layer) - 1]);
    else sweep(layers.slice(0, -1).reverse(), dependents, (layer) => layers[layers.indexOf(layer) + 1]);
    const crossings = crossingsOf(columns, dependencies);
    if (crossings < bestCrossings) { best = snapshot(); bestCrossings = crossings; }
  }
  for (const [layer, ids] of best) columns.set(layer, ids);
}

/** Count crossing edge pairs in a finished layout. Two edges cross when they share the same layer pair and their rows are inverted. */
export function countEdgeCrossings(layout: TaskGraphLayout) {
  const byId = new Map(layout.nodes.map((node) => [node.task.id, node]));
  const edges = layout.edges.map((edge) => ({ from: byId.get(edge.from)!, to: byId.get(edge.to)! })).filter((edge) => edge.from && edge.to);
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) for (let j = i + 1; j < edges.length; j += 1) {
    const a = edges[i]; const b = edges[j];
    if (a.from.layer === b.from.layer && a.to.layer === b.to.layer && (a.from.y - b.from.y) * (a.to.y - b.to.y) < 0) count += 1;
  }
  return count;
}

export type TaskLineage = { ancestors: string[]; descendants: string[]; edges: TaskGraphEdge[] };

/** Return all ancestors, all descendants, and the edges on those paths for one task. Unknown IDs give an empty result. */
export function computeLineage(layout: TaskGraphLayout, taskId: string): TaskLineage {
  if (!layout.nodes.some((node) => node.task.id === taskId)) return { ancestors: [], descendants: [], edges: [] };
  const walk = (next: (edge: TaskGraphEdge) => [string, string]) => {
    const found = new Set<string>(); const queue = [taskId];
    while (queue.length) { const current = queue.shift()!; for (const edge of layout.edges) { const [source, other] = next(edge); if (source === current && other !== taskId && !found.has(other)) { found.add(other); queue.push(other); } } }
    return found;
  };
  const ancestors = walk((edge) => [edge.to, edge.from]);
  const descendants = walk((edge) => [edge.from, edge.to]);
  const upstream = new Set([...ancestors, taskId]); const downstream = new Set([...descendants, taskId]);
  const edges = layout.edges.filter((edge) => (upstream.has(edge.from) && upstream.has(edge.to) && ancestors.has(edge.from)) || (downstream.has(edge.from) && downstream.has(edge.to) && descendants.has(edge.to)));
  return { ancestors: [...ancestors].sort(), descendants: [...descendants].sort(), edges: [...edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)) };
}

/** Deterministic left-to-right layout. Cyclic components are placed in a warning row. Tasks in `compactIds` get a compact node height. */
export function layoutTaskGraph(tasks: readonly TaskSummary[], compactIds: ReadonlySet<string> = new Set()): TaskGraphLayout {
  const ordered = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(ordered.map((task) => [task.id, task]));
  const loaded = new Set(byId.keys());
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
  const width = 220; const height = FULL_NODE_HEIGHT; const heightOf = (id: string) => (compactIds.has(id) ? COMPACT_NODE_HEIGHT : height); const gapBetween = (a: string, b: string) => (compactIds.has(a) && compactIds.has(b) ? COMPACT_GAP_Y : gapY); const gapX = 48; const gapY = 34; const rowGap = 34;
  const positions = new Map<string, { x: number; y: number; row: number }>();
  let maxWidth = width;
  let rowY = 18;
  let row = 0;
  for (const component of components.sort((a, b) => a[0].localeCompare(b[0]))) {
    const componentColumns = new Map<number, string[]>();
    for (const id of component) { const layer = layers.get(id) ?? 0; componentColumns.set(layer, [...(componentColumns.get(layer) ?? []), id]); }
    for (const ids of componentColumns.values()) ids.sort();
    orderByBarycenter(componentColumns, dependencies, dependents);
    let componentHeight = 0;
    for (const [layer, ids] of [...componentColumns.entries()].sort(([a], [b]) => a - b)) {
      let offset = 0;
      ids.forEach((id, index) => { if (index > 0) offset += gapBetween(ids[index - 1], id); positions.set(id, { x: layer * (width + gapX) + 18, y: rowY + offset, row }); offset += heightOf(id); });
      componentHeight = Math.max(componentHeight, offset);
    }
    maxWidth = Math.max(maxWidth, Math.max(0, ...[...componentColumns.keys()]) * (width + gapX) + width + 36);
    rowY += componentHeight + rowGap;
    row += 1;
  }
  if (hasCycle) { const cycleIds = [...remaining].sort(); const cycleRow = Math.max(1, row); cycleIds.forEach((id, index) => positions.set(id, { x: index * (width + gapX) + 18, y: rowY + 18, row: cycleRow })); maxWidth = Math.max(maxWidth, cycleIds.length * (width + gapX) + 36); rowY += height + rowGap; row = cycleRow + 1; }
  let nodes = ordered.map((task) => { const position = positions.get(task.id)!; return { task, layer: layers.get(task.id) ?? 0, row: position.row, x: position.x, y: position.y, width, height: heightOf(task.id), compact: compactIds.has(task.id), external: externalDependencyCount(task, loaded) }; });
  const edges = ordered.flatMap((task) => (dependencies.get(task.id) ?? []).map((from) => ({ from, to: task.id })));
  const maxY = Math.max(0, ...nodes.map((node) => node.y + node.height));
  let layoutHeight = Math.max(height, maxY + 18);
  // Make room for the lanes of long edges. Many lanes in the top or bottom channel need more space than the card margin.
  const { minY, maxY: laneMaxY } = routeEdges(nodes, edges);
  const extraTop = Number.isFinite(minY) ? Math.max(0, Math.ceil(LANE_MARGIN - minY)) : 0;
  // Lane y values are before the shift. The shift moves the lanes and the nodes by the same amount, so the room below the lanes does not change.
  const extraBottom = Number.isFinite(laneMaxY) ? Math.max(0, Math.ceil(laneMaxY + LANE_MARGIN - layoutHeight)) : 0;
  if (extraTop) nodes = nodes.map((node) => ({ ...node, y: node.y + extraTop }));
  layoutHeight += extraTop + extraBottom;
  return { nodes, edges, width: maxWidth, height: layoutHeight, hasCycle };
}
