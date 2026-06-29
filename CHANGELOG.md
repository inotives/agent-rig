# Changelog

## Unreleased

- Added editable agent profiles with built-in `planner`, `worker`, and `reviewer` templates.
- Added `agent-rig profiles`, `agent-rig profiles --json`, and `agent-rig profiles show <name>`.
- Added `agent-rig add ... --profile <name>` for copying profile instructions into new agents.
- Added profile-declared shared and agent-local skill installs.
- Added `agent-rig doctor`, `agent-rig doctor --json`, `agent-rig --version`, and `agent-rig version`.
- Improved top-level help output.

## 0.1.0 - 2026-06-29

- Published the first npm package as `@inotives/agent-rig`.
- Added filesystem-first workspace scaffolding, validation, agent management, credentials, skills, status, start guidance, tasks, and the MVP watch loop.
