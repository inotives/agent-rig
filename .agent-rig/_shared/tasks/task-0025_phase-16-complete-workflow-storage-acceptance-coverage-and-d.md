---
id: task-0025
title: "Phase 16: complete workflow storage acceptance coverage and documentation"
type: task
status: review
assigned_to: worker
created_by: planner
created_on: 2026-10-04
updated_on: 2026-10-05
priority: high
parent: ""
depends_on:
  - task-0024
message: Reviewed integrated SQLite workflow storage acceptance; 101 tests,
  build, diff check pass; completion-integrity fix verified.
migrated_at: 2026-10-04T14:53:28.966Z
migrated_to: sqlite
storage_status: migrated
---





# Task

## Context

Depends on task-0024. This task closes gaps across the integrated storage
workflow after the individual adapter and migration tasks are reviewed, then
performs the final migration of this workspace's real Markdown records.

## Goal

Complete phase-level compatibility, acceptance coverage, and user-facing
documentation for pluggable workflow storage.

## Scope

- Add full integration fixtures covering Markdown default, SQLite active mode,
  two-way handoff chains, reviewer fixes, completion integrity, and human
  override.
- Add legacy fixtures for tasks with zero and one handoff, proving migration
  preserves their historical status while marking the incomplete trail.
- Cover initialization/provider configuration, project identifiers, task ID
  counters, migration markers, fail-closed reruns, and reconstructed output.
- Update README, task docs, phase docs, and help text for the final CLI shape.
- Verify the generated workflow still keeps planning docs in `docs/` and
  carries the manager replanning process into initialized workspaces.
- Before migration, verify the real `.agent-rig/_shared/tasks/` and
  `.agent-rig/_shared/handoff_logs/` records are the intended final test input.
- Run `agent-rig workflow migrate --to sqlite` against this workspace only
  after all Markdown-backed implementation work is complete.
- After migration, verify task listing, `tasks show`, status, next-task
  selection, handoff history, and the remaining integrated-review workflow
  operate through SQLite.

## Planner Notes

If tests reveal a material design limitation, pause and return to planner/human
replanning before adding more tasks.

## Implementation Plan

1. Review all prior task handoffs and findings.
2. Add missing cross-provider and migration acceptance fixtures.
3. Update user-facing documentation and command help.
4. Run the complete verification suite and record evidence.

## Acceptance Criteria

- [ ] Full tests cover the documented Phase 16 acceptance criteria.
- [ ] Legacy tasks with zero or one handoff migrate successfully, remain
      distinguishable as incomplete-trail history, and are not treated as a
      newly valid completed loop.
- [ ] `npm test`, `npm run build`, and `git diff --check` pass.
- [ ] Fresh init behavior and generated workflow guidance are verified.
- [ ] No planning documents or run artifacts are imported into SQLite.
- [ ] Documentation accurately describes Markdown default, SQLite migration,
      agent mutation boundaries, and replanning behavior.
- [ ] This workspace's real Phase 16 tasks and handoffs are migrated and marked
      as historical in Markdown.
- [ ] The active provider is SQLite after migration and the remaining task
      workflow continues successfully through SQLite.
- [ ] A worker handoff records verification evidence for integrated review.

## Notes
