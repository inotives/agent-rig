---
id: task-0033
title: "Phase 17: update UI documentation and package/build guidance"
type: doc
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
depends_on:
  - task-0031
---


# Task

## Context

The workflow and deployment documentation must explain how operators launch
the local board and how packaged Tailwind assets are built.


## Goal

Document the UI command, read-only boundary, supported port options, and
frontend build/package behavior.


## Scope

- Update README and relevant deployed AgentRig workflow documentation.
- Document `agent-rig ui`, localhost binding, default/custom ports, and
  browser URL behavior.
- Document that mutations remain CLI-only and the UI reads the active provider.
- Document normal build requirements for Tailwind/static assets.


## Planner Notes


## Implementation Plan


## Acceptance Criteria

- [ ] A new operator can find and run the UI from repository documentation.
- [ ] Docs state the read-only and localhost-only boundaries.
- [ ] Docs explain default port 8787 and `--port`.
- [ ] Build/package instructions match the implemented asset pipeline.

## Notes
