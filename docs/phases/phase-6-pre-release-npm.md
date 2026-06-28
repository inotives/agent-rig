# Phase 6: Pre-Release and npm Registry Preparation

## Goal

Prepare AgentRig for its first public npm release and guide a first-time publisher through the registry setup safely.

Release runbook: [AgentRig 0.1.0 Release Checklist](../release/0.1.0-checklist.md)

## Scope

- npm account creation and verification
- npm CLI login verification
- `agent-rig` package name availability check
- Release metadata review
- Tarball contents review
- Local tarball install smoke test
- Git tag and GitHub release checklist
- First publish checklist

## Out of Scope

- Publishing during docs planning
- Automated release pipelines
- GitHub Actions release automation
- Multi-package workspaces
- Paid npm organization setup

## Important npm Notes

- npm package names are claimed by the first successful publish. There is no separate "reserve this package name" step for the public registry.
- `agent-rig` will be published from the maintainer's personal npm account as an unscoped public package.
- Publishing should happen only after `npm whoami`, tarball review, and install smoke tests pass.
- Do not publish from a dirty git tree.
- The first publish is manual so the maintainer can claim the package name and verify account setup directly.
- After the first publish succeeds, configure GitHub Actions trusted publishing with OIDC for tag-based releases. Do not add the workflow before first publish, and do not use long-lived npm tokens unless trusted publishing is blocked.
- First public release version will be `0.1.0`.

## Human Account Setup

1. Create an npm account at `https://www.npmjs.com/signup`.
2. Verify the account email.
3. Enable two-factor authentication for the npm account.
4. Log in locally:

```bash
npm login
```

5. Confirm the CLI is using the intended account:

```bash
npm whoami
```

## Package Name Check

Before publish, check the registry:

```bash
npm view agent-rig name version --json
```

Expected before first release:

- `E404 Not Found`, which means no visible package named `agent-rig` exists.

If the package exists, stop and decide whether to use a scoped package such as `@inotives/agent-rig`.

## Release Metadata Checklist

Before publishing, update and verify `package.json` includes:

- `name`
- `version`
- `description`
- `bin`
- `files`
- `license`
- `repository`
- `homepage`
- `bugs`
- `keywords`
- `engines`
- `scripts.prepublishOnly`

Expected metadata:

```json
{
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/inotives/agent-rig.git"
  },
  "homepage": "https://github.com/inotives/agent-rig#readme",
  "bugs": {
    "url": "https://github.com/inotives/agent-rig/issues"
  },
  "keywords": [
    "agent",
    "agents",
    "cli",
    "codex",
    "claude",
    "opencode",
    "workspace"
  ],
  "scripts": {
    "prepublishOnly": "npm test"
  }
}
```

## Tarball Review

Build and inspect the package:

```bash
npm test
npm --cache /tmp/agent-rig-npm-cache pack --dry-run
```

The tarball should include:

- `dist/`
- `README.md`
- `LICENSE`
- `logo.png`
- Markdown docs linked by README

The tarball should not include:

- `.agent-rig/`
- `.creds/`
- `node_modules/`
- source-only scratch files
- large unused design assets

## Install Smoke Tests

Create the tarball:

```bash
npm pack
```

Run a project-local install smoke:

```bash
tmp=$(mktemp -d /tmp/agent-rig-release-XXXXXX)
cd "$tmp"
npm init -y
npm install /path/to/agent-rig-0.1.0.tgz
npx agent-rig init --yes
npx agent-rig task add --agent worker --title "Smoke" --body "Confirm release package"
npx agent-rig watch --once
npx agent-rig validate
npx agent-rig status
```

Run a global install smoke:

```bash
npm install -g /path/to/agent-rig-0.1.0.tgz
agent-rig --help
```

Expected result:

- workspace scaffolds successfully
- task completes through filesystem-only watch
- validation passes
- status shows one done task and one handoff
- global `agent-rig --help` prints CLI usage

## First Publish Checklist

Only publish after all previous checks pass:

```bash
git tag v0.1.0
git push origin v0.1.0
npm publish --access public
```

After publish:

```bash
npm view agent-rig name version --json
npm install -g agent-rig
agent-rig --help
```

## GitHub Release Checklist

After npm publish succeeds, create a GitHub release for `v0.1.0`.

The release notes should include:

- first filesystem-only MVP release
- supported commands
- npm install command
- Node.js version requirement
- known limitation: AgentRig does not launch Claude, Codex, or OpenCode directly yet
- link to `docs/project_specs.md`

## Post-First-Publish Automation

After the first manual publish, configure npm trusted publishing for GitHub Actions:

1. In npm package settings for `agent-rig`, add a trusted publisher.
2. Use GitHub Actions as the publisher.
3. Configure repository owner `inotives`, repository `agent-rig`, and workflow filename `publish.yml`.
4. Allow `npm publish`.
5. Add `.github/workflows/publish.yml`.
6. Trigger releases only from version tags such as `v0.0.1`.

The workflow must:

- run on version tags only
- use GitHub-hosted runners
- grant `id-token: write`
- use a Node/npm version supported by npm trusted publishing
- run `npm ci`
- run `npm test`
- run `npm publish`

## Decisions

- npm account owner: personal maintainer account.
- Package name: unscoped `agent-rig`; scoped fallback only if the name is unavailable.
- First publish mode: manual publish plus `v0.1.0` git tag and GitHub release.
- Release automation: GitHub Actions trusted publishing after first manual publish.
- Trusted publishing workflow timing: post-first-publish only.
- Final `package.json` metadata: add license, repository, homepage, bugs, keywords, and `prepublishOnly` before publish.
- First release version: `0.1.0`.

## Open Decisions

None.
