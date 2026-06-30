# Phase 9: Patch Release 0.1.1 Preparation

## Goal

Prepare and publish AgentRig `0.1.1` as a patch release containing the completed Phase 7 and Phase 8 user-facing improvements.

## Scope

- Bump package version from `0.1.0` to `0.1.1`.
- Update `CHANGELOG.md` for `0.1.1`.
- Validate package contents.
- Run local tarball install smoke tests.
- Prepare manual npm publish instructions for two-factor authentication.
- Verify the published package after npm registry propagation.
- Create git tag `v0.1.1`.
- Create GitHub release notes for `v0.1.1`.

## Out of Scope

- New product features.
- GitHub Actions trusted publishing automation.
- Long-lived npm token setup.
- Changing the npm package scope or binary name.

## Acceptance Criteria

- Phase 9 docs are finalized and committed on `main` before implementation.
- Package version is bumped from `0.1.0` to `0.1.1`.
- `CHANGELOG.md` has a `0.1.1` entry covering Phase 7 and Phase 8 changes.
- `docs/release/0.1.1-checklist.md` exists.
- `docs/release/0.1.1-notes.md` exists.
- `npm test` passes.
- `npm --cache /tmp/agent-rig-npm-cache pack --dry-run` passes.
- Local tarball smoke test passes.
- Release commit is tagged `v0.1.1` after local validation.
- Human maintainer publishes with the documented npm command.
- Post-publish npm and npx verification checks pass.
- GitHub release is created after npm publish succeeds.

## Initial Recommendation

Treat `0.1.1` as a manual patch release. Keep npm publish manual because npm two-factor authentication requires browser approval. Create the git tag only after local validation passes and immediately before publish. Create the GitHub release after npm publish succeeds.

## Accepted Decisions

### Manual npm Publish

Publish `0.1.1` manually from the maintainer's local machine, matching the `0.1.0` release flow.

AgentRig can prepare and validate the release artifacts, but the human maintainer runs the final npm publish command because npm two-factor authentication requires browser approval.

### Release Documentation Ownership

AgentRig prepares and maintains the release documentation:

- Phase 9 docs.
- `CHANGELOG.md`.
- Release checklist and runbook updates.
- GitHub release notes draft.
- README or docs corrections needed for release accuracy.
- Package version documentation alignment.

The human maintainer only runs the final npm publish command when npm two-factor authentication requires browser approval.

### Tag Timing

Create git tag `v0.1.1` after local validation passes and the release commit is ready, but before npm publish.

If npm publish fails because of transient authentication or registry propagation, retry publish without changing the tag. If publish fails because package contents are wrong, stop and fix the release before publishing.

### GitHub Release Timing

Create the GitHub release after npm publish succeeds.

Use `gh release create v0.1.1 --title "v0.1.1" --notes-file <release-notes-file>` so the GitHub release points to a package version that already exists on npm.

### CI Publishing Deferred

Do not add GitHub Actions publishing automation for `0.1.1`.

npm trusted publishing and release CI are useful later, but they add OIDC setup, permissions, and new release failure modes. Keep `0.1.1` manual and document trusted publishing as a future phase candidate.

Test-only CI is also out of scope for Phase 9 unless it becomes a separate future phase.

### Local Tarball Smoke Test

After `npm pack`, install the generated tarball into a temporary project and run:

```bash
agent-rig --version
AGENT_RIG_SKIP_SKILLS=1 agent-rig init --yes
agent-rig profiles --json
agent-rig tasks create "Smoke task" --assigned-to worker --status ready
agent-rig validate
```

Expected results:

- `agent-rig --version` prints `0.1.1`.
- `agent-rig init --yes` creates a valid workspace.
- `agent-rig profiles --json` includes `researcher` and `writer`.
- `agent-rig tasks create` creates a shared Markdown task file.
- `agent-rig validate` passes.

### Post-Publish Verification

After the maintainer publishes `0.1.1`, verify npm metadata and actual execution:

```bash
npm view @inotives/agent-rig version
npx -y @inotives/agent-rig@0.1.1 --version
```

Then run an npx smoke test in a temporary project:

```bash
AGENT_RIG_SKIP_SKILLS=1 npx -y @inotives/agent-rig@0.1.1 init --yes
npx -y @inotives/agent-rig@0.1.1 validate
```

Expected results:

- npm registry reports `0.1.1`.
- npx reports `0.1.1`.
- npx scaffold and validate succeed.

### Release Notes File

Create `docs/release/0.1.1-notes.md` during implementation and use it as the source for GitHub release notes.

Keep `CHANGELOG.md` as the durable project changelog, but do not pass the whole changelog to `gh release create`.
