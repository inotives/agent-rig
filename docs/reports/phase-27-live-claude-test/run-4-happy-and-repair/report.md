# Live Claude smoke report

## task-0001: Live smoke: happy path, write hello.txt
Status: done

- #1 worker -> reviewer: review
- #2 reviewer -> planner: approved

## task-0002: Live smoke: repair cycle, write greeting.txt
Status: done

- #1 worker -> reviewer: review
- #2 reviewer -> worker: changes_requested
- #3 worker -> reviewer: review
- #4 reviewer -> planner: approved

## Planner actions and loop runs

- planner action: ready task-0001 (agent-rig tasks set-status task-0001 ready)
- loop run 1: worker on task-0001, task status after: review
- loop run 2: reviewer on task-0001, task status after: review
- planner action: done task-0001 (agent-rig tasks done task-0001 --message Approved by the reviewer; accepted by the planner.)
- harness-worker-pass: task-0002
- planner action: review task-0002 (agent-rig tasks set-status task-0002 review)
- loop run 3: reviewer on task-0002, task status after: review
- loop run 4: worker on task-0002, task status after: review
- loop run 5: reviewer on task-0002, task status after: review
- planner action: done task-0002 (agent-rig tasks done task-0002 --message Repair approved by the reviewer; accepted by the planner.)

## Tool calls per run

### worker/runs/2026-10-11-085628_task-0001

- Write /private/var/folders/d3/z2r450kd07g7_pd9dr5fdhlw0000gq/T/agent-rig-live-smoke/run-20261011-085622-xsvx/hello.txt -> ok: File created successfully at: /private/var/folders/d3/z2r450kd07g7_pd9dr5fdhlw0000gq/T/agent-rig-live-smoke/run-20261011-085622-xsvx/hello.txt (file state is cu
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks show task-0001 -> ok: ---
- Bash node check-hello.mjs -> ok: hello.txt ok
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks --help -> ok: Usage: agent-rig tasks [command] [options]
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks set-status task-0001 review -> ok: Updated task-0001: status=review
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0001 --sender worker --recipient reviewer --status revie -> ok: Recorded handoff task-0001 #1

### worker/runs/2026-10-11-085714_task-0002

- Write /private/var/folders/d3/z2r450kd07g7_pd9dr5fdhlw0000gq/T/agent-rig-live-smoke/run-20261011-085622-xsvx/greeting.txt -> ok: The file /private/var/folders/d3/z2r450kd07g7_pd9dr5fdhlw0000gq/T/agent-rig-live-smoke/run-20261011-085622-xsvx/greeting.txt has been updated successfully. (fil
- Bash node check-greeting.mjs -> ok: greeting.txt ok
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks --help -> ok: Usage: agent-rig tasks [command] [options]
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/../../../../workspaces/agent-rig/dist/index.js" tasks set-status t -> denied: Permission to use Bash has been denied because Claude Code is running in don't ask mode. IMPORTANT: You *may* attempt to accomplish this action using other tool
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks set-status task-0002 review -> ok: Updated task-0002: status=review
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0002 --sender worker --recipient reviewer --status revie -> ok: Recorded handoff task-0002 #3

### reviewer/runs/2026-10-11-085638_task-0001

- Bash node check-hello.mjs -> ok: hello.txt ok
- Bash od -c hello.txt -> ok: 0000000    h   e   l   l   o       w   o   r   l   d  \n                
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff --help -> error: Exit code 1
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0001 -> error: Exit code 1
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0001 --sender reviewer --recipient planner --status appr -> ok: Recorded handoff task-0001 #2

### reviewer/runs/2026-10-11-085702_task-0002

- Bash node check-greeting.mjs -> error: Exit code 1
- Bash od -c greeting.txt -> ok: 0000000    G   o   o   d       m   o   r   n   i   n   g  \n            
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff --help -> error: Exit code 1
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks -> ok: Usage: agent-rig tasks [command] [options]
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0002 --sender reviewer --recipient worker --status chang -> ok: Recorded handoff task-0002 #2

### reviewer/runs/2026-10-11-085727_task-0002

- Bash node check-greeting.mjs -> ok: greeting.txt ok
- Bash od -c greeting.txt -> ok: 0000000    g   o   o   d       m   o   r   n   i   n   g  \n            
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff --help -> error: Exit code 1
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0002 --from reviewer --to planner --decision approved -- -> error: Exit code 1
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks -> ok: Usage: agent-rig tasks [command] [options]
- Bash "/Users/toni.lim/.local/share/node/node-v24.21.0-darwin-arm64/bin/node" "/Users/toni.lim/workspaces/agent-rig/dist/index.js" tasks handoff task-0002 --sender reviewer --recipient planner --status appr -> ok: Recorded handoff task-0002 #4


## Contract checks

- PASS: evidence
  - 5 run folder(s), 5 loop run event(s)
- PASS: worker never set done
  - worker handoffs have status review
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
  - planner action: done task-0001
  - planner action: review task-0002
  - planner action: done task-0002
  - loop run: worker on task-0001 (task status after: review)
  - loop run: reviewer on task-0001 (task status after: review)
  - loop run: reviewer on task-0002 (task status after: review)
  - loop run: worker on task-0002 (task status after: review)
  - loop run: reviewer on task-0002 (task status after: review)

Note: tool calls come from claude-stream.jsonl in each run folder (`--output-format stream-json`). A run without that file falls back to the final message only.

Result: PASS
