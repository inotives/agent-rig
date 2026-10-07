import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
const profileDir = fileURLToPath(new URL("../templates/profiles/", import.meta.url));

if (!name || !/^[a-z][a-z0-9-]{0,39}$/.test(name)) {
  console.error("Usage: npm run profile:create -- <profile-name>");
  console.error("Profile name must be a lowercase slug: a-z, 0-9, -, starting with a letter.");
  process.exit(1);
}

mkdirSync(profileDir, { recursive: true });
const file = join(profileDir, `${name}.md`);
if (existsSync(file)) {
  console.error(`Profile template already exists: templates/profiles/${name}.md`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const title = name.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
writeFileSync(file, `---
name: ${name}
role: ${name}
summary: ""
created_on: ${today}
updated_on: ${today}
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

# ${title} Profile

## Responsibility

## Context

## Skills And Tools

## Workflow

## Human Escalation

## Output
`, "utf8");
console.log(`Created profile template: templates/profiles/${name}.md`);
