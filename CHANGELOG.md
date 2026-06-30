# Changelog

## Unreleased

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
