# AgentRig Implementation Phases

This folder breaks `docs/project_specs.md` into implementation phases. Each phase starts as a draft and must go through `grill-with-docs` before implementation begins.

## Phase Order

1. [Phase 1: CLI Scaffold](../_archived/phase-1-cli-scaffold.md) — completed
2. [Phase 2: Workspace Model and Validation](../_archived/phase-2-workspace-model-validation.md) — completed
3. [Phase 3: Credentials and Agent Management](../_archived/phase-3-credentials-agent-management.md) — completed
4. [Phase 4: Live State and Launch](../_archived/phase-4-live-state-launch.md) — completed
5. [Phase 5: First MVP Watch Loop](../_archived/phase-5-first-mvp-watch-loop.md) — completed
6. [Phase 6: Pre-Release and npm Registry Preparation](../_archived/phase-6-pre-release-npm.md) — completed
7. [Phase 7: CLI Polish and Agent Profiles](../_archived/phase-7-cli-polish-agent-model.md) — completed
8. [Phase 8: Task Management Improvements](../_archived/phase-8-task-management.md) — completed
9. [Phase 9: Patch Release 0.1.1 Preparation](../_archived/phase-9-patch-release-0.1.1.md) — completed
10. [Phase 10: Task Lifecycle and Shared Queue Flow](../_archived/phase-10-task-lifecycle-shared-queue.md) — completed
11. [Phase 11: GitHub Issues Backlog Sync](../_archived/phase-11-github-issues-backlog-sync.md) — completed
12. [Phase 12: Ad Hoc Resume Context and Findings Notes](../_archived/phase-12-adhoc-resume-context-and-findings-notes.md) — completed
13. [Phase 13: Worker-Reviewer Loop](../_archived/phase-13-worker-reviewer-loop.md) — completed
14. [Phase 14: OpenCode Loop Adapter](../_archived/phase-14-opencode-loop-adapter.md) — completed
15. [Phase 15: Loop Observability](phase-15-loop-observability.md) — draft
16. [Phase 16: Pluggable Workflow Storage](phase-16-workflow-storage.md) — draft
17. [Phase 17: Task Board UI](phase-17-task-board-ui.md) — draft
18. [Phase 18: SPA Task Board UI](phase-18-spa-task-board-ui.md) — completed
19. Phase 19: DaisyUI Task Board Refresh — active
20. [Phase 20: Capability-Based Structure](phase-20-capability-based-structure.md) — active
21. [Phase 21: GitHub Issue Planning Workflow](phase-21-github-issue-planning-workflow.md) — active
22. [Phase 22: Lineage Graph Redesign](phase-22-lineage-graph-redesign.md) — active
23. [Phase 23: Graph Polish and Filtering](phase-23-graph-polish-and-filtering.md) — active
24. [Phase 24: Native Crash and Edge Routing Fixes](phase-24-native-crash-and-edge-routing-fixes.md) — active
25. [Phase 25: Handoff Timeline Redesign](phase-25-handoff-timeline-redesign.md) — active
26. [Phase 26: Planner-Manager Worker-Reviewer Contract](phase-26-planner-manager-worker-reviewer-contract.md) — complete
27. [Phase 27: Safe Operations, Live Claude Test, and Phase-Based UI Pages](phase-27-live-claude-test-and-phase-pages.md) — active

## Workflow

For each phase:

1. Confirm the branch and working tree; create the phase feature branch from
   the latest `main` before changing phase docs or creating tasks.
2. Run `grill-with-docs` against the phase doc and existing project docs.
3. Resolve open decisions with the human one at a time and record accepted
   decisions in the phase doc.
4. Add ADRs only for hard-to-reverse tradeoffs.
5. After the human-approved plan is final, split it into dependency-gated
   AgentRig tasks and one final integrated-review task.
   Planning documents under `docs/` are not workflow tasks. For GitHub issue
   planning, use `agent-rig plan tasks <number>` only after approval.
6. Set only dependency-free foundation tasks to `ready`; keep downstream
   tasks `blocked`.
7. Drive each selected task through a worker sub-agent, an independent
   reviewer sub-agent, and focused worker fixes/re-review until clean.
8. Unlock only the next selected dependent task after clean review, then run
   the final integrated review.
9. If implementation or review reveals a material limitation, pause the
   affected graph, return to planner/human discussion, update the canonical
   docs, and revise or create tasks only after acceptance.
10. Commit, push, or open a pull request only when explicitly requested.
11. After merge, archive the completed phase document under `docs/_archived/`.
12. Complete the final human end-to-end check for the complete workflow.
