import type { TaskGraphEdge, TaskGraphLayout, TaskGraphNode } from "./layout.js";

export type TaskEdgePath = { from: string; to: string; d: string };

const ARROW_GAP = 3; // the arrow tip stops before the card border
const LANE_OFFSET = 4; // distance between parallel long edges
const CORNER = 10;
const END_MARGIN = 24; // the first and last vertical run stay this far from the cards (before the lane offset)
const MAX_SHIFT = 18; // largest horizontal lane offset, so that the lane stays in the gap next to the card
const OUTER_EXTRA = 4; // lanes in an outer channel never go more than this far into the card side
const GAP_MARGIN = 2; // free space kept at each side of a lane block inside a gap between cards
/** Free space that the layout keeps between a lane and the layout border. */
export const LANE_MARGIN = 4;
const CHANNEL_OFFSET = 9; // distance between the outer lane channel and the nearest card
const PLAIN_LANES = 3; // up to this many lanes in one channel keep the plain layout: ID order, 4px steps

type Point = { x: number; y: number };

function adjacentPath(start: Point, end: Point) {
  const bend = Math.max(24, Math.min(80, Math.abs(end.x - start.x) / 2));
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

/** Polyline with rounded corners. Zero-length segments are dropped. */
function roundedPath(points: Point[]) {
  const pts = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const prev = pts[i - 1]; const point = pts[i]; const next = pts[i + 1];
    const inLength = Math.hypot(point.x - prev.x, point.y - prev.y); const outLength = Math.hypot(next.x - point.x, next.y - point.y);
    const r = Math.min(CORNER, inLength / 2, outLength / 2);
    const a = { x: point.x - ((point.x - prev.x) / inLength) * r, y: point.y - ((point.y - prev.y) / inLength) * r };
    const b = { x: point.x + ((next.x - point.x) / outLength) * r, y: point.y + ((next.y - point.y) / outLength) * r };
    d += ` L ${a.x} ${a.y} Q ${point.x} ${point.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

type Lane = { from: string; to: string };
type Routed = { points: Point[] };
export type EdgeRouting = { paths: Map<string, Point[]>; minY: number; maxY: number };

const edgeKey = (from: string, to: string) => `${from}>${to}`;
const startOf = (node: TaskGraphNode): Point => ({ x: node.x + node.width, y: node.y + node.height / 2 });
const endOf = (node: TaskGraphNode): Point => ({ x: node.x - ARROW_GAP, y: node.y + node.height / 2 });

type Channel = { y: number; kind: "top" | "bottom" | "gap" | "free"; space: number };

/** Count crossings between the lane polylines. Lanes are made of horizontal and vertical runs. */
function crossingsOf(routes: Routed[]) {
  const runs = routes.map(({ points }) => {
    const horizontal: { y: number; a: number; b: number }[] = []; const vertical: { x: number; a: number; b: number }[] = [];
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i - 1]; const q = points[i];
      if (p.y === q.y && p.x !== q.x) horizontal.push({ y: p.y, a: Math.min(p.x, q.x), b: Math.max(p.x, q.x) });
      else if (p.x === q.x && p.y !== q.y) vertical.push({ x: p.x, a: Math.min(p.y, q.y), b: Math.max(p.y, q.y) });
    }
    return { horizontal, vertical };
  });
  let count = 0;
  for (let i = 0; i < runs.length; i += 1) for (let j = i + 1; j < runs.length; j += 1) {
    for (const h of runs[i].horizontal) for (const v of runs[j].vertical) if (h.a < v.x && v.x < h.b && v.a < h.y && h.y < v.b) count += 1;
    for (const h of runs[j].horizontal) for (const v of runs[i].vertical) if (h.a < v.x && v.x < h.b && v.a < h.y && h.y < v.b) count += 1;
  }
  return count;
}

/** Points of one long edge in lane `index` of `count` lanes in a channel. */
function lanePoints(from: TaskGraphNode, to: TaskGraphNode, channel: Channel, index: number, count: number): Point[] {
  const start = startOf(from); const end = endOf(to);
  const centred = index - (count - 1) / 2;
  const stepY = count > PLAIN_LANES && channel.kind === "gap" ? Math.min(LANE_OFFSET, Math.max(0, channel.space) / (count - 1)) : LANE_OFFSET;
  const stepX = count > 1 ? Math.min(LANE_OFFSET, (2 * MAX_SHIFT) / (count - 1)) : LANE_OFFSET;
  let shift = 0;
  const reach = ((count - 1) / 2) * stepY;
  if (channel.kind === "top") shift = -Math.max(0, reach - OUTER_EXTRA);
  else if (channel.kind === "bottom") shift = Math.max(0, reach - OUTER_EXTRA);
  const y = channel.y + centred * stepY + shift; const dx = centred * stepX;
  const x1 = start.x + END_MARGIN + dx; const x2 = to.x - END_MARGIN + dx;
  return [start, { x: x1, y: start.y }, { x: x1, y }, { x: x2, y }, { x: x2, y: end.y }, end];
}

/** Order lanes of one channel. Try a few fixed orders and keep the one with the fewest crossings. Ties keep the ID order. */
function orderLanes(lanes: Lane[], byId: Map<string, TaskGraphNode>, channel: Channel) {
  if (lanes.length <= PLAIN_LANES) return lanes;
  const get = (lane: Lane) => ({ from: byId.get(lane.from)!, to: byId.get(lane.to)! });
  const keys: ((lane: Lane) => number)[] = [
    (lane) => get(lane).from.y + get(lane).from.height / 2,
    (lane) => get(lane).to.y + get(lane).to.height / 2,
    (lane) => get(lane).from.y + get(lane).from.height / 2 + get(lane).to.y + get(lane).to.height / 2,
  ];
  const candidates: Lane[][] = [lanes];
  for (const key of keys) {
    const sorted = [...lanes].sort((a, b) => key(a) - key(b)); // stable: ties keep the ID order
    candidates.push(sorted, [...sorted].reverse());
  }
  let best = lanes; let bestCount = Infinity;
  for (const candidate of candidates) {
    const count = crossingsOf(candidate.map((lane, index) => ({ points: lanePoints(get(lane).from, get(lane).to, channel, index, candidate.length) })));
    if (count < bestCount) { best = candidate; bestCount = count; }
    if (bestCount === 0) break;
  }
  return best;
}

/**
 * Route every edge. Adjacent layers use a curve (no point list). Edges that skip layers run in a free
 * horizontal channel (a gap between cards, or above or below them) in the layers they cross. Long edges in
 * the same channel use separate lanes. The result is deterministic. `minY` and `maxY` give the extent of
 * the long-edge lanes, so the layout can make room for them.
 */
export function routeEdges(nodes: readonly TaskGraphNode[], edges: readonly TaskGraphEdge[]): EdgeRouting {
  const byId = new Map(nodes.map((node) => [node.task.id, node]));
  const paths = new Map<string, Point[]>();
  const groups = new Map<number, { channel: Channel; lanes: Lane[] }>();
  for (const edge of [...edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to))) {
    const from = byId.get(edge.from); const to = byId.get(edge.to);
    if (!from || !to || to.layer - from.layer < 2) continue;
    const start = startOf(from); const end = endOf(to);
    const blocked = nodes.filter((node) => node.layer > from.layer && node.layer < to.layer).map((node) => [node.y, node.y + node.height] as const).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [top, bottom] of blocked) { const last = merged[merged.length - 1]; if (last && top <= last[1]) last[1] = Math.max(last[1], bottom); else merged.push([top, bottom]); }
    const candidates: Channel[] = merged.length
      ? [{ y: merged[0][0] - CHANNEL_OFFSET, kind: "top", space: 0 }, ...merged.slice(1).map((m, i): Channel => ({ y: (merged[i][1] + m[0]) / 2, kind: "gap", space: m[0] - merged[i][1] - 2 * GAP_MARGIN })), { y: merged[merged.length - 1][1] + CHANNEL_OFFSET, kind: "bottom", space: 0 }]
      : [{ y: (start.y + end.y) / 2, kind: "free", space: 0 }];
    const middle = (start.y + end.y) / 2;
    const channel = candidates.reduce((best, c) => (Math.abs(c.y - middle) < Math.abs(best.y - middle) ? c : best));
    const group = groups.get(channel.y) ?? { channel, lanes: [] };
    group.lanes.push({ from: edge.from, to: edge.to });
    groups.set(channel.y, group);
  }
  let minY = Infinity; let maxY = -Infinity;
  for (const { channel, lanes } of groups.values()) {
    orderLanes(lanes, byId, channel).forEach((lane, index, all) => {
      const points = lanePoints(byId.get(lane.from)!, byId.get(lane.to)!, channel, index, all.length);
      paths.set(edgeKey(lane.from, lane.to), points);
      for (const point of points) { minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y); }
    });
  }
  return { paths, minY, maxY };
}

/** One SVG path per edge, in the order of `layout.edges`. */
export function computeEdgePaths(layout: Pick<TaskGraphLayout, "nodes" | "edges">): TaskEdgePath[] {
  const byId = new Map(layout.nodes.map((node) => [node.task.id, node]));
  const { paths } = routeEdges(layout.nodes, layout.edges);
  return layout.edges.flatMap((edge) => {
    const from = byId.get(edge.from); const to = byId.get(edge.to);
    if (!from || !to) return [];
    const points = paths.get(edgeKey(edge.from, edge.to));
    return [{ ...edge, d: points ? roundedPath(points) : adjacentPath(startOf(from), endOf(to)) }];
  });
}
