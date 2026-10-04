---
id: task-0021
title: "Phase 16: add Markdown workflow store adapter"
type: task
status: done
assigned_to: worker
created_by: planner
created_on: 2026-10-04
updated_on: 2026-10-04
priority: high
parent: ""
depends_on:
  - task-0020
message: "Independent review passed: Markdown adapter preserves
  content/metadata/dependency readiness/handoff chronology; npm test 80 passed
  and git diff --check passed."
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---















# Task

## Context

Depends on task-0020. Markdown is the current default and must remain behavior
compatible while commands are moved behind the store contract.

## Goal

Implement the Markdown workflow-store adapter without changing the default
task and handoff behavior.

## Scope

- Move/reuse current Markdown parsing, serialization, task listing, dependency
  resolution, and handoff access behind the `WorkflowStore` contract.
- Preserve arbitrary frontmatter in metadata and preserve opaque Markdown
  bodies/messages.
- Preserve current task IDs, lifecycle commands, GitHub import behavior, and
  historical handoff filename ordering.
- Extend the backend-neutral task representation with dependency readiness
  (`dependencyReady`) and unresolved dependency IDs (`blockedBy`) so callers do
  not need to reimplement Markdown-specific dependency resolution.
- Add adapter-level tests for malformed records, dependencies, handoffs, and
  round-trip content preservation.

## Planner Notes

Do not add SQLite code here. Do not change the public CLI output unless the
contract requires a backend-neutral representation.

## Implementation Plan

1. Identify all direct Markdown task/handoff consumers.
2. Implement the adapter using existing parsing and formatting helpers.
3. Route only the adapter-facing code needed for contract tests.
4. Verify default Markdown behavior against existing tests.

## Acceptance Criteria

- [ ] Markdown remains the default provider and existing task lifecycle tests
      remain green.
- [ ] Rich task bodies and handoff messages round-trip without loss.
- [ ] Unknown frontmatter is retained as metadata.
- [ ] Dependency readiness and handoff chronology match current behavior, with
      `dependencyReady` and `blockedBy` available from the adapter contract.
- [ ] Focused adapter tests, `npm test`, and `git diff --check` pass.

## Notes
