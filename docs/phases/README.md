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

## Workflow

For each phase:

1. Run `grill-with-docs` against the phase doc and `docs/project_specs.md`.
2. Resolve open decisions in the phase doc.
3. Add ADRs only for hard-to-reverse tradeoffs.
4. Commit finalized docs on `main`.
5. Implement from a feature branch.
