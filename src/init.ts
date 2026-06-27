import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { addAgent, Agent, defaultSkills, normalizeInstalledSkill, repairCredsGitignore, skillFolderName, workspaceRoot } from "./workspace.js";

type Pattern = "solo" | "coder-reviewer" | "trinity" | "supervisor-worker" | "swarm" | "testing-reviewer" | "custom";

const SCAFFOLD_VERSION = "0.0.1";

const patternAgents: Record<Pattern, Agent[]> = {
  solo: [{ name: "worker", role: "worker", tool: "codex" }],
  "coder-reviewer": [
    { name: "worker", role: "worker", tool: "codex" },
    { name: "reviewer", role: "reviewer", tool: "claude" }
  ],
  trinity: [
    { name: "planner", role: "planner", tool: "claude" },
    { name: "worker", role: "worker", tool: "codex" },
    { name: "verifier", role: "verifier", tool: "opencode" }
  ],
  "supervisor-worker": [
    { name: "supervisor", role: "supervisor", tool: "claude" },
    { name: "worker", role: "worker", tool: "codex" }
  ],
  swarm: [
    { name: "researcher", role: "custom", tool: "claude" },
    { name: "builder", role: "worker", tool: "codex" }
  ],
  "testing-reviewer": [
    { name: "worker", role: "worker", tool: "codex" },
    { name: "tester", role: "tester", tool: "opencode" }
  ],
  custom: [{ name: "agent", role: "custom", tool: "codex" }]
};

export async function runInit(args: string[], cwd: string) {
  if (args.includes("--pattern") || args.some((arg) => arg.startsWith("--pattern=")) || args.includes("--agents") || args.some((arg) => arg.startsWith("--agents="))) {
    console.error("--pattern and --agents are not implemented in Phase 1. Run interactive `agent-rig init` instead.");
    return 1;
  }

  if (existsSync(join(cwd, ".agent-rig"))) {
    console.error("A .agent-rig/ workspace already exists. Use `agent-rig add` to add agents.");
    return 1;
  }

  if (args.includes("--yes")) {
    scaffold(cwd, {
      agents: patternAgents.solo,
      addProjectGitignore: true
    });
    console.log("Scaffolded .agent-rig/ with 1 agent.");
    return 0;
  }

  return runInteractiveInit(cwd);
}

async function runInteractiveInit(cwd: string) {
  const prompt = makePrompt();
  const project = detectProject(cwd);

  console.log(`Detected: ${project.type}`);
  console.log(`Project name: ${project.name}`);
  await prompt.ask(`Seed context.md with a README reference? ${project.hasReadme ? "(Y/n)" : "(y/N)"}`, project.hasReadme ? "y" : "n");

  const pattern = parsePattern(await prompt.ask("Setup pattern [solo/coder-reviewer/trinity/supervisor-worker/swarm/testing-reviewer/custom] (solo)", "solo"));
  const agents: Agent[] = [];

  for (const defaults of patternAgents[pattern]) {
    console.log(`\nAgent ${agents.length + 1}`);
    const name = await prompt.ask(`Name (${defaults.name})`, defaults.name);
    const role = await prompt.ask(`Role template (${defaults.role})`, defaults.role);
    const tool = await prompt.ask(`Subscription tool (${defaults.tool})`, defaults.tool);
    agents.push({ name, role, tool });
  }

  console.log("\nReady to scaffold:");
  for (const agent of agents) {
    console.log(`  .agent-rig/${agent.name}/  role: ${agent.role}  tool: ${agent.tool}`);
  }

  const addProjectGitignore = yes(await prompt.ask("Add .agent-rig/ to .gitignore? (Y/n)", "y"));
  const shouldScaffold = yes(await prompt.ask("Scaffold? (Y/n)", "y"));
  prompt.close();

  if (!shouldScaffold) {
    console.log("Cancelled.");
    return 0;
  }

  scaffold(cwd, { agents, addProjectGitignore });
  console.log(`Scaffolded .agent-rig/ with ${agents.length} ${agents.length === 1 ? "agent" : "agents"}.`);
  return 0;
}

function scaffold(cwd: string, options: { agents: Agent[]; addProjectGitignore: boolean }) {
  const root = workspaceRoot(cwd);
  mkdirSync(join(root, "_shared"), { recursive: true });
  mkdirSync(join(root, "human"), { recursive: true });

  repairCredsGitignore(root);
  writeFileSync(join(root, "_shared", "task_queue.json"), "[]\n", "utf8");
  writeJson(join(root, "_shared", "agent-rig.json"), {
    workspace_version: 1,
    scaffold_version: SCAFFOLD_VERSION,
    created_by: { name: "agent-rig", version: SCAFFOLD_VERSION }
  });
  writeJson(join(root, "_shared", "session.json"), {
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    agents: Object.fromEntries(options.agents.map((agent) => [agent.name, { role: agent.role, tool: agent.tool, status: "idle", last_seen_at: null }])),
    current_task_id: null,
    blockers: []
  });
  writeFileSync(join(root, "_shared", "context.md"), contextMarkdown(cwd), "utf8");
  writeFileSync(join(root, "human", "README.md"), "# Human\n\nUse this folder for approval, unblock, and override notes.\n", "utf8");

  for (const agent of options.agents) {
    addAgent(root, agent);
  }
  installDefaultSkills(join(root, "_shared", "skills"));

  if (options.addProjectGitignore) {
    addGitignoreEntry(cwd, ".agent-rig/");
  }
}

function contextMarkdown(cwd: string) {
  const project = detectProject(cwd);
  const readme = project.hasReadme ? "\nREADME: ./README.md\n" : "";
  return `# Project Context\n\nProject: ${project.name}\nType: ${project.type}\n${readme}`;
}

function addGitignoreEntry(cwd: string, entry: string) {
  const file = join(cwd, ".gitignore");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (current.split(/\r?\n/).includes(entry)) return;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(file, `${current}${prefix}${entry}\n`, "utf8");
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function installDefaultSkills(dir: string) {
  mkdirSync(dir, { recursive: true });
  for (const skill of defaultSkills) {
    if (process.env.AGENT_RIG_SKIP_SKILLS === "1") {
      mkdirSync(join(dir, skillFolderName(skill)), { recursive: true });
      continue;
    }
    const result = spawnSync("npx", ["skills", "add", skill.source, ...(skill.args ?? []), "--yes"], { cwd: dir, stdio: "inherit" });
    if (result.status) throw new Error(`Failed to install default skill: ${skill.name}`);
    normalizeInstalledSkill(dir, skill);
  }
}

function detectProject(cwd: string) {
  const packageJson = join(cwd, "package.json");
  const hasReadme = existsSync(join(cwd, "README.md"));
  if (existsSync(packageJson)) {
    try {
      const data = JSON.parse(readFileSync(packageJson, "utf8"));
      return { name: data.name ?? "unknown", type: "Node.js project", hasReadme };
    } catch {
      return { name: "unknown", type: "Node.js project", hasReadme };
    }
  }
  return { name: cwd.split(/[\\/]/).pop() ?? "unknown", type: "unknown project", hasReadme };
}

function parsePattern(value: string): Pattern {
  const byNumber: Record<string, Pattern> = {
    "1": "solo",
    "2": "coder-reviewer",
    "3": "trinity",
    "4": "supervisor-worker",
    "5": "swarm",
    "6": "testing-reviewer",
    "7": "custom"
  };
  const pattern = byNumber[value] ?? value;
  if (pattern in patternAgents) return pattern as Pattern;
  return "solo";
}

function makePrompt() {
  if (!input.isTTY) {
    const answers = readFileSync(0, "utf8").split(/\r?\n/);
    let index = 0;
    return {
      async ask(question: string, defaultValue: string) {
        console.log(`${question}\n> `);
        const answer = (answers[index++] ?? "").trim();
        return answer || defaultValue;
      },
      close() {}
    };
  }

  const rl = createInterface({ input, output });
  return {
    async ask(question: string, defaultValue: string) {
      const answer = (await rl.question(`${question}\n> `)).trim();
      return answer || defaultValue;
    },
    close() {
      rl.close();
    }
  };
}

function yes(value: string) {
  return !/^n(o)?$/i.test(value.trim());
}
