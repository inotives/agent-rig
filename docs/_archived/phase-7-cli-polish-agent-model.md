# Phase 7: CLI Polish and Agent Profiles

## Goal

Improve the released MVP with practical CLI polish, release hygiene, and editable agent profiles for reusable instruction setup.

Decision record: [ADR 0002: Agent Profiles Are Copy-Only Templates](../adr/0002-agent-profiles-are-copy-only-templates.md)

## Accepted Candidates

These are accepted for Phase 7 unless grilling narrows the scope:

- Add `agent-rig --version`.
- Add `agent-rig version`.
- Improve `agent-rig --help` with a useful command list and published package name.
- Add `agent-rig doctor` for quick environment and workspace checks.
- Add `CHANGELOG.md`.
- Add `docs/release/release-process.md`.
- Document the npm package as `@inotives/agent-rig`.
- Keep package version at `0.1.0` during Phase 7 development.
- Track Phase 7 changes under `CHANGELOG.md` `Unreleased`.
- Potentially bundle Phase 7 and Phase 8 into a later `0.2.0` release.
- Add profile-declared default skills using `skills.sh` source/slugs.

Deferred out of Phase 7:

- Broad JSON-output standardization for read-only commands.
- `agent-rig validate --fix`.

## Agent Profiles

Phase 7 should avoid hard-coded sub-agent hierarchy. Agent relationships and collaboration flow should live in `instructions.md`, where humans can edit them freely.

Add editable shared profiles as reusable instruction templates:

```text
.agent-rig/
├── _shared/
│   └── profiles/
│       ├── planner.md
│       ├── worker.md
│       └── reviewer.md
└── worker/
    └── instructions.md
```

Each profile is a plain Markdown file named by profile slug, such as `worker.md`, `planner.md`, and `reviewer.md`.
Custom profiles are supported by adding Markdown files directly to `.agent-rig/_shared/profiles/`; no registry file or registration command is needed.
Profile slugs follow the same naming rule as agent names: lowercase letters, numbers, and hyphens only. Examples: `worker.md`, `api-worker.md`, `researcher.md`.

Profile Markdown format:

```markdown
---
name: worker
role: worker
summary: Implements assigned tasks and writes clear handoffs.
created_on: 2026-06-29
updated_on: 2026-06-29
shared_skills:
  - source: vercel-labs/skills@find-skills
    name: find-skills
  - source: anthropics/skills@skill-creator
    name: skill-creator
  - source: https://github.com/mattpocock/skills
    name: handoff
    args:
      - --skill
      - handoff
agent_skills: []
---

# Worker Profile

## Responsibility

Describe what this agent is responsible for.

## Context

Read these first:

- `.agent-rig/_shared/context.md`
- `.agent-rig/<agent>/context.md`
- `.agent-rig/<agent>/tasks/`

## Skills And Tools

Shared:

- `.agent-rig/_shared/skills/`
- `.agent-rig/_shared/tools/`

Agent-local:

- `.agent-rig/<agent>/skills/`
- `.agent-rig/<agent>/tools/`

## Workflow

Describe how this agent should work, coordinate, and hand off.

## Human Escalation

Describe when to stop and ask the human.

## Output

Describe expected response or handoff style.
```

Required frontmatter: `name`, `role`, `summary`, `created_on`, `updated_on`, `shared_skills`, `agent_skills`.
Built-in profiles should use fixed template dates in frontmatter rather than generating dates during `init`.
Built-in profiles should be stored as package template files, not in-code strings:

```text
templates/profiles/planner.md
templates/profiles/worker.md
templates/profiles/reviewer.md
```

The templates directory should be included in `package.json` `files`.
Packaged templates are read-only defaults. Users should edit copied workspace profiles in `.agent-rig/_shared/profiles/`, not files inside the npm-installed package.

Skill metadata:

- `shared_skills` declares skills to install into `.agent-rig/_shared/skills/`.
- `agent_skills` declares skills to install into `.agent-rig/<agent>/skills/`.
- Skill entries use `skills.sh`-compatible sources, not an AgentRig-owned skill library.
- Use structured entries so install arguments do not require shell parsing.
- Existing default skills become shared profile/default skills:
  - `vercel-labs/skills@find-skills`
  - `anthropics/skills@skill-creator`
  - `https://github.com/mattpocock/skills` with args `--skill handoff`
- Built-in profiles may use `agent_skills: []` until role-specific skill defaults are chosen.
- `skills.sh` remains the discovery and install layer.
- AgentRig owns only the destination folders and profile-driven install flow.
- Do not add a separate AgentRig skill library or skill source registry.

Built-in role profile `agent_skills`:

Worker profile:

```yaml
agent_skills:
  - source: https://github.com/apollographql/skills
    name: rust-best-practices
    args:
      - --skill
      - rust-best-practices
  - source: https://github.com/wshobson/agents
    name: typescript-advanced-types
    args:
      - --skill
      - typescript-advanced-types
  - source: https://github.com/wshobson/agents
    name: python-design-patterns
    args:
      - --skill
      - python-design-patterns
```

Planner profile:

```yaml
agent_skills:
  - source: https://github.com/mattpocock/skills
    name: grill-with-docs
    args:
      - --skill
      - grill-with-docs
  - source: https://github.com/mattpocock/skills
    name: improve-codebase-architecture
    args:
      - --skill
      - improve-codebase-architecture
  - source: https://github.com/anthropics/skills
    name: frontend-design
    args:
      - --skill
      - frontend-design
  - source: https://github.com/vercel-labs/agent-skills
    name: web-design-guidelines
    args:
      - --skill
      - web-design-guidelines
```

Reviewer profile:

```yaml
agent_skills:
  - source: https://github.com/getsentry/skills
    name: security-review
    args:
      - --skill
      - security-review
  - source: https://github.com/juliusbrussee/caveman
    name: caveman-review
    args:
      - --skill
      - caveman-review
```

Shared skill install behavior:

- `init` installs shared skills declared by the selected profiles.
- `init --yes` selects the `worker` profile, so it installs `worker.shared_skills`.
- Multi-agent setup merges `shared_skills` from every selected profile.
- Deduplicate shared skills by `name`.
- `AGENT_RIG_SKIP_SKILLS=1` skips network installs but still creates the shared skills folder.

Agent skill install behavior:

- `init --yes` installs the default worker profile's `agent_skills` into `.agent-rig/worker/skills/`.
- Interactive `init` installs each selected agent profile's `agent_skills` into that agent's local skills folder.
- `add --profile <profile>` installs `agent_skills` declared by the selected profile.
- Install `agent_skills` into `.agent-rig/<agent>/skills/`.
- If two agents use the same profile, each agent gets its own local skill installation.
- `AGENT_RIG_SKIP_SKILLS=1` skips network installs but still creates the local skills folder.
- If a profile declares shared or agent skills and install fails, the command should fail because the requested profile setup did not complete.
- Skill install failure messages should identify the group and skill name, such as `Failed to install worker skill: rust-best-practices`.
- Default `init --yes` installs three shared skills and three worker-local skills unless `AGENT_RIG_SKIP_SKILLS=1`.
- Print clear progress before install groups, such as `Installing shared skills...` and `Installing worker skills...`.

Profile validation behavior:

- Profile filenames must use valid slugs.
- `profiles` should list Markdown profiles with valid filename slugs.
- Invalid profile filenames should warn and be ignored, not fail the command.
- Missing required frontmatter should warn, not fail.
- `name` frontmatter that does not match the filename slug should warn, not fail.
- Malformed `created_on` or `updated_on` should warn, not fail.
- `add --profile` should not block rough custom profiles when the Markdown file exists.
- Use the `yaml` npm dependency to parse profile frontmatter. Do not hand-roll YAML parsing because profile skill metadata uses nested arrays and objects.

When `add --profile <name>` copies a profile into an agent's `instructions.md`, copy the full Markdown file including YAML frontmatter. The copied frontmatter remains profile metadata, not agent identity metadata.
When copying a profile into `instructions.md`, replace `<agent>` with the target agent name. Do not add other template placeholders in Phase 7.
Replacement applies globally across the copied file, including frontmatter. Packaged and workspace profile files keep `<agent>` unchanged.
Built-in profile frontmatter `name` should remain the profile name after copy. Agent identity belongs in `agent.toml`.

The current setup flow should stay usable:

- `agent-rig init --yes` still creates one usable `worker` agent.
- `agent-rig init --yes` seeds `.agent-rig/_shared/profiles/`.
- The default worker's `instructions.md` is copied from the shared `worker` profile.
- Interactive `agent-rig init` can choose setup patterns and assign profiles based on role.
- Interactive `init` should not ask for a profile per agent in Phase 7; use role-to-profile defaults.
- `agent-rig add <agent> --profile <profile>` uses the selected profile for that agent's `instructions.md`.
- Users can edit agent-specific `instructions.md` after creation.
- Users can edit shared profiles to affect future agents.
- Existing agent instructions are not overwritten unless the user explicitly asks for it.
- Profiles are copy-only templates. AgentRig should not store the source profile in `agent.toml`.
- Built-in profiles for Phase 7 are `planner`, `worker`, and `reviewer`.
- `verifier` remains a valid role, but does not get a separate built-in profile in Phase 7. Users can copy or adapt `reviewer` for verifier-style workflows.

Default role-to-profile mapping:

| Role | Default profile |
|---|---|
| `planner` | `planner` |
| `worker` | `worker` |
| `reviewer` | `reviewer` |
| `verifier` | `reviewer` |
| `tester` | `reviewer` |
| `supervisor` | `planner` |
| `custom` or unknown | `worker` with a warning |

If a role maps to a fallback profile, AgentRig should print a warning suggesting `--profile <name>` when the user wants a different instruction source.

Potential commands:

```bash
agent-rig profiles
agent-rig profiles show worker
agent-rig add api-worker --role worker --tool codex --profile worker
```

Defer `profile apply` because it would overwrite existing `instructions.md` and needs prompts, backups, and force semantics.
Use the plural `profiles` command namespace only. Do not add a separate singular `profile` command in Phase 7.

Profile lookup behavior:

- Inside an initialized workspace, `agent-rig profiles` lists `.agent-rig/_shared/profiles/*.md`.
- Inside an initialized workspace, `agent-rig profiles show <name>` reads the editable workspace profile.
- Outside a workspace, `agent-rig profiles` lists bundled built-in profiles and notes that `agent-rig init` copies editable profiles into a project.
- Outside a workspace, `agent-rig profiles show <name>` reads the bundled built-in profile.
- Bundled built-in profiles are read from packaged `templates/profiles/`.
- Once a workspace exists, workspace profiles are the source of truth.
- `agent-rig profiles show <name>` prints raw Markdown exactly.
- `agent-rig profiles show <name> --json` is out of scope for Phase 7.
- Raw profile output includes editable `shared_skills` and `agent_skills` frontmatter.
- Missing profiles exit `1` with `Profile not found: <name>`.
- `agent-rig profiles` prints profile name, role, and summary when frontmatter exists, and falls back to filename when it does not.
- `agent-rig profiles --json` returns profile metadata for scripts. This is limited to the new profiles command and does not reopen broad JSON-output standardization.

JSON shape:

```json
{
  "profiles": [
    {
      "name": "worker",
      "role": "worker",
      "summary": "Implements assigned tasks and writes clear handoffs.",
      "path": ".agent-rig/_shared/profiles/worker.md",
      "source": "workspace",
      "shared_skills": [
        {
          "source": "vercel-labs/skills@find-skills",
          "name": "find-skills"
        }
      ],
      "agent_skills": [
        {
          "source": "https://github.com/apollographql/skills",
          "name": "rust-best-practices",
          "args": ["--skill", "rust-best-practices"]
        }
      ]
    }
  ],
  "warnings": [
    {
      "path": ".agent-rig/_shared/profiles/Worker.md",
      "message": "Invalid profile filename"
    }
  ]
}
```

In JSON mode, include warnings in the JSON response and do not print warning text to stderr.
Outside a workspace, profile `path` is `null` and `source` is `builtin`.
`profiles --json` includes parsed metadata only. Use `profiles show <name>` for the full Markdown body.

Profile seeding behavior:

- Fresh `init` writes all bundled profiles into `.agent-rig/_shared/profiles/`.
- If a profile file already exists, AgentRig must leave it unchanged.
- If a built-in profile is missing, AgentRig may create only the missing file.
- AgentRig should print a short message for skipped existing profile files.
- During `init`, resolve selected agent profiles from the workspace profile files after seeding, not directly from packaged templates.
- In an initialized workspace, `add --profile <name>` requires `.agent-rig/_shared/profiles/<name>.md` to exist and should not fall back to packaged templates.
- `add <agent>` without `--profile` resolves a profile through the role-to-profile mapping and requires that mapped workspace profile to exist.

## Open Discussion

These need grilling before implementation:

- Task management improvements are deferred to Phase 8.

## Doctor Checks

Phase 7 `agent-rig doctor` should be read-only and local-only.

Checks:

- Node version satisfies `package.json` `engines.node`.
- `npm` is available.
- `npx` is available.
- Current directory has `.agent-rig/`.
- If a workspace exists, run the same validation as `agent-rig validate`.
- Default shared skills folder presence:
  - `.agent-rig/_shared/skills/find-skills`
  - `.agent-rig/_shared/skills/skill-creator`
  - `.agent-rig/_shared/skills/handoff`
- Shared profiles folder presence:
  - `.agent-rig/_shared/profiles/`

No network checks in Phase 7 doctor.
Running `doctor` outside a workspace should fail the workspace check and exit `1`, with guidance to run `agent-rig init`.

Exit behavior:

- Exit `0` when all required checks pass.
- Exit `1` when any required check fails.
- Treat missing default skills as warnings when `AGENT_RIG_SKIP_SKILLS=1` was used.
- Support `agent-rig doctor --json` for scripts.
- `doctor --json` returns an object with `ok` and `checks`.
- Check statuses are `pass`, `warn`, or `fail`.
- If any check is `fail`, `ok` is `false` and exit code is `1`.
- If checks are only `pass` or `warn`, `ok` is `true` and exit code is `0`.

JSON shape:

```json
{
  "ok": false,
  "checks": [
    {
      "name": "node",
      "status": "pass",
      "message": "Node 24.16.0 satisfies >=20"
    },
    {
      "name": "workspace",
      "status": "fail",
      "message": "No .agent-rig directory found"
    }
  ]
}
```

## Release Hygiene Docs

Phase 7 should add:

- `CHANGELOG.md`
- `docs/release/release-process.md`

`CHANGELOG.md` should include:

- `Unreleased`
- `0.1.0` first npm release summary

`docs/release/release-process.md` should include:

- pre-release checks
- npm publish command for `@inotives/agent-rig`
- npm 2FA/browser authentication note
- tag and GitHub release steps
- note that npm registry visibility may lag briefly after publish
- note that version bumps happen only during release preparation

## README Updates

Phase 7 should add a small README update for:

- `agent-rig doctor`
- `agent-rig profiles`
- `agent-rig profiles show worker`
- `agent-rig add ... --profile worker`
- editable Markdown profiles in `.agent-rig/_shared/profiles/`

Do not add a long profile authoring guide to README in Phase 7.

## Profile Authoring Docs

Phase 7 should add `docs/profiles.md`.

Minimum contents:

- what profiles are
- where profiles live
- built-in profiles
- filename slug rules
- required frontmatter
- body section structure
- how `add --profile` copies profile Markdown into `instructions.md`
- how custom profiles are created by adding Markdown files to `.agent-rig/_shared/profiles/`

## Project Spec Update

Phase 7 should make a small update to `docs/project_specs.md`:

- profiles are editable Markdown templates
- profiles live in `.agent-rig/_shared/profiles/`
- profiles are copied into `instructions.md`
- profile frontmatter can declare shared and agent-local skills
- AgentRig does not add a parent/sub-agent schema in Phase 7

Keep detailed profile authoring guidance in `docs/profiles.md`.

## Built-In Profile Text

Phase 7 profiles should be short, role-focused starter templates.

Each profile should cover:

- role responsibility
- how to read local context
- where to find shared skills and tools
- where to find agent-local skills and tools
- how to use task queue and handoff logs at a high level
- when to ask the human
- expected output style

Profiles should point agents to:

- shared skills: `.agent-rig/_shared/skills/`
- shared tools: `.agent-rig/_shared/tools/`
- local skills: `.agent-rig/<agent>/skills/`
- local tools: `.agent-rig/<agent>/tools/`

Profiles should instruct agents to prefer AgentRig local skills over similar global skills:

```markdown
Prefer skills in `.agent-rig/<agent>/skills/` for this role. Use `.agent-rig/_shared/skills/` for shared project skills. If similar global skills exist, treat AgentRig local skills as the intended project-specific version.
```

Profiles should mention tools cautiously:

```markdown
Check `.agent-rig/<agent>/tools/` and `.agent-rig/_shared/tools/` for project-provided tools when present. Do not assume a tool exists unless the folder contains instructions or scripts.
```

Profiles should reference handoffs without duplicating the full handoff format:

```markdown
When handing off, use the shared handoff guidance or handoff skill when available, and write handoff logs under `.agent-rig/_shared/handoff_logs/`.
```

Phase 7 should create these folders when scaffolding agents:

```text
.agent-rig/_shared/tools/.gitkeep
.agent-rig/<agent>/skills/.gitkeep
.agent-rig/<agent>/tools/.gitkeep
```

Shared skills already exist when default skill installation runs. If skill installation is skipped, the shared skills folder should still exist.

Validation behavior:

- Missing `.agent-rig/_shared/profiles/` should warn, not fail.
- Missing `.agent-rig/_shared/tools/` should warn, not fail.
- Missing `.agent-rig/<agent>/skills/` should warn, not fail.
- Missing `.agent-rig/<agent>/tools/` should warn, not fail.
- Missing required referenced files such as `instructions.md` should still fail.

This keeps older `0.1.0` workspaces usable after upgrading AgentRig.

Doctor should report missing profile/skills/tools folders as warnings with clear text. Do not add a `profiles seed` or auto-fix command in Phase 7.

Avoid:

- tool-specific Codex/Claude/OpenCode instructions
- long workflow theory
- hard-coded parent/child relationships
- phase-specific implementation details

All built-in profiles should use the same body section structure:

```markdown
# <Role> Profile

## Responsibility

## Context

## Skills And Tools

## Workflow

## Human Escalation

## Output
```

Profiles may mention current task file locations, but should not define detailed task lifecycle rules. Use wording like: read task details from `.agent-rig/<agent>/tasks/` and queue state from `.agent-rig/<agent>/queue.json` when present. Phase 8 owns task management changes.
Profile wording should use `human` for the operator instead of `user`, because AgentRig distinguishes humans from agents.

Worker profile responsibility:

```markdown
Implement assigned tasks with the smallest working change. Stay inside the task scope unless the human or planner explicitly expands it.
```

Worker profile should include:

```markdown
Run the smallest relevant checks before handing off. If checks cannot run, state exactly what was not run and why.
```

Planner profile responsibility:

```markdown
Work with the human to clarify intent, decisions, and implementation shape before work is handed to a worker. Use grill-with-docs-style questioning to create a detailed implementation plan, then write task-ready guidance for the worker.
```

Planner should not autonomously assign work without the human workflow asking it to do so.
Planner should create or update ADRs only for decisions that are hard to reverse, surprising without context, and based on a real tradeoff.

Reviewer profile responsibility:

```markdown
Review completed work against the assigned task, project docs, and repository behavior. Prioritize bugs, regressions, missing tests, unsafe assumptions, and mismatches with the documented plan.
```

Reviewer profile should include:

```markdown
Lead with findings, ordered by severity. Include file and line references when possible. If there are no issues, say that clearly and mention remaining test gaps or residual risk.
```

## Built-In Profile Drafts

These drafts are accepted as the Phase 7 implementation source. Users can edit copied workspace profiles after `init`.

### `worker.md`

```markdown
---
name: worker
role: worker
summary: Implements assigned tasks with scoped changes and clear handoffs.
created_on: 2026-06-29
updated_on: 2026-06-29
shared_skills:
  - source: vercel-labs/skills@find-skills
    name: find-skills
  - source: anthropics/skills@skill-creator
    name: skill-creator
  - source: https://github.com/mattpocock/skills
    name: handoff
    args:
      - --skill
      - handoff
agent_skills:
  - source: https://github.com/apollographql/skills
    name: rust-best-practices
    args:
      - --skill
      - rust-best-practices
  - source: https://github.com/wshobson/agents
    name: typescript-advanced-types
    args:
      - --skill
      - typescript-advanced-types
  - source: https://github.com/wshobson/agents
    name: python-design-patterns
    args:
      - --skill
      - python-design-patterns
---

# Worker Profile

## Responsibility

Implement assigned tasks with the smallest working change. Stay inside the task scope unless the human or planner explicitly expands it.

## Context

Read shared context from `.agent-rig/_shared/context.md`.
Read local agent context from `.agent-rig/<agent>/context.md`.
Read task details from `.agent-rig/<agent>/tasks/` and queue state from `.agent-rig/<agent>/queue.json` when present.

## Skills And Tools

Prefer skills in `.agent-rig/<agent>/skills/` for this role. Use `.agent-rig/_shared/skills/` for shared project skills. If similar global skills exist, treat AgentRig local skills as the intended project-specific version.

Check `.agent-rig/<agent>/tools/` and `.agent-rig/_shared/tools/` for project-provided tools when present. Do not assume a tool exists unless the folder contains instructions or scripts.

## Workflow

Understand the assigned task, make the smallest working change, and keep edits scoped to the task. Run the smallest relevant checks before handing off. If checks cannot run, state exactly what was not run and why.

## Human Escalation

Ask the human when requirements conflict, credentials or permissions are missing, a destructive action is needed, or the task is blocked by a decision outside the task scope.

## Output

Summarize what changed, what was checked, and what remains. When handing off, use the shared handoff guidance or handoff skill when available, and write handoff logs under `.agent-rig/_shared/handoff_logs/`.
```

### `planner.md`

```markdown
---
name: planner
role: planner
summary: Works with the human to clarify intent and produce task-ready implementation plans.
created_on: 2026-06-29
updated_on: 2026-06-29
shared_skills:
  - source: vercel-labs/skills@find-skills
    name: find-skills
  - source: anthropics/skills@skill-creator
    name: skill-creator
  - source: https://github.com/mattpocock/skills
    name: handoff
    args:
      - --skill
      - handoff
agent_skills:
  - source: https://github.com/mattpocock/skills
    name: grill-with-docs
    args:
      - --skill
      - grill-with-docs
  - source: https://github.com/mattpocock/skills
    name: improve-codebase-architecture
    args:
      - --skill
      - improve-codebase-architecture
  - source: https://github.com/anthropics/skills
    name: frontend-design
    args:
      - --skill
      - frontend-design
  - source: https://github.com/vercel-labs/agent-skills
    name: web-design-guidelines
    args:
      - --skill
      - web-design-guidelines
---

# Planner Profile

## Responsibility

Work with the human to clarify intent, decisions, and implementation shape before work is handed to a worker. Use grill-with-docs-style questioning to create a detailed implementation plan, then write task-ready guidance for the worker.

Do not autonomously assign work unless the human workflow asks you to do so.

## Context

Read shared context from `.agent-rig/_shared/context.md`.
Read local agent context from `.agent-rig/<agent>/context.md`.
Read project docs and current phase docs before asking implementation questions.
Read task details from `.agent-rig/<agent>/tasks/` and queue state from `.agent-rig/<agent>/queue.json` when present.

## Skills And Tools

Prefer skills in `.agent-rig/<agent>/skills/` for this role. Use `.agent-rig/_shared/skills/` for shared project skills. If similar global skills exist, treat AgentRig local skills as the intended project-specific version.

Check `.agent-rig/<agent>/tools/` and `.agent-rig/_shared/tools/` for project-provided tools when present. Do not assume a tool exists unless the folder contains instructions or scripts.

## Workflow

Ask one decision question at a time. Recommend a default answer and explain the tradeoff. Update planning docs as decisions are made.

Create or update ADRs only for decisions that are hard to reverse, surprising without context, and based on a real tradeoff.

## Human Escalation

Ask the human when a decision changes product scope, workflow ownership, security posture, release behavior, or the meaning of a core project term.

## Output

Write concise plans with assumptions, decisions, open questions, and acceptance criteria. When handing off, use the shared handoff guidance or handoff skill when available, and write handoff logs under `.agent-rig/_shared/handoff_logs/`.
```

### `reviewer.md`

```markdown
---
name: reviewer
role: reviewer
summary: Reviews completed work against tasks, docs, behavior, and risk.
created_on: 2026-06-29
updated_on: 2026-06-29
shared_skills:
  - source: vercel-labs/skills@find-skills
    name: find-skills
  - source: anthropics/skills@skill-creator
    name: skill-creator
  - source: https://github.com/mattpocock/skills
    name: handoff
    args:
      - --skill
      - handoff
agent_skills:
  - source: https://github.com/getsentry/skills
    name: security-review
    args:
      - --skill
      - security-review
  - source: https://github.com/juliusbrussee/caveman
    name: caveman-review
    args:
      - --skill
      - caveman-review
---

# Reviewer Profile

## Responsibility

Review completed work against the assigned task, project docs, and repository behavior. Prioritize bugs, regressions, missing tests, unsafe assumptions, and mismatches with the documented plan.

## Context

Read shared context from `.agent-rig/_shared/context.md`.
Read local agent context from `.agent-rig/<agent>/context.md`.
Read the task, implementation plan, relevant diffs, and validation output before reviewing.
Read task details from `.agent-rig/<agent>/tasks/` and queue state from `.agent-rig/<agent>/queue.json` when present.

## Skills And Tools

Prefer skills in `.agent-rig/<agent>/skills/` for this role. Use `.agent-rig/_shared/skills/` for shared project skills. If similar global skills exist, treat AgentRig local skills as the intended project-specific version.

Check `.agent-rig/<agent>/tools/` and `.agent-rig/_shared/tools/` for project-provided tools when present. Do not assume a tool exists unless the folder contains instructions or scripts.

## Workflow

Inspect the implementation against the task and docs. Focus on behavior, regressions, missing tests, security issues, and unhandled edge cases. Do not rewrite the work unless the human asks for fixes.

## Human Escalation

Ask the human when review scope is unclear, the implementation conflicts with the documented plan, or a finding requires a product decision.

## Output

Lead with findings, ordered by severity. Include file and line references when possible. If there are no issues, say that clearly and mention remaining test gaps or residual risk.

When handing off, use the shared handoff guidance or handoff skill when available, and write handoff logs under `.agent-rig/_shared/handoff_logs/`.
```

## Initial Recommendation

Keep Phase 7 small. Implement CLI polish, release hygiene, and profile-based instruction scaffolding. Avoid parent/sub-agent schema unless a later phase defines concrete behavior.

Do not include broad JSON-output standardization or `validate --fix` in Phase 7 unless they become trivial side effects of the accepted work.

Version command behavior:

- `agent-rig --version` prints the current package version.
- `agent-rig version` prints the current package version.
- Read the version at runtime from the packaged `package.json`.
- Do not generate a build-time version constant in Phase 7.

Help behavior:

- `agent-rig --help` prints a compact command list.
- Include package name `@inotives/agent-rig`.
- Include three examples:
  - `agent-rig init`
  - `agent-rig init --yes`
  - `agent-rig add api-worker --role worker --tool codex --profile worker`
- Keep detailed usage in README rather than long CLI help.
- `agent-rig help` is an alias for top-level help.
- Per-command help is out of scope for Phase 7.

## Acceptance Criteria Draft

- `agent-rig --version` prints the current package version.
- `agent-rig version` prints the current package version.
- `agent-rig --help` lists supported commands and the npm package name.
- `agent-rig doctor` reports environment and workspace checks without mutating files.
- Release docs describe the manual npm release path and current scoped package.
- `agent-rig init --yes` seeds shared profiles and still creates a usable worker agent.
- `agent-rig add <agent> --profile <profile>` copies profile content into the agent's `instructions.md`.
- `agent-rig profiles` lists available shared profiles.
- `agent-rig profiles show <name>` prints profile content.
- Tests cover version/help/doctor behavior.
- Tests cover profile seeding, listing, showing, and add-with-profile behavior.
- Task management criteria are deferred to Phase 8.

## Validation Plan

Phase 7 implementation should be verified with local package checks, not live npm registry install.

Run:

```bash
npm test
npm --cache /tmp/agent-rig-npm-cache pack --dry-run
npm pack --pack-destination /tmp
```

Run a local tarball smoke against the produced package:

```bash
npm install /tmp/inotives-agent-rig-0.1.0.tgz
npx agent-rig --version
npx agent-rig profiles
npx agent-rig init --yes
npx agent-rig doctor
npx agent-rig add api-worker --role worker --tool codex --profile worker
```

Do not use live npm install from the registry for Phase 7 implementation validation because the registry package remains `0.1.0` until the next release.

Skill install validation:

- Fast automated smoke should use `AGENT_RIG_SKIP_SKILLS=1`.
- Run one live default skill install smoke before PR, without `AGENT_RIG_SKIP_SKILLS=1`, with network access.
- Do not add an AgentRig-owned skill library. `skills.sh` remains the skill discovery and install layer.
