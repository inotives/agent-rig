# Review finding: duplicate profile context entries

Profile template edits can duplicate the `.agent-rig/_shared/context.md` entry
in both templates and deployed role instructions. After profile changes, scan
all planner, worker, and reviewer sources for duplicate context entries before
handoff.
