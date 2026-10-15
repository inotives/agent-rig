## Context

Issue #32 changes the default store for new workspaces to SQLite. Existing
workspaces keep their provider.

## Goal

Default `agent-rig init` to SQLite. Keep Markdown available.

## Scope

- Keep explicit Markdown init and the Markdown runtime fallback.
- Update CLI help, README, task docs, Phase 16 status, template, and tests.
- Do not migrate existing workflow data.

## Planner Notes

Keep code changes minimal. Run tests with temporary roots.

## Implementation Plan

1. Change the `init` default and test both providers plus the fallback.
2. Update the required help and documentation.
3. Run focused tests, build, and `git diff --check`.

## Acceptance Criteria

- [ ] Init defaults to SQLite and creates the database.
- [ ] Explicit Markdown init creates no SQLite database.
- [ ] Missing-provider configs still resolve to Markdown.
- [ ] Help and current docs describe both options and preserve existing configs.
- [ ] Focused tests and build pass.
