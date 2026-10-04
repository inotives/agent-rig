---
id: task-0020
title: "Phase 16: establish workflow store contract and workspace configuration"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-10-04
updated_on: 2026-10-04
priority: high
parent: ""
depends_on: []
message: "codex exited with status 1 for worker worker on task-0020: WARNING:
  proceeding, even though we could not create PATH aliases: Operation not
  permitted (os error 1)"
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---










# Task

## Context

Phase source of truth: `docs/phases/phase-16-workflow-storage.md`.
The current implementation reads and writes Markdown directly from task and
loop code. Later adapters must not leak storage details into commands.

## Goal

Establish the backend-neutral workflow-store contract and workspace identity
configuration while preserving Node.js `>=20` support.

## Scope

- Define the domain types and minimal `WorkflowStore` contract for tasks,
  dependencies, and handoffs.
- Add workspace `workflow_store.provider` configuration with `markdown` as the
  default and validate supported values.
- Add stable `project_identifier` initialization/override and slug validation.
- Select and document a SQLite driver compatible with the declared Node floor;
  do not implement the full SQLite adapter in this task.
- Add focused contract/configuration tests.

## Planner Notes

Keep planning documents under `docs/` outside the workflow-store contract.
Do not add an ORM, PostgreSQL implementation, workflow-stage field, or run
artifact model.

## Implementation Plan

1. Inspect current workspace config, task types, and init flow.
2. Add the smallest shared contract and configuration helpers.
3. Extend initialization without breaking existing workspaces or profiles.
4. Select the SQLite driver based on Node `>=20` and project packaging needs.
5. Add regression tests and document the contract boundary.

## Acceptance Criteria

- [ ] Fresh initialization defaults to the Markdown provider.
- [ ] Provider configuration rejects unknown providers and preserves existing
      workspaces without a provider setting.
- [ ] `project_identifier` is a validated stable slug, defaults from the
      project directory, and supports an explicit initialization override.
- [ ] The SQLite driver choice is recorded with its Node/platform constraint.
- [ ] Contract and configuration tests pass with `npm test` and
      `git diff --check`.

## Notes

## Blockers

- 2026-10-04: codex exited with status 1 for worker worker on task-0020: WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)
