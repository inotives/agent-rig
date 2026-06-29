# Phase 8: Task Management Improvements

## Goal

Improve AgentRig task creation, assignment, and tracking after the Phase 7 CLI/profile work is complete.

## Placeholder Scope

This phase is intentionally not designed yet. It should go through `grill-with-docs` before implementation.

Candidate areas:

- Task assignment improvements across multiple agents.
- Parent task and subtask relationships.
- Task dependencies.
- Task status transitions beyond the current filesystem-only MVP.
- Task listing, filtering, and inspection commands.
- Better task templates for planner-created tasks.

## Out of Scope Until Grilling

- Any fixed sub-agent or parent-agent schema.
- Any orchestration that launches Claude, Codex, OpenCode, or other tools directly.
- Any database-backed task store.

## Open Decisions

- What task relationship model is needed, if any?
- Should parent/subtask metadata live in task frontmatter only?
- What commands should humans and agents use to inspect tasks?
- How much should AgentRig validate versus leaving task structure flexible?
- Should task creation become a shared skill, a CLI command, or both?

## Initial Recommendation

Keep tasks Markdown-first with YAML frontmatter. Add only the smallest structure needed for planner-to-worker handoff, and keep the body free-form so future task formats can grow without JSON schema churn.
