# Changelog

## Unreleased

- Upgraded `better-sqlite3` to `^13.0.3` to fix a native crash on Node.js 24 (see ADR 0008).
- Raised the minimum Node.js version from 20 to 22.
- Made the wait in the UI server test stable.
- Redesigned the task-flow graph with flat DaisyUI nodes (ID, wrapped title, status badge, agent, priority, handoff count), drag to pan, Ctrl/Cmd+wheel zoom, a Fit button, and lineage focus that highlights the ancestors and descendants of a task.
- Routed long dependency edges in lanes around cards, so every edge stays visible. Arrowheads follow the focus state.
- Added graph search and status and agent filters, with Enter to jump to the first match.
- Added compact done nodes and a Collapse done toggle that is on by default for graphs with more than 30 tasks.
- Task details open in a side panel beside the graph on wide screens and stay a modal drawer on narrow screens. Only one status legend is shown.
- Redesigned the handoff timeline with status-colored nodes, sender and recipient chips, a status badge, a message preview, relative time, and CSS-only motion that respects `prefers-reduced-motion`.

## 0.1.4 - 2026-10-06

- Added pluggable SQLite workflow storage with task and handoff migration support.
- Added the read-only task board UI with phase filtering, task details, searchable handoffs, and light/dark themes.
- Revamped the board as an SPA with hash routing, SVG task-flow visualization, zoom/fit controls, responsive split details, and accessible handoff modals.
- Fixed task hover previews so they appear near the hovered task card instead of at the board edge.

## 0.1.3 - 2026-07-06

- Added an AgentRig-local `plan-tasks` skill to the built-in planner profile.
- Updated planner instructions to use `plan-tasks` for phase planning and task breakdowns.
- Narrowed handoff guidance to planner-owned cross-session resume notes.
- Added shared findings notes under `.agent-rig/_shared/notes/` for durable worker and reviewer observations.
- Updated `agent-rig start --agent <name>` to print resume-context pointers for recent handoffs and shared findings notes.
- Added the ad hoc Phase 12 doc for resume-context and findings-notes workflow hardening.

## 0.1.2 - 2026-07-01

- Added shared task lifecycle commands: `tasks set-status`, `tasks assign`, `tasks set-type`, `tasks block`, `tasks unblock`, `tasks done`, and `tasks next`.
- Added dependency-aware task selection with optional claiming through `tasks next --claim`.
- Updated `watch --once` to process the shared Markdown task queue.
- Added GitHub Issues backlog import with `agent-rig tasks sync github`.
- Added GitHub sync support for `--label`, `--limit`, `--dry-run`, and `--json`.
- Imported GitHub Issues now preserve source metadata and remain unassigned `todo` tasks for planner review.
- Added real-`gh` dry-run verification for GitHub issue sync.

## 0.1.1 - 2026-06-30

- Added editable agent profiles with built-in `planner`, `worker`, and `reviewer` templates.
- Added built-in `researcher` and `writer` profiles with role-local default skills.
- Added `agent-rig profiles`, `agent-rig profiles --json`, and `agent-rig profiles show <name>`.
- Added `agent-rig add ... --profile <name>` for copying profile instructions into new agents.
- Added profile-declared shared and agent-local skill installs.
- Added `agent-rig doctor`, `agent-rig doctor --json`, `agent-rig --version`, and `agent-rig version`.
- Added shared Markdown task files under `.agent-rig/_shared/tasks/`.
- Added `agent-rig tasks create`, `agent-rig tasks`, `agent-rig tasks --json`, and `agent-rig tasks show <id>`.
- Added task metadata validation warnings for status, assignees, dependencies, and acceptance criteria.
- Updated scaffold output to create `_shared/tasks/` instead of `_shared/task_queue.json`.
- Updated planner, worker, and reviewer profile templates for the task-file workflow.
- Improved top-level help output.

## 0.1.0 - 2026-06-29

- Published the first npm package as `@inotives/agent-rig`.
- Added filesystem-first workspace scaffolding, validation, agent management, credentials, skills, status, start guidance, tasks, and the MVP watch loop.
