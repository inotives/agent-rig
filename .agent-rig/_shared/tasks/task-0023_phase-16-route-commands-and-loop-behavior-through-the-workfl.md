---
id: task-0023
title: "Phase 16: route commands and loop behavior through the workflow store"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-10-04
updated_on: 2026-10-04
priority: high
parent: ""
depends_on:
  - task-0022
message: "Review accepted: 86 tests pass, focused provider/loop checks pass,
  diff check clean; no findings."
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---















# Task

## Context

Depends on task-0022. Commands and loop/status code currently assume task files
and expose Markdown paths in prompts and status output.

## Goal

Make all live task/handoff behavior use the active workflow store.

## Scope

- Route task create/list/show/lifecycle/next/sync operations through the store.
- Route loop selection, task transitions, handoff creation, status, and
  inspection through the store.
- Keep `agent-rig tasks ...` as the agent-facing backend-neutral interface.
- Update prompts to use project identifier and task ID, not a canonical task
  file path; tell agents to use AgentRig commands for mutations.
- Render SQLite-backed `tasks show` output as reconstructed Markdown and use
  logical IDs/sequence metadata in status listings.
- Preserve Markdown default behavior and keep run artifacts filesystem-only.

## Planner Notes

Do not expose SQL or direct database paths to agents. Keep existing loop tool
adapters and branch handling unchanged.

## Implementation Plan

1. Replace direct task/handoff reads in command and loop paths with store calls.
2. Update prompt and status models for backend-neutral identity.
3. Preserve existing output where compatible and add SQLite logical fields
   where filesystem paths no longer exist.
4. Add command/loop compatibility tests for both providers.

## Acceptance Criteria

- [ ] Existing task commands work with Markdown and SQLite providers.
- [ ] Loop selection and status derive from the active store without direct
      SQLite file edits by agents.
- [ ] Prompts contain project/task identity and AgentRig mutation guidance,
      with no required canonical task path.
- [ ] `tasks show` remains human-readable for both providers.
- [ ] Handoff creation is two-way, ordered, and transactionally paired with
      task transitions.
- [ ] Existing loop tests and new provider compatibility tests pass.

## Notes
