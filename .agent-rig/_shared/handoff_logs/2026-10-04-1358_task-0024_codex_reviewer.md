---
agent: reviewer
role: reviewer
tool: codex
task: task-0024
task_title: "Phase 16: add Markdown to SQLite workflow migration"
status: findings
storage_status: migrated
migrated_to: sqlite
migrated_at: 2026-10-04T14:53:28.966Z
---

## Findings

- `src/workflow.ts:99-100`: 🔴 bug: migration validates dependency shape but not
  dependency existence; a fixture with `depends_on: [task-9999]` migrated,
  switched the provider to SQLite, and installed a dangling dependency. Preflight
  must reject unknown/self-invalid dependency IDs before creating or installing
  the database, with a regression test proving Markdown remains authoritative.
- `src/workflow.ts:34`: 🟡 risk: the phase document says an already-SQLite
  workspace reports migration complete, but this path returns a non-zero error.
  Handle the already-migrated state explicitly (or update the canonical phase
  decision before changing behavior).

## Verification

- `npm test`: 89 passed, 0 failed.
- `git diff --check`: passed per worker handoff.
- Direct temporary-workspace checks reproduced both findings.
- Active Phase 16 workspace was not migrated.
