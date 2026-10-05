# Phase 17: Task Board UI

## Goal

Provide a simple local web UI for viewing AgentRig task status and handoff
details from the active workflow store.

## Current Status

Implementation is in progress. The operator-facing contract is documented in
the repository README: `agent-rig ui` binds to `127.0.0.1`, defaults to port
`8787`, accepts `--port`, and does not open a browser automatically.

## Initial Decisions

- Tasks have an optional canonical `phase` field for phase filtering.
- Existing records may use title or filename inference as a display fallback.
- The UI is launched with `agent-rig ui` on `127.0.0.1`.
- The default UI port is `8787`; `--port` overrides it.
- The Phase 17 UI is read-only; task and handoff mutations remain CLI-only.
- Keeping browser requests read-only avoids competing SQLite writers and
  preserves the existing AgentRig mutation boundary.
- The kanban shows all six statuses in this order: `todo`, `ready`,
  `in_progress`, `blocked`, `review`, `done`.
- Task cards show ID, title, priority, assignee, phase, last-updated time, and
  handoff count.
- Cards are ordered within a column by priority, then most recently updated.
- Task bodies render as Markdown in the task detail view.
- Handoffs appear in a searchable table with one `Detail` button per row.
- Handoff rows are sorted by descending sequence, with columns for sequence,
  sender, recipient, status, timestamp, and detail action.
- The phase filter defaults to `All phases`, includes canonical and inferred
  values plus `Unassigned`, and filters cards without hiding status columns.
- Theme defaults to the system preference; an explicit light/dark choice is
  persisted in browser `localStorage` and applies across all UI views.
- The board is designed for horizontal scrolling on small screens, while task
  detail and handoff modal views use the available full width.
- The UI is intended for local operator use and binds only to `127.0.0.1`;
  authentication and network exposure are deferred.
- The frontend uses vanilla TypeScript with Tailwind CSS and no frontend
  framework.
- Tailwind is built through its CLI into a packaged static CSS asset.
- The server reads through the active provider-neutral workflow store; SQLite
  is the primary tested provider and Markdown remains supported.
- The browser uses a small read-only JSON API:
  - `GET /api/workflow` returns project identity, available phases, and task
    summaries.
  - `GET /api/tasks/:taskId` returns the full task detail.
  - `GET /api/tasks/:taskId/handoffs` returns handoffs ordered for the table
    and detail modal.
- Task and handoff Markdown is rendered in the browser with raw HTML disabled
  and the resulting HTML sanitized before insertion into the page.
- The board provides a visible manual `Refresh` action. No WebSocket,
  server-sent event channel, or automatic polling is needed for this local
  read-only UI.
- Task detail uses a client-side `#/tasks/<task-id>` route so browser
  back/forward and local sharing work without server-side route handling.
  Handoff details remain modal overlays within the task view.
- The optional canonical `phase` field is accepted by task creation and update
  commands and persisted by both providers. Legacy phase inference remains a
  display-only fallback and is not silently written back to task data.
- The UI shows skeleton placeholders while loading, a clear empty state when
  no tasks exist, and an inline error with `Retry` when a request fails. If a
  later refresh fails, the last successfully loaded data remains visible.
- A stale task route shows a dedicated “Task not found” state with a link back
  to the board. A missing individual handoff reports its error within the
  handoff section while keeping the task detail visible.
- Handoff search is case-insensitive and runs client-side across sequence,
  sender, recipient, status, timestamp, summary, and body text.
- Legacy phase inference uses an explicit canonical field first, then a
  recognizable `phase-<number>` or `phase <number>` token in the title or
  filename; all other tasks are shown as `Unassigned`.
- The handoff detail modal shows sequence, sender, recipient, status,
  timestamp, rendered summary/body, and a collapsible formatted JSON view of
  `metadata`. Provider/source identifiers are secondary context; raw storage
  paths are not part of the primary view.
- Workflow storage safety includes a reusable non-destructive
  `agent-rig workflow import --from markdown` command. It imports only new or
  unmarked records and does not overwrite existing SQLite records.
- Import conflicts are reported per record without overwriting either source
  and without blocking unrelated records from importing.
- Markdown rebuild is dry-run by default. Replacement requires `--replace`, a
  second confirmation by typing `REPLACE SQLITE`, a timestamped backup, and a
  preview of records that would change or be removed.
- A rebuild snapshots SQLite-only or newer records into temporary tables,
  rebuilds from validated Markdown, and merges the snapshot back only when
  identity and content checks show no conflict. Ambiguous same-ID conflicts
  stop the rebuild rather than choosing a source automatically.
- After migration, SQLite is the canonical source of truth. For a same-ID
  conflict, SQLite wins for status, body, dependencies, metadata, timestamps,
  and handoffs. Markdown can supply only records absent from SQLite.
- Markdown-only tasks keep their existing IDs when unused in SQLite. ID
  collisions are reported and refused rather than silently allocating a new
  identity.
- Handoff merging preserves task ID, sequence, timestamp, sender, recipient,
  status, body, and metadata. Existing same-identity handoffs remain owned by
  SQLite; Markdown-only handoffs are appended without renumbering. Orphaned
  handoffs are reported and not imported automatically.
- Rebuild backups are stored under `.agent-rig/_shared/backups/` with a
  timestamped filename and are never deleted automatically.
- Backup is a separate reusable read-only operation exposed as
  `agent-rig workflow backup`; rebuild reuses it before any replacement.
- `workflow backup` accepts an optional `--output <path>`, defaults to a new
  timestamped backup under `.agent-rig/_shared/backups/`, and refuses to
  overwrite an existing file unless explicitly forced.
- A backup is validated before success is reported by opening it read-only,
  running SQLite integrity checks, and confirming the expected workflow
  schema is present. Partial or invalid backup files are not treated as
  successful artifacts.
- Markdown import also requires the exclusive workflow lock because it writes
  SQLite. Backup remains the only workflow operation that is lock-free.
- Import and rebuild dry-runs report per-record imported, skipped, conflicted,
  orphaned, and would-be-lost counts; each operation also supports structured
  `--json` output for automation.
- Successful incremental imports mark the source Markdown only after the
  corresponding SQLite transaction commits. Conflicted, skipped, invalid, or
  orphaned records remain unmarked for later resolution.
- Safe Markdown import and guarded SQLite rebuild are tracked as a Phase 16
  storage follow-up and must complete before Phase 17 implementation begins.
- A separate explicit repair operation may refresh only verified placeholder
  SQLite task bodies from matching Markdown. It preserves SQLite status,
  dependencies, metadata, and handoffs, and refuses records with real work or
  handoffs.
- The frontend is built with the normal project build and packaged as static
  assets. `agent-rig ui` serves those assets without downloading or building
  frontend dependencies at runtime.
- `agent-rig ui` prints the listening URL but does not open a browser
  automatically.
- Verification includes unit tests for phase resolution, status ordering,
  filtering, handoff sorting/search, and theme preference behavior; API tests
  for read-only provider-neutral endpoints; a CLI smoke test covering the
  default port `8787` and `--port`; and one browser smoke test covering the
  board, phase filter, task route, handoff search, detail modal, and theme
  toggle.
- A human performs the final end-to-end review of the web UI using real
  workflow data, including responsive layout and the agreed interactions.
- Tasks with no recorded handoffs still render normally and show a clear
  “No handoffs recorded” empty state.
- The human UI review includes keyboard navigation, modal close behavior, and
  readable contrast in both light and dark themes.

## Open Decisions

The following decisions remain open and any newly discovered limitation during
implementation should be captured as a planning adjustment before dependent
tasks are marked done:

- Task and handoff detail presentation.
- Theme persistence and visual direction.
- Authentication and local-network exposure.
- Acceptance checks and packaging/deployment scope.
