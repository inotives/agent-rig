# Evidence for a Claude run inside the sandbox runner

Use these sources when a live Claude run fails inside `.agent-rig/_shared/tools/sandbox-run.sh`.

- Sandbox denials: the kernel log records each denied write with the exact path.
  Run `/usr/bin/log show --start "<start>" --end "<end>" --style compact --predicate 'sender == "Sandbox" AND eventMessage CONTAINS "deny"'`.
  Ignore lines from system processes (`runningboardd`, `PerfPowerServices`, `sharingd`, `mds`, `tccd`).
- Tool calls: the loop runs Claude with `--output-format stream-json --verbose` and keeps the
  events in `<run folder>/claude-stream.jsonl` (task-0107). `tool_use` entries are the calls,
  `tool_result` entries with `is_error` are failures, and the final `result` event lists the
  `permission_denials`. `node scripts/live-claude-smoke.mjs report` prints them per run.
  The launcher passes `--no-session-persistence`, so `~/.claude/projects` has no transcript.
- A denied `Bash` call says only "denied because Claude Code is running in don't ask mode".
  A compound command (`;`, `&&`, a pipe, `$?`) is denied even when each part is allowed.
- Claude cannot write `~/.claude/shell-snapshots`, `~/.claude/session-env`, or `~/.claude.json`
  in the sandbox. `Bash` still works (task-0107). Do not allow these paths.
- Claude creates its `Bash` folder under `/private/tmp/claude-<uid>/` (not under `$TMPDIR`).
  Set `CLAUDE_CODE_TMPDIR` to a folder that the sandbox allows.
- `claude auth status` checks the login without a model call.

Details: `docs/reports/phase-27-live-claude-test.md` (task-0105).
