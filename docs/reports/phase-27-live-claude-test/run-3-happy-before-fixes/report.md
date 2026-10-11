# Live Claude smoke report

## task-0001: Live smoke: happy path, write hello.txt
Status: blocked

- #1 worker -> planner: blocked

## task-0002: Live smoke: repair cycle, write greeting.txt
Status: todo


## Planner actions and loop runs

- planner action: ready task-0001 (agent-rig tasks set-status task-0001 ready)
- loop run 1: worker on task-0001, task status after: blocked

## Tool calls per run

### worker/runs/2026-10-11-085159_task-0001

- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks set-status task-0001 in_progress -> error: Exit code 1
- Write /private/var/folders/d3/z2r450kd07g7_pd9dr5fdhlw0000gq/T/agent-rig-live-smoke/run-20261011-085145-5jqh/hello.txt -> ok: File created successfully at: /private/var/folders/d3/z2r450kd07g7_pd9dr5fdhlw0000gq/T/agent-rig-live-smoke/run-20261011-085145-5jqh/hello.txt (file state is cu
- Bash node check-hello.mjs; echo exit=$? -> denied: Permission to use Bash has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tool
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks --help -> ok: Usage: agent-rig tasks [command] [options]
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks block task-0001 --reason "hello.txt is written, but running 'node che -> error: Exit code 1
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0001 --sender worker --recipient planner --status blocke -> ok: Recorded handoff task-0001 #1


## Contract checks

- PASS: evidence
  - 1 run folder(s), 1 loop run event(s)
- FAIL: worker never set done
  - task-0001: the worker handoff status is blocked, not review
- PASS: one reviewer decision per round
  - each round has one reviewer decision
- PASS: reviewer left deliverables unchanged
  - hash before and after each reviewer run is equal
- PASS: no nested loop
  - no loop command in the Bash tool calls of claude-stream.jsonl (or, for a run without a stream, in last-message.md and result.json stdout)
- PASS: canonical statuses
  - all statuses are canonical
- PASS: state changes only by planner actions or the loop
  - planner action: ready task-0001
  - loop run: worker on task-0001 (task status after: blocked)

Note: tool calls come from claude-stream.jsonl in each run folder (`--output-format stream-json`). A run without that file falls back to the final message only.

Result: FAIL
