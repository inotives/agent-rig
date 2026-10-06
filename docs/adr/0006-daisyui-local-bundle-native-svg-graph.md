# ADR 0006: Bundle DaisyUI locally and retain the native SVG graph

## Status

Accepted for Phase 19.

## Decision

Add DaisyUI as a local build dependency in the existing Tailwind pipeline.
Use DaisyUI for semantic UI surfaces, but retain the task-flow graph as a
native SVG renderer with the existing deterministic layout.

## Rationale

The CLI UI should remain usable without a runtime CDN dependency. DaisyUI
improves consistency for controls, cards, tables, badges, alerts, and modals
without requiring a framework migration. The current SVG graph is small,
deterministic, accessible, and already covered by tests; a graph library would
add rendering and interaction complexity before the project needs it.

## Consequences

- The package includes DaisyUI-generated CSS locally.
- Tailwind utilities remain appropriate for layout and SVG geometry.
- The graph's visual primitives remain native SVG rather than DaisyUI HTML
  components.
- `elkjs` or a fuller graph library can be reconsidered if graph complexity
  outgrows the current layout.
