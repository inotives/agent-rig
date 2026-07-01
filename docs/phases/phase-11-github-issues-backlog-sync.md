# Phase 11: GitHub Issues Backlog Sync

## Goal

Allow AgentRig to seed the local `todo` backlog from GitHub Issues in the current project repository.

## Initial Scope

- Import GitHub Issues into `.agent-rig/_shared/tasks/` as Markdown task files.
- Map imported issues to `status: todo`.
- Preserve GitHub issue source metadata in task frontmatter.
- Avoid duplicate task creation when sync is run repeatedly.
- Keep local task files as the AgentRig source of truth after import.

## Initial Recommendation

Make the first version one-way import from GitHub Issues into AgentRig tasks.

Potential command:

```bash
agent-rig tasks sync github
```

Potential frontmatter:

```yaml
type: task
status: todo
source:
  provider: github
  repo: owner/repo
  issue: 123
  url: https://github.com/owner/repo/issues/123
```

## Out of Scope Until Grilling

- Two-way sync back to GitHub.
- Closing GitHub Issues when AgentRig tasks are done.
- GitHub Projects support.
- Milestone, label, and assignee mapping.
- Non-GitHub issue trackers.

## Open Questions

1. Should sync use the `gh` CLI, direct GitHub API calls, or support both?
2. Should imported task `type` come from GitHub labels or always default to `task`?
3. Should imported issue body become the task `## Context`, or be stored under a dedicated `## Source Issue` section?
4. Should closing or editing GitHub Issues ever update existing local AgentRig tasks?
5. How should AgentRig detect duplicate imported issues across renamed task files?
