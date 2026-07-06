import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse } from "@iarna/toml";
import { fileURLToPath } from "node:url";
import { loadWorkspaceProfile, profileInstructions, roleProfile } from "./profiles.js";

export type Agent = {
  name: string;
  role: string;
  tool: string;
};

export type SkillSpec = {
  source: string;
  name: string;
  args?: string[];
};

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const builtinSkillsDir = join(packageRoot, "templates", "skills");

export const roles = new Set(["supervisor", "planner", "worker", "verifier", "reviewer", "tester", "researcher", "writer", "custom"]);
export const tools = new Set(["claude", "codex", "opencode", "custom"]);
export const defaultSkills: SkillSpec[] = [
  { source: "vercel-labs/skills@find-skills", name: "find-skills" },
  { source: "anthropics/skills@skill-creator", name: "skill-creator" },
  { source: "https://github.com/mattpocock/skills", name: "handoff", args: ["--skill", "handoff"] }
];
export const credsGitignore = "*\n!.gitignore\n!*.toml\n!*.env.example\n";

export function workspaceRoot(cwd: string) {
  return join(cwd, ".agent-rig");
}

export function requireWorkspace(cwd: string) {
  const root = workspaceRoot(cwd);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error("Missing .agent-rig/ in the current directory.");
  return root;
}

export function validSlug(value: string) {
  return /^[a-z][a-z0-9-]{0,39}$/.test(value);
}

export function addAgent(root: string, agent: Agent, profileName = roleProfile(agent.role)) {
  const dir = join(root, agent.name);
  mkdirSync(join(dir, "logs"), { recursive: true });
  mkdirSync(join(dir, "skills"), { recursive: true });
  mkdirSync(join(dir, "tools"), { recursive: true });
  writeFileSync(join(dir, "agent.toml"), agentToml(agent), "utf8");
  writeFileSync(join(dir, "skills", ".gitkeep"), "", "utf8");
  writeFileSync(join(dir, "tools", ".gitkeep"), "", "utf8");
  writeFileSync(join(dir, "instructions.md"), profileInstructions(loadWorkspaceProfile(join(dir, ".."), profileName), agent.name), "utf8");
  writeFileSync(join(dir, "context.md"), `# ${agent.name} Context\n\nAgent-local notes for ${agent.name}.\n`, "utf8");
}

export function readAgents(root: string): Agent[] {
  const agents: Agent[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || ["_shared", "human", "skills", "tools", "channels"].includes(entry.name)) continue;
    const toml = join(root, entry.name, "agent.toml");
    if (!existsSync(toml)) continue;
    const data = parse(readFileSync(toml, "utf8")) as Record<string, unknown>;
    const table = typeof data.agent === "object" && data.agent !== null && !Array.isArray(data.agent) ? data.agent as Record<string, unknown> : data;
    agents.push({
      name: entry.name,
      role: typeof table.role === "string" ? table.role : "",
      tool: typeof table.tool === "string" ? table.tool : ""
    });
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name));
}

export function repairCredsGitignore(root: string) {
  const dir = join(root, ".creds");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitignore"), credsGitignore, "utf8");
}

export function skillFolderName(skill: string | SkillSpec) {
  if (typeof skill !== "string") return skill.name;
  return skill.includes("@") ? skill.split("@").pop()! : skill.split("/").pop()!;
}

export function normalizeInstalledSkill(dir: string, skill: string | SkillSpec) {
  const name = skillFolderName(skill);
  const direct = join(dir, name);
  const nested = join(dir, ".agents", "skills", name);
  if (!existsSync(direct) && existsSync(nested)) renameSync(nested, direct);
  const wrapper = join(dir, ".agents");
  if (existsSync(wrapper)) rmSync(wrapper, { recursive: true, force: true });
}

export function installSkill(dir: string, skill: SkillSpec) {
  if (!skill.source.startsWith("builtin:")) return false;
  cpSync(join(builtinSkillsDir, skill.source.slice("builtin:".length)), join(dir, skill.name), { recursive: true });
  return true;
}

function agentToml(agent: Agent) {
  return `role = "${agent.role}"\ntool = "${agent.tool}"\ninstructions = "instructions.md"\ncontext = "context.md"\n`;
}
