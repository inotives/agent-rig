# Filesystem-Only Watch Loop

Phase 5 implements `agent-rig watch` as a filesystem-only loop instead of launching Claude, Codex, OpenCode, or shell commands. This lets the MVP prove queue claiming, prompt assembly, run records, blocker state, and handoff logs before AgentRig depends on real subscription CLI invocation semantics.

## Considered Options

- Launch configured tools from `watch` in Phase 5.
- Keep `watch` filesystem-only and use a fake adapter for MVP tests and demos.

## Consequences

- Phase 5 can be tested deterministically with `agent-rig watch --once`.
- Real tool invocation remains a later phase after the filesystem contract is stable.
