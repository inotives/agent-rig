/** Pure view math for the task graph. A view maps world point w to screen point w * scale + (tx, ty). */
export type GraphView = { scale: number; tx: number; ty: number };
export type GraphSize = { width: number; height: number };
export type GraphPoint = { x: number; y: number };

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 3;
export const DRAG_THRESHOLD = 4;
export const ZOOM_STEP = 1.25;

export function clampScale(scale: number) { return Number.isFinite(scale) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) : 1; }

/** Multiply the scale by factor. The world point under `point` (screen units) stays under it. */
export function zoomAt(view: GraphView, factor: number, point: GraphPoint): GraphView {
  const scale = clampScale(view.scale * factor);
  if (scale === view.scale) return view;
  const ratio = scale / view.scale;
  return { scale, tx: point.x - (point.x - view.tx) * ratio, ty: point.y - (point.y - view.ty) * ratio };
}

export function panBy(view: GraphView, dx: number, dy: number): GraphView { return { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy }; }

/** Show all content, centered. Never enlarge above 100%. An empty viewport gives the identity view. */
export function fitView(content: GraphSize, viewport: GraphSize, padding = 16): GraphView {
  if (viewport.width <= 0 || viewport.height <= 0 || content.width <= 0 || content.height <= 0) return { scale: 1, tx: 0, ty: 0 };
  const availableWidth = Math.max(1, viewport.width - padding * 2); const availableHeight = Math.max(1, viewport.height - padding * 2);
  const scale = clampScale(Math.min(1, availableWidth / content.width, availableHeight / content.height));
  return { scale, tx: (viewport.width - content.width * scale) / 2, ty: (viewport.height - content.height * scale) / 2 };
}

/** Centre a world rectangle in the viewport. Scale is at most 1, so a small card is not enlarged. */
export function viewForRect(rect: GraphPoint & GraphSize, viewport: GraphSize, padding = 48): GraphView {
  if (viewport.width <= 0 || viewport.height <= 0) return { scale: 1, tx: 0, ty: 0 };
  const scale = clampScale(Math.min(1, Math.max(1, viewport.width - padding * 2) / Math.max(1, rect.width), Math.max(1, viewport.height - padding * 2) / Math.max(1, rect.height)));
  return { scale, tx: viewport.width / 2 - (rect.x + rect.width / 2) * scale, ty: viewport.height / 2 - (rect.y + rect.height / 2) * scale };
}

/** SVG viewBox text for a view. The SVG element must have the same size as `viewport`. */
export function viewBoxOf(view: GraphView, viewport: GraphSize) {
  return `${-view.tx / view.scale + 0} ${-view.ty / view.scale + 0} ${viewport.width / view.scale} ${viewport.height / view.scale}`;
}

export function zoomLabel(scale: number) { return `${Math.round(scale * 100)}%`; }

export function exceedsDragThreshold(startX: number, startY: number, x: number, y: number, threshold = DRAG_THRESHOLD) { return Math.hypot(x - startX, y - startY) >= threshold; }
