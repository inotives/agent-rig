import type { HandoffDto } from "../../core/contracts.js";

// d3 is loaded by a classic script (`/vendor/d3.min.js`) before the page module runs.
declare const d3: typeof import("d3");

const PAD = 10;
const R_MAX = 13;
const R_COMFY = 8;
const R_MIN = 4.5;
const GAP = 3;
const STEP_MAX_FACTOR = 2.6;
const OVERLAP_STEP = 1.1;
const LABEL_MIN_R = 13;
const HOVER_SCALE = 1.6;

export type BubbleLayout = { radius: number; xs: number[]; width: number; height: number; overlap: boolean };

/**
 * Place `count` bubbles in one row. Bubbles stay large. When the row is crowded they overlap like a stack,
 * and the radius shrinks only after that, down to a minimum. Below the minimum the row grows wider than `width`,
 * so the caller can scroll it. A short row stays at the maximum radius and is left aligned.
 */
export function bubbleLayout(count: number, width: number): BubbleLayout {
  const safeWidth = Math.max(0, width);
  const frame = (radius: number) => Math.ceil(radius * HOVER_SCALE * 2) + 2 * PAD;
  if (count <= 0) return { radius: R_MAX, xs: [], width: safeWidth, height: frame(R_MAX), overlap: false };
  const fit = (safeWidth - 2 * PAD - (count - 1) * GAP) / (2 * count);
  let radius: number;
  let step = 0;
  if (fit >= R_COMFY || count === 1) {
    radius = Math.min(R_MAX, Math.max(fit, R_COMFY));
    const natural = count > 1 ? (safeWidth - 2 * PAD - 2 * radius) / (count - 1) : 0;
    step = count > 1 ? Math.max(2 * radius + GAP, Math.min(natural, 2 * radius * STEP_MAX_FACTOR)) : 0;
  } else {
    radius = R_COMFY;
    let natural = (safeWidth - 2 * PAD - 2 * radius) / (count - 1);
    if (natural < OVERLAP_STEP * radius) {
      radius = Math.max(R_MIN, (safeWidth - 2 * PAD) / (2 + (count - 1) * OVERLAP_STEP));
      natural = (safeWidth - 2 * PAD - 2 * radius) / (count - 1);
    }
    step = Math.max(natural, OVERLAP_STEP * radius);
  }
  const xs = Array.from({ length: count }, (_, index) => PAD + radius + index * step);
  const needed = PAD * 2 + 2 * radius + (count - 1) * step;
  return { radius, xs, width: Math.max(safeWidth, needed), height: frame(radius), overlap: step < 2 * radius };
}

/** Bubble colors by DaisyUI tone. Full class names, so Tailwind can find them. */
const FILL: Record<string, string> = { success: "fill-success", secondary: "fill-secondary", info: "fill-info", error: "fill-error", warning: "fill-warning", accent: "fill-accent", primary: "fill-primary", neutral: "fill-slate-400" };
const LABEL: Record<string, string> = { success: "fill-success-content", secondary: "fill-secondary-content", info: "fill-info-content", error: "fill-error-content", warning: "fill-warning-content", accent: "fill-accent-content", primary: "fill-primary-content", neutral: "fill-slate-900" };
const RING: Record<string, string> = { success: "stroke-success", secondary: "stroke-secondary", info: "stroke-info", error: "stroke-error", warning: "stroke-warning", accent: "stroke-accent", primary: "stroke-primary", neutral: "stroke-slate-400" };

export type HandoffBubbleOptions = {
  tone: (status: string) => string;
  renderHover: (handoff: HandoffDto) => HTMLElement;
  onOpen: (handoff: HandoffDto, trigger: HTMLElement) => void;
};

/**
 * A horizontal strip of handoff bubbles drawn with d3. Hover or focus shows a box. Click, Enter or Space opens the detail.
 * `update` redraws the strip for a new list. Handoffs show oldest first.
 */
export function createHandoffBubbles(options: HandoffBubbleOptions) {
  if (typeof d3 === "undefined") return createFallbackBubbles(options);
  const root = document.createElement("div");
  root.className = "relative";
  const scroller = document.createElement("div");
  scroller.className = "overflow-x-auto";
  const hover = document.createElement("div");
  hover.className = "pointer-events-none absolute z-20 hidden w-72 max-w-[90%] rounded-2xl border border-base-300 bg-base-200 p-3 shadow-xl dark:border-white/10 dark:bg-slate-900/95 dark:backdrop-blur";
  hover.setAttribute("role", "status");
  root.append(scroller, hover);

  const svg = d3.select(scroller).append("svg").attr("class", "block").attr("role", "list").attr("aria-label", "Handoffs, oldest first");
  const rail = svg.append("line").attr("class", "stroke-base-content/20").attr("stroke-width", 2).attr("stroke-linecap", "round");
  const layer = svg.append("g");
  let items: HandoffDto[] = [];
  let newest = -Infinity;
  let animate = true;
  let current: BubbleLayout = bubbleLayout(0, 0);

  function show(item: HandoffDto, cx: number, cy: number) {
    hover.replaceChildren(options.renderHover(item));
    hover.classList.remove("hidden");
    const box = hover.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const left = Math.min(Math.max(0, cx - scroller.scrollLeft - box.width / 2), Math.max(0, rootBox.width - box.width));
    hover.style.left = `${left}px`;
    hover.style.top = `${cy + current.radius * HOVER_SCALE + 10}px`;
  }
  const hide = () => hover.classList.add("hidden");
  /** Bring a bubble in front of its neighbours, so the magnified bubble is not covered. */
  const bringForward = (group: SVGGElement) => { if (group.parentNode && group.parentNode.lastChild !== group) d3.select(group).raise(); };

  function draw() {
    const layout = bubbleLayout(items.length, scroller.clientWidth || root.clientWidth || 0);
    current = layout;
    const cy = layout.height / 2;
    svg.attr("width", layout.width).attr("height", layout.height).attr("viewBox", `0 0 ${layout.width} ${layout.height}`);
    const first = layout.xs[0] ?? 0;
    const last = layout.xs[layout.xs.length - 1] ?? 0;
    rail.attr("x1", first).attr("x2", last).attr("y1", cy).attr("y2", cy).attr("class", items.length > 1 ? "stroke-base-content/20" : "hidden");
    const motion = animate;
    const nodes = layer.selectAll<SVGGElement, HandoffDto>("g.bubble").data(items, (item) => item.sequence).join(
      (enter) => {
        const group = enter.append("g").attr("class", "bubble group cursor-pointer outline-none").attr("role", "listitem").attr("tabindex", 0);
        const scaler = group.append("g").attr("class", "scaler");
        scaler.append("circle").attr("class", "ring").attr("fill", "none").attr("stroke-width", 2).attr("opacity", 0).style("transform-box", "fill-box").style("transform-origin", "center");
        scaler.append("circle").attr("class", "dot stroke-base-100").attr("stroke-width", 3);
        scaler.append("text").attr("class", "seq pointer-events-none select-none font-mono font-semibold").attr("text-anchor", "middle").attr("dominant-baseline", "central");
        return group;
      },
      (update) => update,
      (exit) => exit.remove()
    );
    nodes.attr("aria-label", (item) => `Open handoff ${item.sequence} details`)
      .on("pointerenter", function (_event, item) { bringForward(this); show(item, layout.xs[items.indexOf(item)], cy); })
      .on("focus", function (_event, item) { bringForward(this); show(item, layout.xs[items.indexOf(item)], cy); })
      .on("pointerleave", hide)
      .on("blur", hide)
      .on("click", function (_event, item) { hide(); options.onOpen(item, this as unknown as HTMLElement); })
      .on("keydown", function (event: KeyboardEvent, item) { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); hide(); options.onOpen(item, this as unknown as HTMLElement); });
    const showLabel = layout.radius >= LABEL_MIN_R && !layout.overlap;
    nodes.each(function (item, index) {
      const group = d3.select(this);
      const tone = options.tone(item.status);
      const isNewest = item.sequence === newest;
      group.attr("transform", `translate(${layout.xs[index]},${cy})`);
      group.select("circle.ring").attr("class", `ring ${RING[tone]}${isNewest ? " motion-safe:animate-ping" : ""}`).attr("r", layout.radius + 4).attr("opacity", isNewest ? 0.6 : 0);
      group.select("circle.dot").attr("class", `dot stroke-base-100 ${FILL[tone]}`).attr("r", layout.radius);
      const labelVisibility = showLabel ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100";
      group.select("text.seq").attr("class", `seq pointer-events-none select-none font-mono font-semibold transition-opacity duration-150 ${LABEL[tone]} ${labelVisibility}`).attr("font-size", Math.max(10, layout.radius * 0.8)).text(String(item.sequence));
      const pop = motion ? " motion-safe:animate-bubble-pop" : "";
      group.select("g.scaler").attr("class", `scaler [transform-box:fill-box] origin-center transition-transform duration-200 ease-[cubic-bezier(0.34,1.8,0.64,1)] group-hover:scale-[1.6] group-focus-visible:scale-[1.6]${pop}`).attr("style", motion ? `--stagger: ${index * 55}ms` : null);
    });
    if (layout.width > 0 && items.length) animate = false;
  }

  if (typeof ResizeObserver === "function") new ResizeObserver(() => draw()).observe(scroller);
  return {
    element: root,
    update(next: readonly HandoffDto[]) {
      items = [...next].sort((a, b) => a.sequence - b.sequence);
      newest = items.reduce((max, item) => Math.max(max, item.sequence), -Infinity);
      hide();
      draw();
    }
  };
}

/** Plain buttons in a row. Used when d3 did not load. */
function createFallbackBubbles(options: HandoffBubbleOptions) {
  const root = document.createElement("div");
  root.className = "flex flex-wrap gap-2";
  return {
    element: root,
    update(next: readonly HandoffDto[]) {
      root.replaceChildren(...[...next].sort((a, b) => a.sequence - b.sequence).map((item) => {
        const button = document.createElement("button");
        button.className = "btn btn-circle btn-sm";
        button.type = "button";
        button.textContent = String(item.sequence);
        button.setAttribute("aria-label", `Open handoff ${item.sequence} details`);
        button.addEventListener("click", () => options.onOpen(item, button));
        return button;
      }));
    }
  };
}
