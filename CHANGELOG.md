# Changelog

## Unreleased

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
