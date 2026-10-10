# Task: Perform the final planner integration review

## Context

The phase changes documentation, prompt assembly, runtime lifecycle handling,
launchers, validation, deployment guidance, and tests. These changes need one
planner-owned review against the complete phase contract.

## Goal

Confirm that the complete diff implements the approved planner-manager
workflow without reopening already accepted design decisions.

## Scope

- Complete branch diff.
- Phase 26 acceptance criteria.
- Full test, typecheck, build, and diff-check results.
- Manual review of upgrade guidance.

## Planner Notes

- The planner performs this review directly.
- If an integration issue is found, send `changes_requested` to the assigned
  worker and restart the worker-reviewer repair cycle.
- Do not create a second final reviewer task.

## Implementation Plan

1. Read the complete phase plan and all task handoffs.
2. Inspect the complete diff for contract drift.
3. Run the full verification suite.
4. Check that downstream task gating and retry behavior remain safe.
5. Record an `approved` planner handoff only when all criteria pass.

## Acceptance Criteria

- [ ] Every Phase 26 acceptance criterion is verified.
- [ ] No unresolved review finding remains.
- [ ] Full verification evidence is recorded.
- [ ] The planner approves the phase or sends a focused repair handoff.
