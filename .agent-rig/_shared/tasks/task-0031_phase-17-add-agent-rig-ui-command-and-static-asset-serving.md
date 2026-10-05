---
id: task-0031
title: "Phase 17: add agent-rig ui command and static asset serving"
type: task
status: todo
assigned_to: worker
created_by: planner
created_on: 2026-10-05
updated_on: 2026-10-05
priority: high
parent: ""
storage_status: migrated
migrated_to: sqlite
migrated_at: "2026-10-05T12:30:14Z"
depends_on: [task-0028, task-0029]
---

# Task

## Context

The UI must be available through the AgentRig CLI and serve packaged assets
from a local-only server.


## Goal

Add `agent-rig ui` with default port 8787 and a `--port` override.


## Scope

- Register the UI CLI command and port option.
- Bind only to `127.0.0.1`.
- Serve packaged static frontend assets and JSON API routes.
- Print the listening URL without opening a browser.
- Return useful errors when the active workflow store or assets are missing.


## Planner Notes


## Implementation Plan


## Acceptance Criteria

- [ ] `agent-rig ui` listens on `127.0.0.1:8787` by default.
- [ ] `--port` selects a custom port.
- [ ] Static assets and API routes are served from one process.
- [ ] The command does not provide mutation routes or auto-open a browser.
- [ ] The packaged build contains the assets required by the command.

## Notes
