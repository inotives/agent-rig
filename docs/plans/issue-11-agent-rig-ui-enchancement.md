---
issue: 11
source_url: https://github.com/inotives/agent-rig/issues/11
branch: issue/11-agent-rig-ui-enchancement
status: pushed
created_at: 2026-10-07T23:43:23.072Z
---
# Issue #11: Agent-rig UI enhancement

## Goal

Render the deployed project name in the task-board heading. The heading must
show `AgentRig: <project_identifier>`. Keep the existing read-only workflow
subtitle below the heading.

## Scope

- Update the task-board page heading.
- Use the existing `WorkflowSummaryDto.project_identifier` value.
- Remove the duplicate project-name paragraph below the heading.
- Add focused UI coverage for the dynamic heading.
- Do not change the workflow store, API contract, database schema, or CLI.

## Decisions

- Use the existing project identifier. Do not derive the name from a path or
  add a new configuration field.
- Keep `AgentRig` as the product name and append the project identifier after
  a colon.
- Set the heading content through the existing DOM rendering path so the
  project identifier is treated as text.
- Keep the current subtitle: `Read-only workflow visibility`.

## Implementation Plan

1. Update the task-board heading to render `AgentRig: <project_identifier>`.
2. Remove the redundant project-name paragraph from the task-board header.
3. Add or update focused UI tests for the heading and summary refresh path.
4. Run the focused tests, the type check, the build, and `git diff --check`.

## Task Breakdown

### Task 1: Render the deployed project name in the UI heading

#### Context

The task-board page currently renders a fixed `AgentRig` heading and shows the
project identifier in a separate small paragraph. The workflow summary already
provides `project_identifier`.

#### Goal

Render the heading as `AgentRig: <project_identifier>` and keep the existing
read-only subtitle.

#### Scope

- Change the task-board page only.
- Use the existing workflow summary data.
- Remove the duplicate project-name paragraph.
- Add focused UI test coverage.
- Do not change storage, API, or CLI behavior.

#### Planner Notes

- Preserve the existing light and dark theme classes.
- Use DOM text assignment for the project identifier.
- The heading must update when the rendered workflow summary changes.
- Keep the change small because the issue does not require a new data field.

#### Implementation Plan

1. Update the task-board header construction.
2. Set the heading from the current workflow summary project identifier.
3. Remove the redundant project paragraph.
4. Add a focused test for the heading text and summary refresh.
5. Run the focused test, type check, and build.

#### Acceptance Criteria

- [ ] The task-board heading displays `AgentRig: <project_identifier>`.
- [ ] The heading uses the current workflow summary value.
- [ ] The heading updates when the summary changes.
- [ ] The read-only subtitle remains visible.
- [ ] The duplicate project-name paragraph is removed.
- [ ] Existing UI tests and the build pass.

### Task 2: Review the dynamic UI heading

#### Context

Task 1 changes the task-board header to use the deployed project identifier.
This task provides the independent review and integrated verification for Issue
#11.

#### Goal

Confirm that the implementation meets the issue and does not change unrelated
workflow behavior.

#### Scope

- Review the worker handoff and current diff.
- Verify the heading, subtitle, refresh behavior, and focused tests.
- Do not edit implementation files.

#### Planner Notes

- This task must remain blocked until Task 1 passes worker and reviewer checks.
- Report any issue through a reviewer handoff and return Task 1 to the worker.

#### Implementation Plan

1. Read Task 1, its worker handoff, and its reviewer handoff.
2. Inspect the current diff against the issue acceptance criteria.
3. Run the focused tests and build checks.
4. Write a review handoff with evidence and a clear result.

#### Acceptance Criteria

- [ ] The heading displays the project identifier from workflow data.
- [ ] The subtitle remains unchanged.
- [ ] No duplicate project-name label remains in the header.
- [ ] No unrelated API, storage, or CLI changes are present.
- [ ] Focused tests and the build pass.

Depends On: 1

## Review State

- Status: waiting for human review.
- Do not create implementation tasks before approval.

## Issue Comments (Context Only)

(No issue comments.)
