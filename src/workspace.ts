import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@iarna/toml";

export type Agent = {
  name: string;
  role: string;
  tool: string;
};

export const roles = new Set(["supervisor", "planner", "worker", "verifier", "reviewer", "tester", "custom"]);
export const tools = new Set(["claude", "codex", "opencode", "custom"]);
export const defaultSkills = ["vercel-labs/skills@find-skills", "anthropics/skills@skill-creator"];
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

export function addAgent(root: string, agent: Agent) {
  const dir = join(root, agent.name);
  mkdirSync(join(dir, "logs"), { recursive: true });
  writeFileSync(join(dir, "agent.toml"), agentToml(agent), "utf8");
  writeFileSync(join(dir, "instructions.md"), instructionsMarkdown(agent), "utf8");
  writeFileSync(join(dir, "context.md"), `# ${agent.name} Context\n\nAgent-local notes for ${agent.name}.\n`, "utf8");
  writeFileSync(join(dir, "queue.json"), "[]\n", "utf8");
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

export function skillFolderName(source: string) {
  return source.includes("@") ? source.split("@").pop()! : source.split("/").pop()!;
}

export function normalizeInstalledSkill(dir: string, source: string) {
  const name = skillFolderName(source);
  const direct = join(dir, name);
  const nested = join(dir, ".agents", "skills", name);
  if (!existsSync(direct) && existsSync(nested)) renameSync(nested, direct);
  const wrapper = join(dir, ".agents");
  if (existsSync(wrapper)) rmSync(wrapper, { recursive: true, force: true });
}

function agentToml(agent: Agent) {
  return `role = "${agent.role}"\ntool = "${agent.tool}"\ninstructions = "instructions.md"\ncontext = "context.md"\nqueue = "queue.json"\n`;
}

function instructionsMarkdown(agent: Agent) {
  return `# ${agent.name}\n\nRole: ${agent.role}\nTool: ${agent.tool}\n\nShared context: ../_shared/context.md\nTask queue: ../_shared/task_queue.json\nAgent context: ./context.md\n\nStart by reading the shared context, then your agent-local context.\n`;
}
