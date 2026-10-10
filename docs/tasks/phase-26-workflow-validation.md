# Task: Enforce task transitions and handoff routing

## Context

Historical handoffs use mixed statuses, empty recipients, and inconsistent
routing. New workflow mutations need one executable contract without rewriting
history.

## Goal

Validate new handoffs and role-specific task transitions while preserving
historical records.

## Scope

- Workflow-store mutation commands.
- Handoff recipient and decision validation.
- Role-specific task transition validation.
- Legacy record read compatibility.

## Planner Notes

Canonical new routing is:

```text
worker -> reviewer: review
reviewer -> worker: changes_requested
planner -> worker: changes_requested
reviewer -> planner: approved
child -> planner: blocked
```

## Implementation Plan

1. Define the accepted new handoff matrix.
2. Reject empty recipients and legacy decisions for new handoffs.
3. Permit worker and reviewer only their approved stage transitions.
4. Keep planner-only completion, blocking, and dependency unblocking.
5. Keep old SQLite records readable without migration or rewrite.
6. Add validation tests for accepted and rejected mutations.

## Acceptance Criteria

- [ ] Valid new routing succeeds.
- [ ] Invalid recipients and decisions fail with a clear message.
- [ ] Children cannot complete or unblock tasks.
- [ ] Planner can complete and unblock after approval.
- [ ] Existing legacy records remain readable.
- [ ] Validation tests pass.
