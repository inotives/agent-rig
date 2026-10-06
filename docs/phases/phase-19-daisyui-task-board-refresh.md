# Phase 19: DaisyUI Task Board Refresh

## Objective

Refresh the Phase 18 read-only task board with DaisyUI semantic components and
a more structured visual hierarchy while preserving the local-first CLI UI,
native SVG task-flow graph, and existing read-only behavior.

## Accepted decisions

- DaisyUI is bundled locally as an npm build dependency; the browser does not
  load UI CSS from a CDN at runtime.
- Use DaisyUI's built-in `light` and `dark` themes with the existing persisted
  theme toggle.
- Use DaisyUI for nearly all semantic UI surfaces: buttons, selects, badges,
  cards, modal, tables, alerts, controls, and theme surfaces.
- Keep Tailwind utilities for layout, spacing, responsive behavior, and the
  native SVG graph geometry.
- Map task status to DaisyUI semantic colors: neutral/todo, info/ready,
  warning/in_progress, error/blocked, secondary/review, and success/done.
- Keep explicit SVG status rails so status remains visible in the task-flow
  canvas.
- Use a native DaisyUI `<dialog class="modal">` for handoff details.
- Structure handoff details as a card with a header, metadata grid, rendered
  message, collapsible JSON metadata, and close action.
- Use DaisyUI `table`/`table-zebra` for handoffs on larger screens and stacked
  responsive rows on small screens.
- Reorganize task details into separate cards for summary, Markdown, and the
  handoff timeline while retaining the responsive two-column layout.
- Keep the task-flow graph as native SVG. Do not add a graph library in this
  phase; revisit `elkjs` only if the deterministic layout becomes inadequate.

## Scope

### In scope

- Add and locally bundle DaisyUI through the existing Tailwind build.
- Replace existing semantic controls and content surfaces with DaisyUI
  components and themes.
- Improve task detail and handoff modal structure and responsive behavior.
- Preserve read-only API behavior, manual refresh, routing, selection, focus,
  hover preview anchoring, and native SVG graph behavior.
- Add focused regression and packaging coverage.

### Out of scope

- Any workflow-store writes from the UI.
- React or another frontend framework.
- A graph layout/rendering library.
- New task mutations, filtering semantics, or API endpoints.

## Acceptance criteria

- DaisyUI is bundled into the generated package CSS and works without a CDN.
- Light/dark theme toggle remains persisted and applies DaisyUI themes.
- Header, controls, cards, badges, alerts, modal, and handoff table use DaisyUI
  components consistently.
- Handoff details are presented as a structured accessible card in a native
  DaisyUI modal with Escape, backdrop, and focus restoration behavior.
- Task details use the agreed card layout and remain responsive.
- SVG task-flow layout, status rails, selection, zoom, hover preview, and
  dependency arrows continue to work.
- Read-only API and UI mutation guards remain intact.
- Tests, build, package dry-run, and human browser review pass.

## Implementation task shape

1. Add DaisyUI locally and integrate the build.
2. Refresh the SPA shell, controls, status surfaces, and task cards.
3. Refresh task details, handoff table, and structured modal.
4. Verify graph compatibility, themes, read-only behavior, and packaging.
5. Run integrated review and human browser acceptance.

Implementation tasks may now be created from this approved plan.
