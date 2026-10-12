# Planner Child Execution

The planner launches one worker, then one independent reviewer. AgentRig stores
tasks and handoffs. It does not run this cycle through a wrapper runner.
Provider flags belong in the launch command. Keep them out of shared role
instructions and generated task prompts.

## Prepare the launch

1. Resolve the deployed project's repository root. Do not use the AgentRig
   source checkout as the default. Use the same project workspace for both children.
2. Read the task and check its dependencies. The planner sets an eligible worker
   task to `in_progress` before launch.
3. Create a separate diagnostic directory outside the repository for each attempt.
   Use absolute paths. Keep this directory out of the review diff.
4. Generate the prompt with the read-only command below. Save stdout, stderr,
   and the exit status separately. Do not launch a child if generation fails.
5. Read the saved prompt. Pass it to the provider through stdin. Do not put the
   complete prompt in a command argument.

This example uses the project-local CLI in the AgentRig source repository.
For an installed deployment, use its `agent-rig` command from the project root.
Replace the example paths and task ID before use. Run each step separately.

```sh
repo_root='/absolute/path/to/project'
run_dir='/absolute/path/to/diagnostics/task-0121-worker-attempt-1'
task_id='task-0121'
child_agent='worker'
mkdir -p "$run_dir"
cd "$repo_root"
node dist/index.js tasks prompt "$task_id" --agent "$child_agent" > "$run_dir/prompt.md" 2> "$run_dir/prompt.stderr"
prompt_status=$?
printf '%s\n' "$prompt_status" > "$run_dir/prompt.exit-status"
```

Continue only when `prompt_status` is `0`. The command emits Markdown on stdout
and the prompt size on stderr. It does not launch an agent or change task state.
Do not pipe prompt generation directly into a child: a generation failure must
stop the launch.

For review, the planner first records the valid worker handoff and sets `review`.
Set `child_agent='reviewer'` and use a new diagnostic directory. Generate a new
prompt. The reviewer prompt requires a current worker handoff and includes the
current staged, unstaged, and untracked changes. For a repair, the planner records
the findings, sets `in_progress`, and generates a new worker prompt.

## Codex

Check `codex --version` and `codex exec --help` before launch. The installed CLI
must support `--approve-for-me`. The following command uses `workspace-write`
and routes approval requests through automatic review. Automatic review can
reject an action. This mode does not grant unrestricted filesystem access.

```sh
codex exec --ephemeral --ignore-user-config \
  --cd "$repo_root" --sandbox workspace-write --approve-for-me \
  --output-last-message "$run_dir/handoff.md" - \
  < "$run_dir/prompt.md" > "$run_dir/child.stdout" 2> "$run_dir/child.stderr"
child_status=$?
printf '%s\n' "$child_status" > "$run_dir/child.exit-status"
```

Use the provider sandbox directly. Do not wrap this child launch in
`.agent-rig/_shared/tools/sandbox-run.sh`. The child uses the deployed project's
repository root. It must follow the worker or reviewer role limits in the prompt.
These commands document the installed CLI interface. They do not establish live
worker or reviewer validation for this task.

## Claude and OpenCode

Claude and OpenCode direct execution are untested here. Earlier loop tests do
not validate this direct execution contract. Do not claim live validation.

For either provider, select a supported headless command from the installed
CLI's help. Confirm that it accepts the saved prompt through stdin, uses the
deployed project's repository root, and returns control without an interactive
approval prompt. Apply the provider's workspace and permission policy directly.
Keep its flags in the launch command. Capture stdout, stderr, exit status, and
the final Markdown handoff. Use the same role limits and handoff fields as Codex.
If the installed CLI cannot meet these requirements, stop and return control to
the planner. Do not substitute a loop or add a wrapper runner.

## Diagnostics and failure

For each attempt, save these files in the diagnostic directory:

- `command.txt`: the exact prompt and child commands, with resolved paths,
  arguments, stdin path, and output paths. Record the working directory, task
  ID, role, provider version, start time, end time, and timeout limit.
- `provider-help.txt`: the installed provider's headless command help output.
- `prompt.md`, `prompt.stderr`, and `prompt.exit-status`: the complete prompt
  command output and exit status, including generation errors and size warnings.
- `child.stdout`, `child.stderr`, and `child.exit-status`: the complete child
  output and exit status. For interruption or timeout, record the signal and
  reason when no exit status is available.
- `handoff.md`: the final child response, if present. Preserve partial output.

Do not record credentials in the commands or diagnostic metadata.
After the child exits, validate the handoff decision, recipient, required fields,
and evidence. A zero exit status alone does not prove task completion.

If the child fails, times out, is interrupted, or returns no valid handoff, save
diagnostics and return control to the planner. Do not retry automatically. Do
not mark the task `done`. Keep the task in its current eligible state. The planner
inspects any partial diff and decides whether to retry or ask the human. Use
`blocked` only for a real task or environment blocker. Child failure does not
authorize the next task to start.
