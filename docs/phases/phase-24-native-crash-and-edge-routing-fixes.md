# Phase 24: Native Crash and Edge Routing Fixes

## Objective

Fix two problems that the Phase 22 and Phase 23 reviews found:

1. `better-sqlite3` crashes on Node 24. The crash breaks `agent-rig ui`, the
   `agent-rig` CLI at exit, and the UI tests.
2. Edge routing in dense graphs. Many long edges in one lane produce edges
   above the layout and arrows that point backwards.

## Accepted decisions

- Find the cause of the `better-sqlite3` crash with evidence. Test newer
  `better-sqlite3` versions on Node 24 in a scratch copy. Prefer a version
  that ships a prebuilt binary for Node 24, so users do not need a compiler.
  Change `package.json` and the lock file only when a fix is proven.
- Record the dependency change and the supported Node range in an ADR.
- After the crash is fixed, make `server.test.mjs` stable. The `waitFor`
  helper gives the Refresh step too few ticks.
- Fix edge routing in `graph/edges.ts` and `graph/layout.ts`. Lanes must not
  leave the layout. Arrows must not point backwards. Real data must look the
  same as before.
- Keep the UI read-only. Do not add features.

## Scope

### In scope

- Root cause and fix of the `better-sqlite3` crash on Node 24.
- A stable `server.test.mjs` and `api.test.mjs`.
- Lane spacing and layout height for long edges.
- Tests with synthetic dense graphs.

### Out of scope

- New UI features.
- Other follow-ups from the Phase 23 review (Clear button focus, Enter with no
  match, zoom reset, compact node width, favicon, remaining source-text tests).
- Changing the storage design.

## Acceptance criteria

- `agent-rig ui` starts on Node 24 and answers API requests without a crash.
- `agent-rig tasks ...` commands do not crash at exit.
- `node --test $(find test/ui -name '*.test.mjs')` passes without a native
  crash, in at least 5 runs in a row.
- In synthetic dense graphs (40 tasks with 79 long edges, 300 tasks), no edge
  is outside the layout and no arrow points backwards.
- The Phase 22 and Phase 23 graphs look the same as before.
- Tests, build, package dry-run, and human review pass.

## Open items

- The fix for the crash may need a dependency change. The human approves it
  through the ADR and review.
