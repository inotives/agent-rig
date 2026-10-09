import { EMPTY_FILTER, GraphFilter, GraphFilterMatch, isFilterActive, toggleStatus } from "./filter.js";
import { renderGraphLegend, syncGraphLegend } from "./render.js";

export type GraphToolbarHandlers = { onChange: (filter: GraphFilter) => void; onJump: () => void };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) { const item = document.createElement(tag); item.className = className; return item; }

/** Search box, status legend buttons, agent select, match count, and Clear. The toolbar keeps the filter in `filter` and reports each change. */
export type CollapseOption = { value: boolean; onChange: (value: boolean) => void };

export function renderGraphToolbar(initial: GraphFilter, agents: readonly string[], handlers: GraphToolbarHandlers, collapse?: CollapseOption) {
  let filter: GraphFilter = initial.agent !== "" && !agents.includes(initial.agent) ? { ...initial, agent: "" } : initial;
  const root = element("div", "mb-2 flex flex-wrap items-center gap-x-4 gap-y-2"); root.setAttribute("role", "group"); root.setAttribute("aria-label", "Task flow filters"); root.dataset.graphToolbar = "true";

  const searchLabel = element("label", "input input-bordered input-sm flex items-center gap-2"); const searchText = element("span", "text-xs opacity-70"); searchText.textContent = "Search tasks";
  const search = element("input", "grow"); search.type = "search"; search.placeholder = "ID, title, or agent"; search.autocomplete = "off"; search.value = filter.query; search.dataset.graphSearch = "true";
  searchLabel.append(searchText, search);

  const agentLabel = element("label", "flex items-center gap-2 text-xs"); const agentText = element("span", "opacity-70"); agentText.textContent = "Agent";
  const agent = element("select", "select select-bordered select-sm"); agent.dataset.graphAgent = "true";
  agent.append(new Option("All agents", "")); for (const name of agents) agent.append(new Option(name, name)); agent.value = filter.agent;
  agentLabel.append(agentText, agent);

  const legend = renderGraphLegend((status) => change(toggleStatus(filter, status)));
  const count = element("span", "text-xs tabular-nums opacity-70"); count.setAttribute("role", "status"); count.setAttribute("aria-live", "polite"); count.dataset.graphMatchCount = "true";
  const clear = element("button", "btn btn-ghost btn-xs"); clear.type = "button"; clear.textContent = "Clear"; clear.dataset.graphClear = "true";

  const change = (next: GraphFilter) => { filter = next; syncGraphLegend(legend, filter.statuses); clear.disabled = !isFilterActive(filter); handlers.onChange(filter); };
  search.addEventListener("input", () => change({ ...filter, query: search.value }));
  search.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); handlers.onJump(); } });
  agent.addEventListener("change", () => change({ ...filter, agent: agent.value }));
  clear.addEventListener("click", () => { search.value = ""; agent.value = ""; change(EMPTY_FILTER); });

  syncGraphLegend(legend, filter.statuses); clear.disabled = !isFilterActive(filter);
  root.append(searchLabel, agentLabel, legend);
  if (collapse) {
    let on = collapse.value;
    const toggle = element("button", "btn btn-xs"); toggle.type = "button"; toggle.textContent = "Collapse done"; toggle.dataset.graphCollapse = "true";
    const sync = () => { toggle.setAttribute("aria-pressed", String(on)); toggle.classList.remove("btn-primary", "btn-outline"); toggle.classList.add(on ? "btn-primary" : "btn-outline"); };
    toggle.addEventListener("click", () => { on = !on; sync(); collapse.onChange(on); }); sync(); root.append(toggle);
  }
  root.append(count, clear);

  /** Show the match count. Call this after each change. */
  const showMatch = (match: GraphFilterMatch) => { count.textContent = match.active ? `${match.count} of ${match.total} match` : `${match.total} tasks`; };
  return { element: root, filter: () => filter, showMatch };
}
