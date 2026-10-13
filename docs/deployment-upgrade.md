# Upgrade Deployed Instructions

Run these commands in the deployed project's root with the installed AgentRig
version. Stop workflow writers before you start.

1. Run `agent-rig upgrade --dry-run` to validate tasks and list managed changes.
2. Run `agent-rig upgrade` to apply the changes.
3. Save the backup path printed by the command.

The command updates the configured instruction file for each agent whose role
is `planner`, `worker`, or `reviewer`. It uses the installed role templates.
It also updates `_shared/workflow.md` and the managed coordination and safety
sections in `_shared/context.md`. It preserves other shared context sections.

The command copies the complete `.agent-rig` directory into a new
`.agent-rig-backup-<unique suffix>/.agent-rig` directory beside the deployment
before it writes instructions. Each backup directory is private to the owner.
If backup creation fails, no managed instructions change. If a later write
fails, the command prints the backup directory for recovery.

Workflow records, session data, editable profiles, agent configuration, local
skills, local tools, and unrelated assets remain unchanged. Upgrade does not
install skills, launch an agent, or run the diagnostic loop. A repeat upgrade
validates task state and makes no changes when the instructions are current.

Invalid task state stops the upgrade. The command reports the record or store
error without repair. Ask the planner to resolve the error explicitly before
you retry. SQLite validation requires a checkpointed database with no live WAL;
it does not open a writable connection or change the database schema.

For recovery, stop workflow writers, move the current `.agent-rig` directory
aside, and copy the backup's `.agent-rig` directory to the original path. Check
that the backup copy is complete before recovery. Retain the moved directory
until you verify the restored deployment.
