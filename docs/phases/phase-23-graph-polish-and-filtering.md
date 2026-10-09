# Phase 23: Graph Polish and Filtering

## Objective

Fix the known rough edges of the Phase 22 lineage graph. Then add search,
filters, and compact done tasks so that large graphs are easy to use. The UI
stays read-only.

## Accepted decisions

- Fix long edges. Edges that skip layers must be visible and must not pass
  behind cards.
- Make arrowheads follow the focus state of their edge.
- Keep one status legend, inside the graph. Remove the page-level legend.
- Add a search box and filters (status and agent). Non-matching tasks dim.
  Lineage focus has priority over filter dimming. Filter state is in memory
  only.
- Add compact nodes for done tasks. A toggle controls them. The default is on
  when more than 30 tasks are visible. Every done task is compact, even if an
  open task depends on it. (Changed after the human check: the first rule
  compacted only done tasks whose dependents were all done. It rarely
  collapsed anything, because a final review task depends on every task.)
- Keep the native SVG renderer. Do not add a graph library. ADR 0006 stays
  valid.

## Scope

### In scope

- Edge routing for edges that skip layers.
- Arrowhead focus state.
- Removal of the duplicate status legend.
- Search, status filter, agent filter, and jump to first match.
- Compact done nodes and the toggle, with variable node height in the layout.
- Tests for the pure logic (edge paths, matching, compacting, layout).

### Out of scope

- Workflow-store writes from the UI.
- API changes, URL state for the filter, or saved filters.
- Minimap, keyboard navigation along edges, phase swim-lanes.
- Critical-path view, auto-refresh, and agent activity view (candidates for a
  later phase).
- The `better-sqlite3` crash and the flaky `server.test.mjs` test. Track them
  in separate tasks.

## Acceptance criteria

- Every edge in the Phase 22 graph can be seen.
- Arrowheads of focused lineage edges use the accent color. Arrowheads of
  dimmed edges are dimmed.
- One status legend is shown.
- Search, status filter, and agent filter dim non-matching tasks. Enter jumps
  to the first match. Clear and a phase change reset the filter.
- Every done task is compact when the toggle is on. The toggle works. The
  layout stays deterministic.
- Light and dark themes both render correctly.
- Read-only guards, routing, selection, and the Phase 22 behavior still work.
- Tests, build, and human browser review pass.

## Open items

- The filter and compact-node rules in the task briefs are planner
  assumptions. The human can change them before the worker starts.
- Real-data browser checks need a working `agent-rig ui`. Until the
  `better-sqlite3` crash is fixed, use a small preview server that reads the
  workflow store with the `sqlite3` command. Keep such scripts outside the
  repository.
