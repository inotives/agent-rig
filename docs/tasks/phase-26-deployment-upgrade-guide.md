# Task: Document upgrades for existing AgentRig deployments

## Context

Projects already contain deployed `.agent-rig/` folders with older role
instructions and terminology. A new deployment must not silently overwrite
local skills, tools, task data, or handoff history.

## Goal

Provide a backup-first manual upgrade procedure for older deployments.

## Scope

- Repository upgrade documentation.
- Version and provider checks.
- Backup and preservation rules.
- Contract validation and smoke-test steps.
- Legacy handoff reporting.

Do not add an automated `agent-rig upgrade` command in this task.

## Planner Notes

- Historical tasks and handoffs are never rewritten by the guide.
- The guide must distinguish SQLite live state from historical Markdown.
- Live Claude testing is deferred.

## Implementation Plan

1. Document how to identify an older deployment.
2. Document a backup-first update of generated profiles and shared context.
3. Document preservation of local skills, tools, tasks, and handoffs.
4. Document contract validation and one smoke cycle.
5. Document legacy record reporting and known deferred Claude verification.

## Acceptance Criteria

- [ ] A maintainer can follow the guide without editing SQLite directly.
- [ ] The guide preserves local deployment data.
- [ ] The guide includes rollback evidence through the backup.
- [ ] The guide ends with a worker-reviewer smoke check.
- [ ] The guide does not claim live Claude verification.
