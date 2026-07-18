# Phase 15: Loop Observability

## Goal

Make `agent-rig status` answer the two loop questions users need before release:

- What will `agent-rig loop` do next?
- What happened in the latest worker and reviewer runs?

Phase 13 added the real loop. Phase 14 added OpenCode support. Phase 15 improves visibility into that loop before release hardening.

## Scope

- Extend existing `agent-rig status`; do not add a new command.
- Add compact loop observability to plain text status output.
- Add a top-level `loop` object to `agent-rig status --json`.
- Derive loop state from existing files:
  - `.agent-rig/_shared/tasks/*.md`
  - `.agent-rig/_shared/loop.lock`
  - `.agent-rig/<agent>/runs/*/result.json`
- Use default loop agent names only:
  - worker: `worker`
  - reviewer: `reviewer`
- Report latest run metadata only.
- Keep behavior read-only.
- Update README/docs for the new status output.
- Include fixture tests and a live mixed-tool smoke.

## Out Of Scope

- New `agent-rig loop status`, `agent-rig loop-status`, or monitor commands.
- `agent-rig status --worker <agent> --reviewer <agent>`.
- Inferring arbitrary worker/reviewer agents from roles.
- Stale-lock process probing.
- Lock cleanup.
- Dashboards, TUI, or long-running monitor mode.
- New persisted task metadata.
- Inline prompt or `last-message.md` content in status output.
- The `0.1.4` release itself.

## Accepted Decisions

### Extend `agent-rig status`

Loop observability belongs in `agent-rig status`.

Users already use status to inspect workspace health. Adding a separate command before release would create more surface area without enough benefit.

### Keep Plain Text Compact

Plain `agent-rig status` should show a compact loop section:

- lock state,
- next loop action,
- latest worker run summary,
- latest reviewer run summary.

It must not dump prompt content, raw stdout, raw stderr, or last-message bodies.

### Add A Top-Level JSON Loop Object

`agent-rig status --json` should include:

```json
{
  "loop": {
    "lock": {},
    "next_action": {},
    "latest_runs": {}
  }
}
```

The loop object is derived state. Do not persist it into `session.json`.

### Report Lock Existence And PID Only

Read `.agent-rig/_shared/loop.lock` when present and report:

- `locked: true`,
- lock path,
- raw pid text from the file.

Do not check whether the pid is alive. Do not label locks stale. Do not delete lock files.

### Use Default Worker And Reviewer Names

Phase 15 calculates loop status for:

- `worker`
- `reviewer`

Custom names are deferred. Supporting them properly would require new `status` flags or inference rules, and neither is needed before release.

### Latest Run Summaries Are Metadata-Only

Show the latest run for each default loop agent.

Each latest run summary should include:

- agent,
- role,
- tool,
- task id,
- exit status,
- final task status,
- failure summary when present,
- run path.

Do not inline `prompt.md` or `last-message.md`.

### Live Smoke Is Required

Fixture tests are necessary but not sufficient.

Before Phase 15 is complete, run a disposable live smoke using:

- Codex worker,
- OpenCode reviewer,
- real `agent-rig loop --once` runs,
- then `agent-rig status` text and JSON verification.

The smoke should prove that loop observability works after real mixed-tool runs. It does not need to re-prove every OpenCode adapter behavior from Phase 14.

## Loop JSON Contract

The exact field names should stay small and script-friendly:

```json
{
  "loop": {
    "lock": {
      "locked": false,
      "pid": null,
      "path": ".agent-rig/_shared/loop.lock"
    },
    "next_action": {
      "kind": "review",
      "task_id": "task-0001",
      "title": "Example task",
      "agent": "reviewer"
    },
    "latest_runs": {
      "worker": {
        "agent": "worker",
        "role": "worker",
        "tool": "codex",
        "task_id": "task-0001",
        "exit_status": 0,
        "final_task_status": "review",
        "failure_summary": "",
        "path": ".agent-rig/worker/runs/..."
      },
      "reviewer": null
    }
  }
}
```

`next_action.kind` values:

- `review`
- `worker`
- `idle`

If data is missing or malformed, use `null` for the affected derived value instead of failing the whole status command.

## Next Action Rules

Mirror loop priority:

1. If any task has `status: review`, next action is reviewer on the deterministic first review task.
2. Otherwise, if any task has `status: ready`, `assigned_to: worker`, and all dependencies are done, next action is worker on the deterministic first dependency-ready task.
3. Otherwise, next action is `idle`.

Do not claim or mutate tasks while calculating status.

## Acceptance Criteria

- `agent-rig status` text includes compact loop observability.
- `agent-rig status --json` includes a top-level `loop` object.
- Status reports lock existence and pid text when `.agent-rig/_shared/loop.lock` exists.
- Status reports reviewer next action before worker next action.
- Status reports worker next action when no review task exists and a dependency-ready worker task exists.
- Status reports idle when no actionable loop task exists.
- Status reports latest worker and reviewer run metadata when run records exist.
- Missing or malformed run records do not fail `agent-rig status`.
- README/docs explain the new loop observability.
- `npm test` passes.
- `git diff --check` passes.
- `node dist/index.js validate` passes.
- A disposable live Codex-worker/OpenCode-reviewer smoke verifies status text and JSON after real loop runs.

## Implementation Notes

- Implement primarily in `src/live.ts`.
- Reuse existing task parsing and run-record conventions where practical.
- Keep output compact. If a user needs full details, status should point them to run paths.
- This is observability work, not release work. The actual `0.1.4` release should be a later phase.

## Live Smoke Result

Live disposable smoke completed on July 18, 2026 in:

```text
/private/tmp/agent-rig-phase15-smoke-T0GVdP/repo
```

Disposable setup:

- `worker`: Codex
- `reviewer`: OpenCode
- disposable task: `task-0001`

Observed live loop flow:

- First worker tick moved `task-0001` from `ready` to `review` and appended `worker live smoke line` to `smoke.txt`.
- Review-stage `agent-rig status` showed:
  - `lock: unlocked path=.agent-rig/_shared/loop.lock`
  - `next: review agent=reviewer task=task-0001 title=Phase 15 smoke task`
  - latest worker run summary present
  - reviewer latest run still `none`
- Review-stage `agent-rig status --json` showed:
  - top-level `loop`
  - `loop.next_action.kind: "review"`
  - `loop.latest_runs.worker.final_task_status: "review"`
  - `loop.latest_runs.reviewer: null`
- Second reviewer tick moved `task-0001` from `review` to `done`.
- Final `agent-rig status` showed:
  - `lock: unlocked path=.agent-rig/_shared/loop.lock`
  - `next: idle`
  - latest worker run summary present
  - latest reviewer run summary present
- Final `agent-rig status --json` showed:
  - `loop.next_action.kind: "idle"`
  - `loop.latest_runs.worker.path: ".agent-rig/worker/runs/2026-07-18-222158_task-0001"`
  - `loop.latest_runs.reviewer.path: ".agent-rig/reviewer/runs/2026-07-18-222924_task-0001"`

Disposable artifact paths:

- worker run record:
  `.agent-rig/worker/runs/2026-07-18-222158_task-0001/result.json`
- reviewer run record:
  `.agent-rig/reviewer/runs/2026-07-18-222924_task-0001/result.json`
- smoke file:
  `smoke.txt`

Observed disposable file result:

```text
phase15 smoke workspace
worker live smoke line
```

Local runtime caveat:

- The managed sandbox on this machine still blocked live `codex` loop execution with `Operation not permitted` during app-server initialization.
- The successful disposable smoke therefore ran `node dist/index.js loop --once` outside that sandbox for both live ticks.
