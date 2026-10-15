---
issue: 32
source_url: https://github.com/inotives/agent-rig/issues/32
branch: adhoc-initial-setting-startup
status: approved
created_at: 2026-10-15T06:06:09Z
approved_at: 2026-10-15T06:06:09Z
---
# Issue #32: SQLite default for new workspaces

## Goal

Make SQLite the default for new workspaces created by `agent-rig init`.

## Scope

- Keep `--workflow-store markdown` available.
- Keep Markdown as the fallback for configs without a provider.
- Preserve existing workspace providers and workflow data.
- Update help, current documentation, templates, and tests.

## Decisions

- Change only the init default. Do not change runtime fallback or migration.
- Keep the implementation small.

## Implementation Plan

1. Default init to SQLite; test default and explicit Markdown paths.
2. Keep a test for the Markdown fallback on incomplete configs.
3. Update the CLI help, README, task docs, Phase 16 status, and workflow
   template.
4. Run focused tests, build, and `git diff --check`.

## Task Breakdown

Implementation and review use SQLite task `task-0129`.

## Review State

- Human approved the default behavior on 2026-10-15.
- `agent-rig plan approve 32` was unavailable because GitHub CLI auth was not
  configured. The human supplied the issue body in this session.
