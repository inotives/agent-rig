# Phase 11: GitHub Issues Backlog Sync

## Goal

Allow AgentRig to seed the local `todo` backlog from GitHub Issues in the current project repository.

## Initial Scope

- Import GitHub Issues into `.agent-rig/_shared/tasks/` as Markdown task files.
- Map imported issues to `status: todo`.
- Preserve GitHub issue source metadata in task frontmatter.
- Avoid duplicate task creation when sync is run repeatedly.
- Keep local task files as the AgentRig source of truth after import.
- Keep GitHub sync optional. AgentRig must not require GitHub or `gh` for normal local task workflows.
- Document imported issue parent/child behavior in user-facing task docs.

## Initial Recommendation

Make the first version one-way import from GitHub Issues into AgentRig tasks.

Potential command:

```bash
agent-rig tasks sync github
agent-rig tasks sync github --label agent-rig
agent-rig tasks sync github --limit 20
agent-rig tasks sync github --dry-run
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

## Acceptance Criteria

- `agent-rig tasks sync github` imports open GitHub Issues into `.agent-rig/_shared/tasks/`.
- GitHub sync uses the local `gh` CLI only.
- Normal AgentRig commands do not require `gh`.
- Missing or unauthenticated `gh` fails with a clear setup message.
- Imported issues become `status: todo` tasks with no default `assigned_to`.
- Imported tasks include `source.provider`, `source.repo`, `source.issue`, `source.url`, `source.state_at_import`, and `source.imported_at`.
- Imported tasks preserve GitHub labels in source metadata.
- Imported task `type` defaults to `task`, with recognized label mapping for `bug`, `doc`, `research`, `chore`, `epic`, and `story`.
- Imported issue body is written under `## Source Issue`, not directly into `## Context`.
- Imported tasks include a context note that planner review is needed before moving to `ready`.
- Issue comments are not imported.
- Repeat sync skips already-imported issues by source metadata.
- Sync does not overwrite existing local task files.
- `--label <label>` filters imported issues by GitHub label.
- `--limit <number>` limits the number of fetched/imported open issues, defaulting to 100.
- `--dry-run` previews created/skipped tasks without writing files.
- `--json` emits structured sync results.
- `docs/tasks.md` and `docs/project_specs.md` document GitHub issue import behavior.
- Tests cover gh failure, import, duplicate skip, dry run, label/type mapping, JSON output, and local source-of-truth behavior.

## Out of Scope

- Two-way sync back to GitHub.
- Closing GitHub Issues when AgentRig tasks are done.
- Post-merge GitHub issue updates or closure.
- Importing GitHub issue comments.
- GitHub Projects support.
- Milestone, label, and assignee mapping.
- Non-GitHub issue trackers.

## Open Questions

1. Should sync use the `gh` CLI, direct GitHub API calls, or support both? Accepted: use `gh` CLI only, and require it only when GitHub sync is invoked.
2. Should imported task `type` come from GitHub labels or always default to `task`? Accepted: default to `task`, with simple recognized label mapping.
3. Should imported issue body become the task `## Context`, or be stored under a dedicated `## Source Issue` section? Accepted: store the original GitHub body under `## Source Issue`.
4. Should closing or editing GitHub Issues ever update existing local AgentRig tasks? Accepted: sync should not automatically overwrite existing local tasks after import.
5. How should AgentRig detect duplicate imported issues across renamed task files? Accepted: detect duplicates by source provider/repo/issue frontmatter, not filename.

## Accepted Decisions

### GitHub Sync Is Optional and Uses `gh`

Phase 11 should use the GitHub CLI as the only GitHub backend.

```bash
agent-rig tasks sync github
```

AgentRig should not require GitHub, `gh`, or GitHub authentication for normal local task workflows. The `gh` dependency is checked only when the user runs GitHub sync.

If `gh` is missing or unauthenticated, AgentRig should fail with a clear setup message:

```text
GitHub sync requires the GitHub CLI. Install gh and run `gh auth login`.
```

### Imported Type Uses Simple Label Mapping

Imported GitHub Issues default to:

```yaml
type: task
```

If an issue has an obvious recognized label, AgentRig should map it to the matching task type:

```text
bug           -> bug
documentation -> doc
docs          -> doc
research      -> research
chore         -> chore
epic          -> epic
story         -> story
```

Unknown GitHub labels should not affect task type. Preserve them in source metadata instead.

### Source Issue Body Gets Its Own Section

Imported GitHub Issues should create `todo` task files. They are backlog seeds, not ready implementation briefs.

Use this body shape:

```md
# Task

## Context

Imported from GitHub Issue #123. Needs planner review before moving to ready.

## Source Issue

<original issue body>

## Planner Notes

## Implementation Plan

## Acceptance Criteria

- [ ] Planner has converted the source issue into verifiable criteria.

## Notes
```

Do not place the raw GitHub issue body directly into `## Context`.

Import only issue title, body, labels, URL, issue number, and timestamps in Phase 11. Do not import GitHub issue comments.

The imported task should preserve the source issue URL so humans or agents can open the full discussion when needed.

### Existing Local Tasks Are Not Overwritten

After a GitHub Issue is imported, the local Markdown task becomes the AgentRig source of truth.

Later sync runs should:

- Skip already-imported GitHub Issues.
- Avoid overwriting local task frontmatter or body content.
- Preserve planner and human edits.
- Optionally report that an imported issue still exists remotely, but not merge remote changes into the local task.

Automatic update or two-way merge behavior is out of scope for Phase 11.

### Post-Merge GitHub Issue Closure

When work from an imported GitHub Issue is completed locally, verified, and merged to `origin/main`, AgentRig should eventually help update the original GitHub Issue using `gh`.

Desired future flow:

```text
import GitHub issue -> local todo task
planner refines task -> ready
worker implements -> review
human/reviewer verifies -> done
changes merge to origin/main
AgentRig updates/closes the GitHub issue
```

Post-merge GitHub issue update/closure is deferred to a later phase after one-way backlog import is stable.

Phase 11 should preserve enough source metadata for that later workflow:

```yaml
source:
  provider: github
  repo: owner/repo
  issue: 123
  url: https://github.com/owner/repo/issues/123
  state_at_import: open
  imported_at: 2026-07-01
```

### Duplicate Detection Uses Source Metadata

`agent-rig tasks sync github` should detect already-imported issues by scanning task frontmatter under `.agent-rig/_shared/tasks/`.

A GitHub Issue is already imported when any local task has:

```yaml
source:
  provider: github
  repo: owner/repo
  issue: 123
```

Duplicate detection must not depend on the local task filename because humans and agents may rename task files.

### Sync Imports Open Issues by Default

By default, Phase 11 should import open issues from the current GitHub repository:

```bash
agent-rig tasks sync github
```

Default behavior:

- Detect the current repository with `gh repo view --json nameWithOwner`.
- Import open issues only.
- Skip already-imported issues.
- Create local tasks with `status: todo`.
- Use a default limit of 100 issues.

Optional filters:

```bash
agent-rig tasks sync github --label agent-rig
agent-rig tasks sync github --limit 20
```

Closed issue import is out of scope for Phase 11.

### Dry Run

Phase 11 should support a safe preview mode:

```bash
agent-rig tasks sync github --dry-run
```

Dry run should:

- Call `gh`.
- Detect the current repository and matching open issues.
- Check duplicate imports.
- Print what would be created and skipped.
- Avoid writing task files.

This is useful for large repositories and for validating sync behavior before mutating the local workspace.

### Imported Issues Stay Unassigned Todo

Imported GitHub Issues should be created as backlog items:

```yaml
status: todo
assigned_to:
```

They should not be assigned to a default agent. Raw GitHub Issues may need planner/human review before work starts, and complex issues may be split into multiple local AgentRig tasks.

The imported issue task can remain as the parent or source reference while planner-created child tasks become the actionable `ready` tasks.

### Split Issues Keep Source on Parent Only

When a complex imported issue is split into local implementation tasks, only the imported parent task should keep GitHub `source` metadata.

Imported issue task:

```yaml
id: task-0001
type: story
status: todo
source:
  provider: github
  repo: owner/repo
  issue: 123
```

Child implementation task:

```yaml
id: task-0002
type: task
status: ready
parent: task-0001
depends_on: []
```

Child tasks should use `parent` to reference the imported issue task. They should not duplicate the GitHub `source` metadata unless a future phase deliberately designs multi-source task behavior.

This behavior must be documented in `docs/tasks.md` and reflected in `docs/project_specs.md`.

## Documentation Deliverables

- Update `docs/tasks.md` with GitHub issue import behavior.
- Document that imported issues start as unassigned `todo` tasks.
- Document `source` frontmatter and duplicate detection.
- Document that complex imported issues can be split into child tasks using `parent`.
- Update `docs/project_specs.md` with the one-way GitHub import model.

### Sync Output

Text output should be concise and human-readable:

```text
GitHub repo: owner/repo
Dry run: false
Created task-0007 from issue #123: Fix login timeout
Imported: 1
Skipped existing: 12
Limit: 100
```

`--json` should emit structured output for agents and scripts:

```bash
agent-rig tasks sync github --json
```

```json
{
  "repo": "owner/repo",
  "imported": [
    {
      "issue": 123,
      "task": "task-0007",
      "path": ".agent-rig/_shared/tasks/task-0007_fix-login-timeout.md"
    }
  ],
  "skipped_existing": [
    {
      "issue": 88,
      "task": "task-0002"
    }
  ],
  "dry_run": false,
  "limit": 100
}
```
