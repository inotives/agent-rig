# Phase 22: Lineage Graph Redesign

## Objective

Redesign the read-only task lineage graph in the AgentRig UI. The new graph
must be easier to read, show more useful task information, and let the user
explore dependencies. The graph stays a native SVG renderer.

## Accepted decisions

- Keep the native SVG renderer. ADR 0006 stays valid. Do not add `elkjs` or
  another graph library in this phase.
- Rewrite the graph code as small modules. Do not keep the dense one-line
  functions in `src/ui/pages/task-board/index.ts`.
- Use a two-tier compact node card.
  - Always visible: task ID, title (wrapped to two lines, not cut), status
    badge, and assigned agent.
  - Small indicators: priority dot and handoff count.
  - On hover or select only: phase, type, updated date, and blocked-by list.
    The existing preview panel shows these.
- Add pan and zoom. The user drags to pan. Ctrl or Cmd plus wheel zooms. A Fit
  button resets the view.
- Add lineage focus. When the user selects or hovers a task, the graph
  highlights its ancestors and descendants. The graph dims all other nodes and
  edges.
- Improve the layout and keep it deterministic.
  - Reduce edge crossings with barycenter row ordering inside each layer.
  - Improve edge routing. Draw edges behind nodes. Do not let arrowheads
    overlap cards.
- Use a DaisyUI-native flat style.
  - Use DaisyUI theme tokens, not hard-coded colors. Light and dark themes
    must work without extra code.
  - Cards are flat with a thin border and a status-colored left rail.
    The selected card has a ring.
  - Status is a small badge.
  - Edges are thin and neutral. Edges in the focused lineage use an accent
    color.
  - Add a status legend and a corner toolbar (Fit, zoom in, zoom out, zoom
    level).
- Keep the graph visible when the user selects a task. This decision came
  from the task-0076 review. The existing task drawer is `80vw` wide, has a
  scrim, and hides the lineage highlight. On wide screens, show the task
  details as a narrow side panel with no scrim, and keep the graph usable.
  On narrow screens, keep the current modal drawer. Closing the panel still
  clears the selection and the focus.

## Scope

### In scope

- Graph layout, node rendering, edge rendering, toolbar, legend.
- Pan, zoom, Fit, and lineage focus.
- Hover preview that does not cover the focused node.
- Task drawer layout on wide screens (side panel, no scrim).
- Regression tests for layout determinism, crossing reduction, and lineage
  computation.

### Out of scope

- Workflow-store writes from the UI.
- A graph library or `elkjs`.
- Keyboard navigation along dependency edges.
- A minimap.
- Phase swim-lanes.
- New API endpoints. The summary API already returns all needed fields.

## Acceptance criteria

- The graph shows ID, wrapped title, status badge, agent, priority dot, and
  handoff count on each node.
- The user can pan, zoom, and fit the graph.
- Selecting a task highlights its full ancestor and descendant lineage and dims
  all other nodes and edges. On a wide screen, the highlight stays visible
  while the task panel is open.
- Layout is deterministic. For the same input, it gives the same output.
- Edge crossings are lower than or equal to the previous layout on the test
  fixtures.
- Light and dark themes both render correctly.
- Existing routing, selection, focus, and read-only guards still work.
- Tests, build, and human browser review pass.

## Open items

- Task breakdown. Create tasks only after the human approves this plan.
- Decide whether a new ADR is needed. ADR 0006 already covers the native SVG
  decision, so a new ADR is likely not needed.
