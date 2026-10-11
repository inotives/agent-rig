# Phase 27: Live Claude Test Report

This report records the live Claude runs of Phase 27, Workstream 1. See
`docs/phases/phase-27-live-claude-test-and-phase-pages.md`.

## Baseline: current launcher

Task: task-0105. Date: 2026-10-11. The launcher in `src/workflow/commands.ts`
(`runClaudeLoop`) did not change. It runs `claude -p` with the prompt on stdin
and no permission flags.

### Result in short

- The current launcher does not work. Claude starts, but the permission system
  denies every tool call that writes a file or runs a non-read-only command.
- Claude exits with status 0. It does not write `hello.txt`, does not write a
  handoff, and does not change the task status.
- The loop then sets the task to `blocked` with the reason
  `worker worker left task-0001 in_progress after claude run`. This is the
  stale-task rule in `handleLoopResult`.
- No user-level or project-level Claude setting makes the launcher work. The
  user `~/.claude/settings.json` contains only `{"theme": "dark"}`.
- The sandbox also denied one write that breaks the `Bash` tool: Claude creates
  a folder under `/private/tmp/claude-<uid>/`. The smoke script now sets
  `CLAUDE_CODE_TMPDIR` to a folder inside the workspace.

### Environment and commands

- Claude version: `2.1.296 (Claude Code)` (`claude --version`).
- Login check: `claude auth status` (no model call) returned
  `"loggedIn": true, "authMethod": "claude.ai", "subscriptionType": "team"`.
- Model that Claude used (from the session transcript): `claude-sonnet-5-5`.
  Permission mode in the transcript: `default`.
- Node: `~/.local/share/node/node-v24.21.0-darwin-arm64/bin/node`.

Run 1 (the allow-list from task-0104, narrowed as the task-0104 review asked):

```sh
node scripts/live-claude-smoke.mjs setup --max-claude-runs 2
node scripts/live-claude-smoke.mjs run-happy --max-claude-runs 2
```

The script ran this loop command (one line):

```text
.agent-rig/_shared/tools/sandbox-run.sh
  --allow-write <TMPDIR>/agent-rig-live-smoke/run-20261011-081429-gfdl
  --allow-write ~/.claude.json
  --allow-write ~/.claude/projects
  --allow-write ~/.claude/shell-snapshots
  --allow-write ~/Library/Caches/claude-cli-nodejs
  -- <node> <repo>/dist/index.js loop --once
```

Run 2 (`~/.claude.json` removed from the allow-list, `CLAUDE_CODE_TMPDIR` set
to `<workspace>/.agent-rig/claude-tmp`): the same two commands, in workspace
`run-20261011-081725-jvyt`. Allowed paths: the workspace,
`~/.claude/projects`, `~/.claude/shell-snapshots`, and
`~/Library/Caches/claude-cli-nodejs`.

Cleanup for both workspaces:

```sh
node scripts/live-claude-smoke.mjs cleanup --workspace run-20261011-081429-gfdl
node scripts/live-claude-smoke.mjs cleanup --workspace run-20261011-081725-jvyt
```

Claude processes started: 2 (one worker run in each workspace). Cost from the
session transcripts: about 0.10 USD for each run. No usage-limit message
appeared. The script counted 2 of 2 runs for each workspace, because the second
loop tick (reviewer) reserves a run even when the loop starts no agent.

### Run folder evidence

The raw run folder copies (`prompt.md`, `last-message.md`, `result.json`, and
the smoke-script marker) were removed after the phase was accepted. This report
keeps the relevant parts. The two prompts were equal except for the project
name.

`result.json` of run 1 (stdout shortened):

```json
{
  "agent": "worker",
  "role": "worker",
  "tool": "claude",
  "task_id": "task-0001",
  "command_args": ["-p"],
  "exit_status": 0,
  "final_task_status": "blocked",
  "stdout": "I couldn't do task-0001, and I haven't set its status to `review` or `blocked`. ...",
  "stderr": "",
  "error": "",
  "failure_summary": "worker worker left task-0001 in_progress after claude run"
}
```

Run 2 has the same `exit_status` (0), `final_task_status` (`blocked`),
empty `stderr`, and the same `failure_summary`.

Smoke script output of run 1 (run 2 is the same, with the other workspace):

```text
planner action: ready task-0001 (agent-rig tasks set-status task-0001 ready)
loop run 1 of 2: .../sandbox-run.sh --allow-write ... -- <node> .../dist/index.js loop --once
Ran worker worker on task-0001.
loop run 2 of 2: .../sandbox-run.sh --allow-write ... -- <node> .../dist/index.js loop --once
No actionable loop task.
Expected the loop to run the reviewer, but it ran: no agent.
exit=1
```

`last-message.md` of run 1:

> I couldn't do task-0001, and I haven't set its status to `review` or
> `blocked`. The sandbox denied every action the task needs: Creating
> `hello.txt`: both the Write tool and a shell redirect were refused for lack
> of permission. `node check-hello.mjs`: the command needs approval, and none
> was given. I never saw the script's contents because `cat` failed with an
> EPERM error on a `/private/tmp` directory. `agent-rig tasks` CLI: the
> earlier call was blocked ... Without it, I can't mark the task `blocked` or
> write a handoff.

### Tool calls that Claude tried

`claude -p` prints only the final message. The tool calls come from the
session transcript that Claude wrote to
`~/.claude/projects/<workspace slug>/<session>.jsonl` (allowed in the
sandbox). Each line is one tool call and its result.

Run 1 (worker, task-0001):

| # | Tool | Input | Result |
| - | ---- | ----- | ------ |
| 1 | `Bash` | `cat check-hello.mjs; printf 'hello world\n' > hello.txt && node check-hello.mjs; echo exit=$?` | Denied: "A variable in this command can't be checked before it runs" |
| 2 | `Bash` | `A='<node>'; "$A" .../dist/index.js tasks --help 2>&1 \| head -30` | Denied: "This Bash command contains multiple operations. The following part requires approval: ..." |
| 3 | `Bash` | `cat check-hello.mjs` | Permission allowed (read-only). Failed: `EPERM: operation not permitted, mkdir '/private/tmp/claude-503/-private-var-folders-...-run-20261011-081429-gfdl'` (sandbox) |
| 4 | `Bash` | `printf 'hello world\n' > hello.txt` | Denied: "Output redirection to '.../hello.txt' needs approval. The path is inside the working directories ... and Claude Code asks before a shell command creates, changes or removes files" |
| 5 | `Write` | `.../hello.txt`, `hello world\n` | Denied: "Claude requested permissions to write to .../hello.txt, but you haven't granted it yet." |
| 6 | `Bash` | `node check-hello.mjs` | Denied: "This command requires approval" |

Run 2 (worker, task-0001):

| # | Tool | Input | Result |
| - | ---- | ----- | ------ |
| 1 | `Bash` | `A="<node> .../dist/index.js"; $A tasks --help 2>&1 \| head -30` | Denied: "A variable in this command can't be checked before it runs" |
| 2 | `Bash` | `"<node>" ".../dist/index.js" tasks --help 2>&1 \| head -30` | Denied: "The following part requires approval: \"<node>\" \".../dist/index.js\" tasks --help 2>&1" (`head -30` did not need approval) |
| 3 | `Write` | `.../hello.txt`, `hello world\n` | Denied: write permission not granted |
| 4 | `Bash` | `node check-hello.mjs` | Denied: "This command requires approval" |

Summary of denied or failed calls:

- `Write` to a file inside the working directory: denied (permission).
- `Bash` with an output redirection (`>`): denied (permission).
- `Bash` with `node ...` (the check script): denied (permission).
- `Bash` with the AgentRig command (`"<node>" ".../dist/index.js" tasks ...`):
  denied (permission). Claude never reached the CLI, so it could not set
  `review` or `blocked`.
- `Bash` with a shell variable that holds the command: refused, because Claude
  Code cannot check a variable before it runs. An allow rule does not help
  here.
- `Bash` with a read-only command (`cat`): permission allowed, but the run
  failed in the sandbox, because Claude could not create its Bash folder under
  `/private/tmp/claude-503/` (run 1 only).
- `Read`, `Glob`, `Grep`, and `Edit` were not called.

### Task state and handoffs

- Workspace store, both runs: task-0001 went `todo` -> `ready` (planner action
  of the script) -> `in_progress` (loop) -> `blocked` (loop stale-task rule).
  The handoff table stayed empty. Claude made no task or handoff change.
- `blocked_reason`: `worker worker left task-0001 in_progress after claude run`.
- task-0002 stayed `todo`. The reviewer never ran.
- `git status` in the workspace showed no new deliverable file. `hello.txt`
  did not exist.
- The workflow store of this repository did not change: SHA-256
  `b5069d09...47cf` before and after the runs, 427 handoffs before and after.

### Sandbox denials

The kernel log records each sandbox denial. Command:

```sh
/usr/bin/log show --start "<run start>" --end "<run end>" --style compact \
  --predicate 'sender == "Sandbox" AND eventMessage CONTAINS "deny"'
```

Denials from the Claude process (`2.1.296`) and its children, run 1:

| Path | Operation | Effect |
| ---- | --------- | ------ |
| `/private/tmp/claude-503/<workspace slug>` | `file-write-create` | Breaks every `Bash` call (EPERM). Fixed in run 2 with `CLAUDE_CODE_TMPDIR`. |
| `~/.claude.json.lock` (a folder), `~/.claude.json.tmp.<pid>.<id>` | `file-write-create` | Claude cannot save `~/.claude.json`. No visible effect on the run. |
| `~/.claude/session-env/<session id>` | `file-write-create` | Logged when `Bash` started. Effect not proven (the `Bash` call failed first). |
| `~/.claude/remote-settings.json` | `file-write-data` | No visible effect. |
| `~/.claude/cache/model-catalog/*.tmp.*` | `file-write-create` | No visible effect. |
| `~/.claude/plugins/known_marketplaces_claudeai.json.lock`, `~/.claude/plugins/synced/...`, `~/.claude/skills/synced/...` | create, unlink, write | Plugin and skill sync fails. No visible effect. |
| `/private/tmp/zsh*` (4 times, from `zsh`) | `file-write-create` | zsh here-document files during the shell snapshot. No visible effect. |
| `~/.ok/logs/cli.2026-10-11.log` (from `OpenKnowledge Helper`) | `file-write-data` | A user-level plugin helper that Claude started. No visible effect. |
| `bash` | `forbidden-exec-sugid` | A child tried to run a set-user-ID program. No visible effect. |

Run 2 had the same `~/.claude.json`, plugin, skill, model-catalog, and
OpenKnowledge denials, plus `~/.claude/policy-limits.json`. It had no denial
under `/private/tmp/claude-503/`: Claude created
`<workspace>/.agent-rig/claude-tmp/claude-503/` instead. Run 2 executed no
`Bash` command (all were denied by permission), so a `Bash` command inside
the sandbox is not proven yet. The next live run (with allowed tools) must
check this, and must check whether `~/.claude/session-env` is needed.

Other lines in the log (`runningboardd`, `PerfPowerServices`, `locationd`,
`sharingd`, `mds`, `tccd`) come from system processes outside the sandbox.

### Folders that Claude needs inside the sandbox

The two runs used a wider list (see the commands above). After the review of
task-0105, the final allow-list is narrower. It allows only folders of the run
itself. The constant is `CLAUDE_PROJECT_PARENTS` in
`scripts/live-claude-smoke.mjs`. For each parent folder that exists, the
script creates `<parent>/<workspace slug>` with mode 0700 before the loop and
allows only that subfolder. The slug is the workspace path with each character
that is not a letter or a digit changed to `-`. This matches the folder names
that Claude made in both runs (a test checks the run-1 name). The script
refuses a slug longer than 200 characters, because Claude adds a hash to long
names.

| Allowed path (home-relative) | Evidence |
| ---------------------------- | -------- |
| `.claude/projects/<workspace slug>` | Claude wrote the session transcript and a `memory/` folder there. Keep it for evidence. With `--no-session-persistence` it may not be needed. |
| `Library/Caches/claude-cli-nodejs/<workspace slug>` | Claude wrote MCP logs to `mcp-logs-*` there. |

Removed after review, with the risk:

| Path | Risk |
| ---- | ---- |
| `.claude/shell-snapshots` | Claude Code sessions outside the sandbox source the `snapshot-zsh-*.sh` files in this folder before each `Bash` command. A sandboxed agent could plant code there that runs later outside the sandbox. The runs wrote no file there (no `Bash` command ran). If a later run shows "Operation not permitted" there, allow only a file or folder of that run. |
| `.claude/projects` (the whole folder) | It holds the `memory/` folders and transcripts of other projects, for example `~/.claude/projects/-<repo-slug>/memory/`. Later sessions outside the sandbox load that memory, so an agent could plant instructions there. Only the workspace subfolder is allowed now. |
| `Library/Caches/claude-cli-nodejs` (the whole folder) | Logs of other projects. Low risk. Only the workspace subfolder is allowed now. |
| `.claude/todos`, `.claude/statsig` | They do not exist and the runs did not create them. Not proven to be needed. |

The per-workspace folders stay after `cleanup`, because `cleanup` deletes only
one direct child of the fixed parent folder. The human can delete them.

Also:

- The loop environment sets `CLAUDE_CODE_TMPDIR=<workspace>/.agent-rig/claude-tmp`
  (created with mode 0700). `git status` and the reviewer fingerprint ignore
  it, because it is under `.agent-rig/`.
- `~/.claude.json` is removed from the list. Claude writes it through
  `~/.claude.json.lock` and a temporary file in the home directory. The
  runner allows only existing paths and refuses the home directory, so the
  literal allow never helped. The run works without it. A writable
  `~/.claude.json` lets an agent add MCP servers that run later outside the
  sandbox.
- The whole `~/.claude` folder, `.cache/claude` (update staging),
  `.local/state/claude` (update locks), and `.local/share/claude` (the Claude
  program versions) are removed from the list. An agent that can write there
  can plant settings, hooks, or a changed `claude` program. The script prints
  a warning if the list ever allows the whole `~/.claude` folder.
- `CLAUDE_CONFIG_DIR` pointing at an empty folder makes Claude log out
  (`claude auth status`: `"loggedIn": false`). A copy of the login credentials
  in the workspace was not tried. That needs a decision from the human.

### Effect of user-level and project-level Claude settings

Evidence comes from the session transcripts and the cache folders.

- `~/.claude/settings.json`: only `{"theme": "dark"}`. It has no permission
  rules, so it did not allow or deny a tool call. The permission mode in the
  transcript was `default`. The launcher does not depend on user settings to
  work. It does not work at all.
- `~/.claude/CLAUDE.md` (user instructions about the OpenKnowledge vault) was
  loaded: the transcript has an `instructions` attachment with
  `~/.claude/CLAUDE.md`, type `User`. Claude did not act on it.
- User MCP servers and plugins were loaded: claude.ai connectors (Claude Docs,
  Atlassian Rovo, Google Drive), plugin data servers (snowflake, databricks,
  definite), and open-knowledge. Evidence: the folders
  `~/Library/Caches/claude-cli-nodejs/<slug>/mcp-logs-*`, the MCP instruction
  attachments in the transcript, and the `OpenKnowledge Helper` sandbox
  denial. User skills (for example `open-knowledge-discovery`) were listed.
- Project level: the workspace has no `.claude/` folder, no `CLAUDE.md`, and
  no `AGENTS.md`. No parent folder of the workspace has a `CLAUDE.md` or a
  `.claude/` folder. There is no managed settings file in
  `/Library/Application Support/ClaudeCode/`.
- The user settings files did not change (`settings.json` and `CLAUDE.md`
  have the same SHA-256 before and after).

### Recommendation: `--allowedTools` for each role

Use these flags for both roles:

- `--permission-mode dontAsk`, so a call that is not allowed is denied
  without a prompt.
- `--add-dir <workspace>` and `--no-session-persistence`.
- `--strict-mcp-config` (with no `--mcp-config`), so that user MCP servers do
  not load. Consider `--setting-sources project` so that user settings do not
  apply. Check that the login still works with these flags.
- Set `CLAUDE_CODE_TMPDIR` to a folder inside the workspace, so that `Bash`
  works in the sandbox.

The prompt gives the AgentRig command as
`"<node>" "<repo>/dist/index.js"`. Claude uses that exact form. A rule
`Bash(agent-rig:*)` does not match it. Claude also tried to put the command in
a shell variable. Claude Code refuses that form even with an allow rule.

Worker (`--allowedTools`):

```text
Read Glob Grep Edit Write
Bash(agent-rig tasks:*)
Bash("<node>" "<repo>/dist/index.js" tasks:*)
Bash(node check-*.mjs)        # or Bash(node:*) if the planner accepts it
Bash(npm test:*) Bash(npm run test:*)
Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git show:*)
```

Reviewer (`--allowedTools`): the same list without `Edit` and `Write`.

Both roles (`--disallowedTools`):

```text
Bash(rm:*) Bash(sudo:*) Bash(mv:*) Bash(chmod:*) Bash(chown:*)
Bash(git push:*) Bash(git commit:*) Bash(git reset:*) Bash(git checkout:*) Bash(git clean:*)
Bash(agent-rig loop:*) Bash("<node>" "<repo>/dist/index.js" loop:*)
Bash(curl:*) Bash(wget:*) WebFetch WebSearch
```

Reviewer only (`--disallowedTools`): add `Edit Write NotebookEdit`.

Notes for the launcher task:

- Build the `<node>` and `<repo>/dist/index.js` patterns from the same values
  that the prompt prints. Test that the generated pattern matches the quoted
  command form. The rule syntax with quoted paths is not proven by this run.
- `Bash(node:*)` lets the agent run any code with `node -e`. The sandbox
  still limits writes. `Bash(node check-*.mjs)` is narrower but matches only
  this smoke scenario.
- Add one line to the prompt: "Run the AgentRig command as one literal
  command. Do not put it in a shell variable." Also tell the worker to write
  files with the `Write` or `Edit` tool, not with a shell redirection.
- Read-only commands such as `cat` and `head` did not need approval. A pipe
  such as `<cmd> 2>&1 | head -30` needs an allow rule only for `<cmd>`.

### Other findings

- The smoke script spends a run count on the reviewer tick even when the loop
  blocks the task after the worker run and starts no agent. This confirms
  follow-up 1 from the task-0104 review. Fix suggestion: after a worker tick,
  stop with the blocker if the task is `blocked`, and do not reserve a run.
- Claude left files outside the scratch workspace, in folders that the
  sandbox allowed: `~/.claude/projects/-private-var-folders-...-run-20261011-081429-gfdl/`,
  `~/.claude/projects/-private-var-folders-...-run-20261011-081725-jvyt/`, and
  the matching `<slug>/` folders in `~/Library/Caches/claude-cli-nodejs/`. The
  worker did not delete them, because they are outside the repository. The
  human can delete them.

## Launcher permissions (task-0106)

Task: task-0106. Date: 2026-10-11. `runClaudeLoop` now builds its arguments
with `claudeLoopArgs(role, cwd, cli)` in `src/workflow/commands.ts`. The rule
lists are the `CLAUDE_*` constants in the same file. `docs/tasks.md` lists the
final flags and rules for each role.

### Rule syntax check

Sources: `claude --help` (2.1.296) and the Claude Code permissions page
(`https://code.claude.com/docs/en/permissions`):

- Rules are evaluated in this order: deny, ask, allow. The first match wins.
  "A tool denied at any level" cannot be allowed by `--allowedTools`.
- Bash rules match the command text that Claude writes, after Claude splits
  compound commands. `:*` at the end equals a trailing ` *`.
- A `/path` rule from the command line is relative to the primary working
  directory. An `Edit` path rule applies to every built-in tool that edits
  files, including `Write`.
- User settings can add allow rules (rules from all scopes are merged).
  `--setting-sources project` keeps user and local settings files out.

One short `claude -p` call checked the syntax. It ran through
`.agent-rig/_shared/tools/sandbox-run.sh --allow-write <scratch folder>`, with
the real `HOME` (a temporary `HOME` makes Claude log out) and
`CLAUDE_CODE_TMPDIR` inside the scratch folder. It used the worker arguments
from `claudeLoopArgs`, with a fake `dist/index.js` that only logs its
arguments. Results:

| Step | Rules | Result |
| ---- | ----- | ------ |
| `Bash`: `"<node>" "<scratch>/dist/index.js" tasks show task-0001` | allow `Bash("<node>" "<scratch>/dist/index.js" tasks:*)` | Allowed and ran (log line). The quoted form matches. |
| `Write`: `<scratch>/hello.txt` | allow `Edit(/**)` only | Allowed. The file was written. |
| `Bash`: `node <scratch>/dist/index.js loop --once` | allow `Bash(node:*)`, deny `Bash(node *index.js loop:*)` | Allowed and ran. Claude printed a warning: a rule that mixes `*` with the trailing `:*` is matched as a literal prefix. |

- The login works with `--setting-sources project` and `--strict-mcp-config`.
- After review, `Glob(/**)` and `Grep(/**)` were removed from the allow lists.
  Claude checks file permissions against `Read(path)` and `Edit(path)` rules
  only, so `Read(/**)` already covers `Glob` and `Grep`. A unit test refuses a
  `Glob(...)` or `Grep(...)` path rule.
- The deny rules for a nested loop through `node` now use `Bash(node *index.js loop*)`
  and `Bash(node *index.js" loop*)`. A unit test refuses any rule that mixes
  `*` with `:*`.
- Deny-over-allow precedence is from the documentation only. The call did not
  prove it, because the deny rule in the call was the broken form. The live run
  of task-0107 must check that `node <path>/index.js loop` is denied.

### Settings trade-off

`--setting-sources project` keeps `~/.claude/settings.json` and
`.claude/settings.local.json` out. User-level `env`, `apiKeyHelper`, and
`model` settings no longer apply. Credentials must come from the Claude login
or from the process environment, for example `ANTHROPIC_API_KEY`. The project
settings file `.claude/settings.json` still loads and can add rules, hooks, and
`env` values.

### Limits

- The Bash rules are not a security boundary. `Bash(node:*)` and
  `Bash(npm run:*)` can write files and start child processes. Claude does not
  check those child processes against the deny rules. A deny rule matches only
  the command text that the agent writes.
- The reviewer has no edit or write tool. This is true only at the tool level.
  The reviewer can still change files through `node` or `npm run`.
- The real boundary is the sandbox runner
  `.agent-rig/_shared/tools/sandbox-run.sh` around `agent-rig loop`. Loop
  agents cannot call the sandbox runner themselves: no allow rule matches it,
  and the runner cannot start inside another sandbox.

## Live run with the fixed launcher (task-0107)

Task: task-0107. Date: 2026-10-11. Claude `2.1.296`, logged in (`claude auth
status`, `"loggedIn": true`). Model in every run: `claude-sonnet-5-5`.
Permission mode in every run: `dontAsk`. All runs went through
`.agent-rig/_shared/tools/sandbox-run.sh`. No run used `--no-sandbox`.

### Result in short

- The happy path and the repair cycle both pass with real Claude agents, after
  the fixes below. `report` printed `Result: PASS` for every contract rule.
- The first happy-path run failed. The worker could not run its check and
  could not record its blocker the way the prompt asked. Four problems caused
  this. Each problem has a fix and a regression test.
- Deny rules win over allow rules, and every nested-loop deny rule blocks a
  nested `agent-rig loop`. A dedicated probe proved this live.
- `Bash` works inside the sandbox with `CLAUDE_CODE_TMPDIR`. No new allowed
  path was needed.
- Claude runs used: 7 of the limit of 8 (1 probe, 1 failed happy-path worker
  run, 2 happy-path runs, 3 repair runs). Cost from the `result` events: about
  0.45 USD in total. No usage-limit message appeared. The last
  `rate_limit_event` was `allowed_warning` (seven-day use 0.39).

Workflow store of this repository: the SHA-256 of `sqlite3 -readonly
.agent-rig/_shared/workflow.sqlite .dump` was `9aac093c...6ec4` before and
after the runs (435 handoffs). Both scratch workspaces were deleted with
`cleanup`; the parent folder is empty. The empty per-workspace folders under
`~/.claude/projects/` and `~/Library/Caches/claude-cli-nodejs/` stay (see
"Folders that Claude needs inside the sandbox"); the human can delete them.

### Tool-call evidence

The launcher passes `--no-session-persistence`, so Claude writes no session
transcript. `--debug-file` was tried in the probe: it logs the tool name and
"Bash tool permission denied", but not the command text. It also writes a
`latest` symbolic link next to the file and logs the user shell setup. It is not
used.

The launcher now passes `--output-format stream-json --verbose`.
`runClaudeLoop` keeps the stream in `<run folder>/claude-stream.jsonl` and
writes only the text of the final `result` event to `last-message.md` and to
`stdout` in `result.json`. These files therefore hold the same text as before.
Claude writes stdout straight to the file, so a stream over 1 MiB does not
kill Claude with `ENOBUFS` (review of task-0107). A stream with JSON events but
no `result` event gives a short note that points to the file. Output with no
JSON event is kept as it is. The smoke script reads the
stream: `report` lists each tool call with its result (`ok`, `error`, or
`denied`), and the nested-loop check now reads the `Bash` commands of the
stream instead of the prose of the final message. This removes the false
positive from the task-0104 review.

### Commands

```sh
# probe (one claude -p call, see "Deny precedence and nested loop")
.agent-rig/_shared/tools/sandbox-run.sh --allow-write <probe> -- claude <worker args> \
  --output-format stream-json --verbose --debug-file <probe>/debug.log   # prompt on stdin

node scripts/live-claude-smoke.mjs setup --max-claude-runs 7      # run-20261011-085145-5jqh
node scripts/live-claude-smoke.mjs run-happy                       # failed, 1 run
node scripts/live-claude-smoke.mjs report --workspace run-20261011-085145-5jqh
node scripts/live-claude-smoke.mjs cleanup --workspace run-20261011-085145-5jqh
# fixes, npm run build
node scripts/live-claude-smoke.mjs setup --max-claude-runs 6      # run-20261011-085622-xsvx
node scripts/live-claude-smoke.mjs run-happy                       # passed, 2 runs
node scripts/live-claude-smoke.mjs run-repair                      # passed, 3 runs
node scripts/live-claude-smoke.mjs report                          # Result: PASS
node scripts/live-claude-smoke.mjs cleanup
```

The raw run folder copies (the probe, the happy-path run before the fixes, and
the happy-path and repair run) were removed after the phase was accepted. This
report keeps the relevant parts.

### First happy-path run (before the fixes)

Tool calls of the worker (from `claude-stream.jsonl`):

| # | Call | Result |
| - | ---- | ------ |
| 1 | `"<node>" "<repo>/dist/index.js" tasks set-status task-0001 in_progress` | Error: the loop already set `in_progress`, and the CLI refuses `in_progress` to `in_progress` for a loop worker. |
| 2 | `Write hello.txt` | OK. |
| 3 | `node check-hello.mjs; echo exit=$?` | Denied. `Bash(node:*)` is allowed, but the compound command with `$?` cannot be checked. The worker did not retry the simple command. |
| 4 | `"<node>" "<repo>/dist/index.js" tasks --help` | OK. |
| 5 | `... tasks block task-0001 --reason "..."` | Error: "Only the planner can set a task to blocked". The prompt told the worker to leave the task `blocked`. |
| 6 | `... tasks handoff task-0001 --sender worker --recipient planner --status blocked ...` | OK. |

The loop then blocked the task with the stale-task message
`worker worker left task-0001 in_progress after claude run`, not with the
reason from the worker handoff. The smoke script stopped after the worker run
and did not spend a run on the reviewer (new `workerTickStop`).

### Problems found and fixes

| # | Problem (evidence) | Fix | Regression test |
| - | ------------------ | --- | --------------- |
| 1 | The worker ran `node check-hello.mjs; echo exit=$?`. Claude Code denied it, although `Bash(node:*)` is allowed. (run 3, call 3) | `claudePromptNote` in `src/workflow/commands.ts`: run each `Bash` command as one simple command, with no `;`, `&&`, `\|\|`, pipe, redirection, or shell variable such as `$?`; retry a denied command once in its simplest form. | `test/workflow/loop.test.mjs`: "claude prompt tells the agent to run each Bash command as one simple command" |
| 2 | The prompt asked the worker to leave the task `blocked` and the reviewer to leave it `ready`. The CLI refuses both for loop agents (`validateTaskTransition`). (run 3, call 5) | `lifecycleInstructions` in `src/workflow/commands.ts`: the worker sets `review` and records a `review` handoff, or records a `blocked` handoff to `planner`. The reviewer records exactly one decision (`approved` to `planner`, `changes_requested` to `worker`, `blocked` to `planner`) and leaves the task in `review`. | `test/workflow/loop.test.mjs`: "loop prompt states the task outcome that the CLI accepts for each role" |
| 3 | After a worker `blocked` handoff, the loop blocked the task with the stale-task message, not the worker reason. (run 3) | `handleLoopResult`: a new `blocked` handoff from the agent blocks the task with `<role> <name> recorded a blocked handoff for <task>: <first line>`. | `test/workflow/loop.test.mjs`: "a worker blocked handoff ..." and "a reviewer blocked handoff ..." |
| 4 | The reviewer could not record `blocked` at all: the `reviewer -> planner: approved` route hid the `blocked` route in `validateNewHandoff`. Found by the regression test for problem 3. The contract allows `blocked` for the reviewer. | `src/workflow/model.ts`: the worker and the reviewer can always send `blocked` to `planner`. The error now names every accepted decision, for example `expected approved or blocked`. | `test/workflow/regression.test.mjs`: "task transitions and handoffs enforce the planner-manager contract" |
| 5 | The worker template said "Set `blocked` only for a real blocker" and "manually set the task status to `in_progress`". The CLI refuses both from a loop worker. (run 3, calls 1 and 5) | `templates/profiles/worker.md`: write a `blocked` handoff to `planner`; set `in_progress` only when the task is not already `in_progress`. `templates/profiles/reviewer.md`: name the three decision routes and "Leave the task in `review`". | `test/cli/init.test.mjs`: "worker and reviewer instructions name the blocked handoff and the reviewer decision routes" |
| 6 | Every reviewer run first called `tasks handoff --help` and got "Task not found: --help" (exit 1). (run 4, all reviewer runs) | `runTasks`: `agent-rig tasks <command> --help` (or `-h`) prints the tasks help. | `test/cli/init.test.mjs`: "tasks <command> --help prints the tasks help" |
| 7 | The smoke script spent a run on a reviewer tick after the loop had blocked the task (task-0104 review, note 1). | `scripts/live-claude-smoke.mjs`: `workerTickStop` stops after a worker run that does not leave the task in `review`, with the blocker reason. `planWorkerReview` is removed. | `test/integration/live-claude-smoke.test.mjs`: "workerTickStop ..." |
| 8 | Tool calls were not visible (`--no-session-persistence`). | Stream-json evidence, see "Tool-call evidence". | `test/workflow/loop.test.mjs`: two stream tests; `test/integration/live-claude-smoke.test.mjs`: `streamToolCalls`, `readRunTexts`, `renderReport` tests |

The smoke script now keeps the worker and reviewer instructions that
`agent-rig init` and `agent-rig add` render from `templates/`, and copies only
the shared context (the contract has no template). The second workspace
therefore tested the fixed templates. This repository's `.agent-rig/` files did
not change. The planner must update them:

```sh
agent-rig profiles update worker --agent worker --apply      # .agent-rig/_shared/profiles/worker.md, .agent-rig/worker/instructions.md
agent-rig profiles update reviewer --agent reviewer --apply  # .agent-rig/_shared/profiles/reviewer.md, .agent-rig/reviewer/instructions.md
```

Other observations, not fixed:

- In the repair worker run, Claude first wrote the CLI path as
  `"<node>" "<node folder>/../../../../workspaces/agent-rig/dist/index.js"`.
  The allow rule did not match, so Claude Code denied it. Claude then used the
  literal form from the prompt. The rule did what it must do.
- The reviewer of the last run first tried
  `tasks handoff ... --from reviewer --to planner --decision approved`
  (wrong option names), got an error, read `tasks` help, and then used the
  right options.

### Contract rules

Evidence: `report` output (`run-4-happy-and-repair/report.md`), the workspace
store (handoffs below), the marker events, and `claude-stream.jsonl` of each
run.

| Rule | Result | Evidence |
| ---- | ------ | -------- |
| The worker records a `review` handoff and does not set `done`. | Pass | task-0001 #1 and task-0002 #3 are `worker -> reviewer: review`. The worker streams have `tasks set-status <id> review` and `tasks handoff ... --status review`, and no `done` or `tasks done` call. |
| The reviewer records exactly one decision per review and does not edit the implementation. | Pass | One reviewer handoff per round: task-0001 #2 `approved`; task-0002 #2 `changes_requested`, #4 `approved`. The reviewer streams have no `Write` or `Edit` call, only `node check-*.mjs`, `od -c`, and `tasks` commands. The deliverable hash before and after each reviewer run is equal. |
| No child agent starts a nested AgentRig loop. | Pass | No `Bash` command in the five streams matches the loop pattern. The probe proved that the deny rules block every command form (see below). |
| Handoffs use the canonical vocabulary. | Pass | Handoff statuses: `review`, `changes_requested`, `approved`. Task statuses: `todo`, `ready`, `in_progress`, `review`, `done`. |
| The planner-manager owns task state and dependencies. | Pass | `done` came only from the harness planner action (`tasks done`). The loop set `in_progress`. The agents set only `review` (the worker). No agent changed a dependency. |
| In the repair cycle, the same worker repairs, and the next review approves. | Pass | task-0002: reviewer #2 `changes_requested` (planted `Good morning`, check exit 1), worker run by agent `worker` wrote `good morning` and recorded #3 `review`, reviewer #4 `approved`, then the planner action `done`. |

Handoffs of the passing workspace:

```text
task-0001 #1 worker -> reviewer review   Created hello.txt ... Ran node check-hello.mjs: exit 0 ...
task-0001 #2 reviewer -> planner approved Approved. hello.txt contains exactly 'hello world' and a newline (verified with od -c) ...
task-0002 #1 worker -> reviewer review   Wrote greeting.txt. `node check-greeting.mjs` passes.   (harness, planted flaw)
task-0002 #2 reviewer -> worker changes_requested greeting.txt contains 'Good morning' (capital G) ... node check-greeting.mjs exits 1 ...
task-0002 #3 worker -> reviewer review   Fixed greeting.txt: now exactly 'good morning' ... exits 0 ...
task-0002 #4 reviewer -> planner approved Verified greeting.txt is exactly 'good morning' plus newline (od -c) ...
```

### Deny precedence and nested loop

One `claude -p` probe ran through the sandbox runner with the generated worker
arguments (`claudeLoopArgs("worker", <probe>, '"<node>" "<probe>/dist/index.js"')`)
and a fake `dist/index.js` that only logs its arguments to `calls.log`. Claude
ran each command as one literal `Bash` call.

| # | Command | Matching rules | Result |
| - | ------- | -------------- | ------ |
| 1 | `"<node>" "<probe>/dist/index.js" tasks show task-0001` | allow `Bash("<node>" "<probe>/dist/index.js" tasks:*)` | Allowed, ran (logged). |
| 2 | `node <probe>/dist/index.js loop --once` | allow `Bash(node:*)`, deny `Bash(node *index.js loop*)` | Denied. Deny wins over allow. |
| 3 | `"<node>" "<probe>/dist/index.js" loop --once` | deny `Bash("<node>" "<probe>/dist/index.js" loop:*)` | Denied. |
| 4 | `node "<probe>/dist/index.js" loop --once` | allow `Bash(node:*)`, deny `Bash(node *index.js" loop*)` | Denied. Deny wins over allow. |
| 5 | `agent-rig loop --once` | deny `Bash(agent-rig loop:*)` | Denied. |
| 6 | `git status --short` | allow `Bash(git status:*)` | Allowed, ran inside the sandbox. |
| 7 | `node -e "console.log(require('os').tmpdir())"` | allow `Bash(node:*)` | Allowed, ran inside the sandbox. |
| 8 | `Write <probe>/hello.txt` | allow `Edit(/**)` | Allowed, file written. |
| 9 | `git checkout -- hello.txt` | deny `Bash(git checkout:*)` | Denied. |

`calls.log` has one line, `["tasks","show","task-0001"]`, so no loop command
reached the program. The `permission_denials` of the `result` event list calls
2, 3, 4, 5, and 9.

Limit: the deny rules match the command text only (see "Limits"). For example
`node -e` with `child_process` can still start a loop. The sandbox runner is
the boundary.

### Bash and Claude folders inside the sandbox

- `Bash` works in the sandbox: the probe and all five live runs ran `node`,
  `git`, `od`, and the AgentRig command (`outcome=ok` in the debug log of the
  probe; tool results in the streams).
- `CLAUDE_CODE_TMPDIR` works: no denial under `/private/tmp/claude-503/`.
- Kernel log denials during the live runs, all without visible effect:
  `~/.claude/shell-snapshots/snapshot-zsh-*.sh` (the shell snapshot fails;
  `Bash` still runs), `~/.claude/session-env/<session>`, `~/.claude.json.lock`
  and `~/.claude.json.tmp.*`, `~/.claude/remote-settings.json`,
  `~/.claude/policy-limits.json`, `~/.claude/cache/model-catalog/*`,
  `~/.claude/sessions` (mode change), and `/private/tmp/cc-socks-503`
  (cross-session messaging is off). No path was added to the allow-list.
  `shell-snapshots`, `session-env`, and `~/.claude.json` stay denied.

### The state after `changes_requested`

Evidence from the repair cycle: after reviewer handoff #2
(`changes_requested`), the task stayed in `review` (marker: "loop run 3:
reviewer on task-0002, task status after: review"). The next `loop --once`
selected the same task for the worker, because `selectLoopTask` routes a
`review` task whose last handoff is a reviewer or planner `changes_requested`
to the worker. The loop set `in_progress`, and the worker repaired and set
`review`. No planner state action was needed.

If the planner had set the task to `in_progress` as the contract says, the
loop would not select it: `selectLoopTask` picks `review` tasks and
`nextActionableTask` picks `ready` tasks only. The repair would stop.

Recommendation: change the contract text, not the loop. For example: "For
`changes_requested`, the task stays in `review`. `agent-rig loop` sends it to
the same worker and sets `in_progress`. Outside the loop, the planner-manager
returns the task to `in_progress` and sends the findings to the same worker."
This keeps the repair automatic and matches the code. The planner decides.

### CLI gap: `changes_requested` from the reviewer to the planner

`validateNewHandoff` (`src/workflow/model.ts`) accepts `changes_requested`
only on `reviewer -> worker` and `planner -> worker`. The contract says that
the planner-manager records the decision. In the live repair cycle, the reviewer
recorded `changes_requested` to `worker`, and the loop used it as expected.
`selectLoopTask` does not check the recipient.

Recommendation: keep the CLI routes. Change the contract text so that the
reviewer writes the decision handoff (`approved` and `blocked` to `planner`,
`changes_requested` to `worker`), and the planner-manager acts on it with task
state changes. A `reviewer -> planner: changes_requested` route would add a
second form of the same decision for no gain. The planner decides. This task
did not change the `changes_requested` routes or the loop.
