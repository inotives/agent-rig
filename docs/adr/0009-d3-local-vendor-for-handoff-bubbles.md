# ADR 0009: Use d3 for the handoff bubble strip

## Status

Accepted on the `feature/ui-enhancement-2` branch.

## Decision

Draw the handoff strip on the task detail page with d3 (`d3@7`). Add `d3` and
`@types/d3` as development dependencies. The build copies
`node_modules/d3/dist/d3.min.js` to `dist/vendor/d3.min.js`. `ui.html` loads it
with a classic script before the page module. The page module reads the global
`d3`.

Keep the task-flow graph as native SVG. This ADR does not change ADR 0006 for
that graph.

## Rationale

The strip needs a data join and a layout that depends on the width. The number of
handoffs changes for each task, so the bubble size must fit the width. d3 does
the data join with little code. Motion (pop-in and hover magnify) uses CSS only. The UI has no bundler, so a local copy of the
minified file is the smallest change. The UI stays free of a runtime CDN
dependency.

## Consequences

- The package ships `dist/vendor/d3.min.js`.
- If the file does not load, the strip shows plain buttons. The detail view
  still opens.
- The bubble layout is a pure function (`bubbleLayout`) and has unit tests.
  The d3 drawing needs a real browser and has no unit test.
- Phase 25 decisions for the vertical timeline cards no longer apply to the
  handoff list. The search field and the handoff modal stay the same.
