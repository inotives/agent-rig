import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse } from "@iarna/toml";
import { addAgent, defaultSkills, normalizeInstalledSkill, readAgents, repairCredsGitignore, requireWorkspace, roles, SkillSpec, skillFolderName, tools, validSlug } from "./workspace.js";
import { listBuiltinProfiles, listWorkspaceProfiles, loadWorkspaceProfile, roleProfile, skillSpecs } from "./profiles.js";

type CredScope = { name: string; file: string; env: string; example: string; scope: string };

export function runAdd(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const name = args[0];
    const role = flag(args, "--role");
    const tool = flag(args, "--tool");
    const profileName = flag(args, "--profile") ?? roleProfile(role ?? "");

    if (!name || !role || !tool) return fail("Usage: agent-rig add <name> --role <role> --tool <tool>");
    if (!validSlug(name)) return fail("Agent name must be a lowercase slug: a-z, 0-9, -, starting with a letter.");
    if (!validSlug(role)) return fail("Role must be a lowercase slug: a-z, 0-9, -, starting with a letter.");
    if (!tools.has(tool)) return fail(`Unknown tool: ${tool}`);
    if (existsSync(join(root, name))) return fail(`Agent already exists: ${name}`);
    if (!roles.has(role)) console.warn(`warning: custom role "${role}" is valid but not built in. Add it to role templates later if it should be reusable.`);

    const profile = loadWorkspaceProfile(root, profileName);
    addAgent(root, { name, role, tool }, profile.name);
    const code = installProfileSkills(name, join(root, name, "skills"), skillSpecs(profile, "agent_skills"));
    if (code) return code;
    updateSession(root, name, role, tool);
    console.log(`Added agent ${name}.`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

export function runAgents(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const records = readAgents(root).map((agent) => ({
      ...agent,
      creds: existsSync(join(root, ".creds", `${agent.name}.toml`)),
      skills: existsSync(join(root, agent.name, "skills"))
    }));

    if (args.includes("--json")) console.log(JSON.stringify(records, null, 2));
    else {
      console.log("name\trole\ttool\tcreds\tskills");
      for (const agent of records) console.log(`${agent.name}\t${agent.role}\t${agent.tool}\t${agent.creds ? "yes" : "no"}\t${agent.skills ? "yes" : "no"}`);
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

export function runCreds(args: string[], cwd: string) {
  const [command, ...rest] = args;
  if (command === "init") return credsInit(rest, cwd);
  if (command === "list") return credsList(rest, cwd);
  return fail("Usage: agent-rig creds <init|list> [options]");
}

export function runSkills(args: string[], cwd: string) {
  const [command, ...rest] = args;
  if (command === "add") return skillsAdd(rest, cwd);
  if (command === "add-defaults") return skillsAddDefaults(rest, cwd);
  if (command === "list") return skillsList(rest, cwd);
  return fail("Usage: agent-rig skills <add|add-defaults|list> [options]");
}

export function runProfiles(args: string[], cwd: string) {
  const [command, name] = args.filter((arg) => arg !== "--json");
  const json = args.includes("--json");
  try {
    if (command === "show") {
      if (!name) return fail("Usage: agent-rig profiles show <name>");
      const root = existsSync(join(cwd, ".agent-rig")) ? join(cwd, ".agent-rig") : undefined;
      const profile = root ? loadWorkspaceProfile(root, name) : listBuiltinProfiles().profiles.find((item) => item.name === name);
      if (!profile) return fail(`Profile not found: ${name}`);
      process.stdout.write(profile.raw);
      return 0;
    }

    if (command && command !== "--json") return fail("Usage: agent-rig profiles [--json] | agent-rig profiles show <name>");
    const result = existsSync(join(cwd, ".agent-rig")) ? listWorkspaceProfiles(join(cwd, ".agent-rig")) : listBuiltinProfiles();
    if (json) {
      console.log(JSON.stringify({
        profiles: result.profiles.map((profile) => ({
          name: profile.name,
          role: profile.meta.role ?? "",
          summary: profile.meta.summary ?? "",
          path: profile.path,
          source: profile.source,
          shared_skills: skillSpecs(profile, "shared_skills"),
          agent_skills: skillSpecs(profile, "agent_skills")
        })),
        warnings: result.warnings
      }, null, 2));
    } else {
      for (const warning of result.warnings) console.warn(`${warning.path}: ${warning.message}`);
      if (!existsSync(join(cwd, ".agent-rig"))) console.log("Built-in profiles. Run `agent-rig init` to copy editable profiles into a workspace.");
      console.log("name\trole\tsummary");
      for (const profile of result.profiles) console.log(`${profile.name}\t${profile.meta.role ?? ""}\t${profile.meta.summary ?? ""}`);
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function credsInit(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    repairCredsGitignore(root);
    const scope = credScope(root, args);
    const keys = args.filter((arg) => !arg.startsWith("--") && arg !== scope.name);
    if (!keys.length) return fail("Usage: agent-rig creds init (--shared|--agent <name>) KEY [KEY...]");

    const declared = new Set([...readDeclaredKeys(scope.file), ...keys]);
    for (const key of declared) {
      if (!validCredKey(key, scope.scope)) return fail(`Invalid credential key for ${scope.name}: ${key}`);
    }

    writeCredFiles(scope, [...declared].sort());
    console.log(`Updated credentials for ${scope.name}.`);
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function credsList(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const agent = flag(args, "--agent");
    const shared = readDeclaredKeys(join(root, ".creds", "_shared.toml"));

    if (agent) {
      requireAgent(root, agent);
      const local = readDeclaredKeys(join(root, ".creds", `${agent}.toml`));
      printGroup("shared", shared);
      printGroup(agent, local, shared);
    } else {
      printGroup("shared", shared);
      for (const entry of readdirSync(join(root, ".creds"), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".toml") && entry.name !== "_shared.toml") {
          printGroup(entry.name.replace(/\.toml$/, ""), readDeclaredKeys(join(root, ".creds", entry.name)));
        }
      }
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function skillsAdd(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const repo = args[0];
    const skillName = flag(args, "--skill");
    const shared = args.includes("--shared");
    const agent = flag(args, "--agent");
    const dryRun = args.includes("--dry-run");
    if (!repo || repo.startsWith("--") || Number(shared) + Number(Boolean(agent)) !== 1) return fail("Usage: agent-rig skills add <source> [--skill <name>] (--shared|--agent <name>)");
    const dest = skillsDir(root, shared, agent);
    mkdirSync(dest, { recursive: true });
    return runNpxSkills(skillName ? { source: repo, name: skillName, args: ["--skill", skillName] } : { source: repo, name: skillFolderName(repo) }, dest, dryRun);
  } catch (cause) {
    return fail(message(cause));
  }
}

function skillsAddDefaults(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const dest = join(root, "_shared", "skills");
    mkdirSync(dest, { recursive: true });
    for (const skill of defaultSkills) {
      const code = runNpxSkills(skill, dest, args.includes("--dry-run"));
      if (code) return code;
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function skillsList(args: string[], cwd: string) {
  try {
    const root = requireWorkspace(cwd);
    const agent = flag(args, "--agent");
    const shared = listDirs(join(root, "_shared", "skills"));
    if (agent) {
      requireAgent(root, agent);
      printGroup("shared", shared);
      printGroup(agent, listDirs(join(root, agent, "skills")), shared);
    } else {
      printGroup("shared", shared);
      for (const item of readAgents(root)) printGroup(item.name, listDirs(join(root, item.name, "skills")));
    }
    return 0;
  } catch (cause) {
    return fail(message(cause));
  }
}

function credScope(root: string, args: string[]): CredScope {
  if (args.includes("--shared") === Boolean(flag(args, "--agent"))) throw new Error("Use exactly one of --shared or --agent <name>.");
  if (args.includes("--shared")) return scopeFiles(root, "_shared", "SHARED");
  const agent = flag(args, "--agent");
  if (!agent) throw new Error("Missing --agent <name>.");
  requireAgent(root, agent);
  return scopeFiles(root, agent, agent.toUpperCase().replaceAll("-", "_"));
}

function scopeFiles(root: string, name: string, scope: string): CredScope {
  const base = join(root, ".creds", name);
  return { name, scope, file: `${base}.toml`, env: `${base}.env`, example: `${base}.env.example` };
}

function writeCredFiles(scope: CredScope, keys: string[]) {
  writeFileSync(scope.file, `${keys.map((key) => `[keys.${key}]\ndescription = ""\n`).join("\n")}`, "utf8");
  const env = `${keys.map((key) => `${key}=`).join("\n")}\n`;
  writeFileSync(scope.example, env, "utf8");
  if (!existsSync(scope.env)) writeFileSync(scope.env, env, "utf8");
}

function readDeclaredKeys(file: string) {
  if (!existsSync(file)) return [];
  const data = parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  return data.keys && typeof data.keys === "object" && !Array.isArray(data.keys) ? Object.keys(data.keys) : [];
}

function validCredKey(key: string, scope: string) {
  const parts = key.match(/^AGENTRIG_([A-Z0-9]+)_([A-Z0-9_]+)_([A-Z0-9]+)$/);
  return Boolean(parts && parts[2] === scope);
}

function skillsDir(root: string, shared: boolean, agent?: string) {
  if (shared) return join(root, "_shared", "skills");
  if (!agent) throw new Error("Missing --agent <name>.");
  requireAgent(root, agent);
  return join(root, agent, "skills");
}

function runNpxSkills(skill: SkillSpec, cwd: string, dryRun: boolean) {
  if (dryRun || process.env.AGENT_RIG_SKIP_SKILLS === "1") {
    mkdirSync(join(cwd, skill.name), { recursive: true });
    console.log(`Skipped npx skills add ${skill.source}.`);
    return 0;
  }
  const result = spawnSync("npx", ["skills", "add", skill.source, ...(skill.args ?? []), "--yes"], { cwd, encoding: "utf8", stdio: "inherit" });
  if (result.status === 0) normalizeInstalledSkill(cwd, skill);
  return result.status ?? 1;
}

function installProfileSkills(group: string, dir: string, skills: SkillSpec[]) {
  mkdirSync(dir, { recursive: true });
  if (skills.length) console.log(`Installing ${group} skills...`);
  for (const skill of skills) {
    const code = runNpxSkills(skill, dir, false);
    if (code) return fail(`Failed to install ${group} skill: ${skill.name}`);
  }
  return 0;
}

function requireAgent(root: string, agent: string) {
  if (!validSlug(agent) || !existsSync(join(root, agent, "agent.toml"))) throw new Error(`Unknown agent: ${agent}`);
}

function updateSession(root: string, name: string, role: string, tool: string) {
  const file = join(root, "_shared", "session.json");
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, "utf8"));
  data.agents = { ...(data.agents ?? {}), [name]: { role, tool, status: "idle", last_seen_at: null } };
  data.updated_at = new Date().toISOString();
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function listDirs(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort();
}

function printGroup(name: string, items: string[], overrides: string[] = []) {
  console.log(`${name}:`);
  for (const item of items) console.log(`  ${item}${overrides.includes(item) ? " (overrides shared)" : ""}`);
}

function flag(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function fail(text: string) {
  console.error(text);
  return 1;
}

function message(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
