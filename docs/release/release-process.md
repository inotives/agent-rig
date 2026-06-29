# Release Process

AgentRig is published to npm as `@inotives/agent-rig`.

## Pre-Release Checks

```bash
npm test
npm --cache /tmp/agent-rig-npm-cache pack --dry-run
```

For tarball smoke testing:

```bash
npm pack --pack-destination /tmp
mkdir /tmp/agent-rig-smoke
cd /tmp/agent-rig-smoke
npm install /tmp/inotives-agent-rig-<version>.tgz
AGENT_RIG_SKIP_SKILLS=1 npx agent-rig init --yes
npx agent-rig doctor
```

## Publish

Only bump `package.json` during release preparation.

```bash
npm publish --access public
```

npm may require browser authentication for 2FA. After a successful publish, npm registry visibility can lag briefly.

Verify:

```bash
npm view @inotives/agent-rig name version --json
```

## GitHub Release

```bash
git tag v<version>
git push origin v<version>
gh release create v<version> --title "v<version>" --notes-file CHANGELOG.md
```
