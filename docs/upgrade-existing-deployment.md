# Upgrade an Existing AgentRig Deployment

Use this procedure when a project already has a `.agent-rig/` directory.
The procedure is manual and backup-first. It does not edit SQLite directly.

## 1. Identify the deployment

Run these commands from the project root:

```bash
agent-rig --version
agent-rig doctor
agent-rig validate
agent-rig status
sed -n '1,160p' .agent-rig/_shared/agent-rig.json
git status --short -- .agent-rig
```

Record these values before the upgrade:

- `workspace_version`
- `scaffold_version`
- `created_by.version`
- `workflow_store.provider`
- the task and handoff counts from `agent-rig status`

Treat the deployment as older when its generated instructions use an older
role or handoff vocabulary, required files are missing, or its recorded
scaffold version is older than the release being installed. Do not infer the
live provider from folder names. Read `workflow_store.provider`.

## 2. Create rollback evidence

Stop AgentRig loops and other agents that can write workflow state. Create a
full filesystem backup before changing any generated file:

```bash
stamp=$(date +%Y%m%d-%H%M%S)
backup=".agent-rig.backup-$stamp"
cp -a .agent-rig "$backup"
```

Keep the backup until the smoke cycle passes. Confirm that it contains the
deployment configuration, profiles, shared context, local skills and tools,
tasks, handoff logs, notes, credentials placeholders, and (when present)
`_shared/workflow.sqlite`:

```bash
test -f "$backup/_shared/agent-rig.json"
test -d "$backup/_shared/tasks"
test -d "$backup/_shared/handoff_logs"
```

For a SQLite deployment, also create a consistent database snapshot through
AgentRig:

```bash
mkdir -p "$backup/_shared/backups"
agent-rig workflow backup --output "$backup/_shared/backups/workflow.sqlite"
```

The command validates the snapshot. Do not use `cp` on the live SQLite file as
a substitute for this command.

## 3. Update generated files only

Review the built-in profile update before applying it:

```bash
agent-rig profiles update planner --agent planner
agent-rig profiles update worker --agent worker
agent-rig profiles update reviewer --agent reviewer
```

Apply only the profiles that exist in this deployment and only after the
preview is correct:

```bash
agent-rig profiles update planner --agent planner --apply
agent-rig profiles update worker --agent worker --apply
agent-rig profiles update reviewer --agent reviewer --apply
```

The apply operation creates profile backups. If the release also changes
generated shared context or role instructions, compare the release files with
the backup and copy only those generated files. Preserve project-specific
instructions and accepted local decisions.

Never overwrite these local deployment records:

- `.agent-rig/*/skills/`
- `.agent-rig/*/tools/`
- `.agent-rig/_shared/skills/`
- `.agent-rig/_shared/tools/`
- `.agent-rig/_shared/tasks/`
- `.agent-rig/_shared/handoff_logs/`
- `.agent-rig/_shared/notes/`
- `.agent-rig/_shared/workflow.sqlite`

In SQLite mode, SQLite is the live source of truth. Task and handoff Markdown
is historical reference only. Do not rewrite, rename, import, or delete those
historical records during this upgrade.

## 4. Validate the upgraded deployment

Run the checks again:

```bash
agent-rig validate
agent-rig doctor
agent-rig agents
agent-rig status
```

Confirm that:

1. `validate` reports no new errors.
2. The provider in `.agent-rig/_shared/agent-rig.json` is unchanged.
3. The task and handoff counts match the pre-upgrade record.
4. Local skills, tools, task files, handoff logs, and notes still exist.
5. The generated instructions use the planner-manager, worker, reviewer, and
   `review`/`changes_requested`/`approved` handoff contract.

If any check fails, stop. Preserve the failed deployment for diagnosis and
roll back from the backup in Section 6.

## 5. Report legacy records and run one smoke cycle

For a SQLite deployment, preview the relationship between live SQLite records
and historical Markdown records:

```bash
agent-rig workflow rebuild --json
```

Treat conflicts, orphaned handoffs, and records that would be lost as a report
to the maintainer. Do not add `--replace`. Do not edit SQLite or historical
Markdown to make the report clean.

Then run one complete worker-reviewer smoke cycle using a suitable existing
task or a disposable test task:

1. The planner selects and claims a dependency-ready task.
2. The worker implements the scoped change and records a `review` handoff.
3. The reviewer checks the change and records `approved`, or records
   `changes_requested` and the worker repairs it before another review.
4. The planner performs the final check and changes the task to `done` only
   after approval.
5. `agent-rig status` and `agent-rig tasks show <task-id>` show the expected
   final state and handoff trail.

This guide does not claim live Claude verification. Live Claude loop testing
requires a later phase with Claude installed and authenticated.

## 6. Roll back if required

Stop all AgentRig writers. Keep the failed deployment and its diagnostics, then
move it aside and restore the backup:

```bash
failed=".agent-rig.failed-$stamp"
mv .agent-rig "$failed"
cp -a "$backup" .agent-rig
```

Run `agent-rig validate`, `agent-rig doctor`, and `agent-rig status` after the
restore. The backup directory is the rollback evidence. Remove it only after
the maintainer confirms the upgrade and smoke cycle are complete.
