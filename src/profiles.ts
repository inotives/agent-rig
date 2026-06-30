import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { SkillSpec } from "./workspace.js";

export type Profile = {
  name: string;
  path: string | null;
  source: "workspace" | "builtin";
  raw: string;
  meta: Record<string, unknown>;
  warnings: ProfileWarning[];
};

export type ProfileWarning = { path: string; message: string };

const required = ["name", "role", "summary", "created_on", "updated_on", "shared_skills", "agent_skills"];
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const templateDir = join(packageRoot, "templates", "profiles");

export function profilesDir(root: string) {
  return join(root, "_shared", "profiles");
}

export function roleProfile(role: string) {
  const map: Record<string, string> = {
    planner: "planner",
    supervisor: "planner",
    worker: "worker",
    reviewer: "reviewer",
    verifier: "reviewer",
    tester: "reviewer",
    researcher: "researcher",
    writer: "writer"
  };
  return map[role] ?? "worker";
}

export function seedProfiles(root: string) {
  const dir = profilesDir(root);
  mkdirSync(dir, { recursive: true });
  for (const profile of listBuiltinProfiles().profiles) {
    const dest = join(dir, `${profile.name}.md`);
    if (!existsSync(dest)) writeFileSync(dest, profile.raw, "utf8");
  }
}

export function listWorkspaceProfiles(root: string) {
  return listProfiles(profilesDir(root), "workspace");
}

export function listBuiltinProfiles() {
  return listProfiles(templateDir, "builtin");
}

export function loadWorkspaceProfile(root: string, name: string) {
  if (!validSlug(name)) throw new Error(`Invalid profile slug: ${name}`);
  const file = join(profilesDir(root), `${name}.md`);
  if (!existsSync(file)) throw new Error(`Profile not found: ${name}`);
  return parseProfile(file, "workspace");
}

export function profileInstructions(profile: Profile, agentName: string) {
  return profile.raw.replaceAll("<agent>", agentName);
}

export function skillSpecs(profile: Profile, key: "shared_skills" | "agent_skills") {
  const value = profile.meta[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isSkillSpec).map((item) => ({
    source: item.source,
    name: item.name,
    args: Array.isArray(item.args) ? item.args.filter((arg): arg is string => typeof arg === "string") : undefined
  }));
}

export function dedupeSkills(skills: SkillSpec[]) {
  const byName = new Map<string, SkillSpec>();
  for (const skill of skills) if (!byName.has(skill.name)) byName.set(skill.name, skill);
  return [...byName.values()];
}

function listProfiles(dir: string, source: "workspace" | "builtin") {
  const profiles: Profile[] = [];
  const warnings: ProfileWarning[] = [];
  if (!existsSync(dir)) return { profiles, warnings };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const name = entry.name.replace(/\.md$/, "");
    const path = join(dir, entry.name);
    if (!validSlug(name)) {
      warnings.push({ path: displayPath(path), message: "Invalid profile filename." });
      continue;
    }
    const profile = parseProfile(path, source);
    profiles.push(profile);
    warnings.push(...profile.warnings);
  }
  return { profiles: profiles.sort((a, b) => a.name.localeCompare(b.name)), warnings };
}

function parseProfile(path: string, source: "workspace" | "builtin"): Profile {
  const raw = readFileSync(path, "utf8");
  const filename = path.split(/[\\/]/).pop()!.replace(/\.md$/, "");
  const warnings: ProfileWarning[] = [];
  let meta: Record<string, unknown> = {};
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) {
    try {
      const parsed = parseYaml(match[1]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) meta = parsed as Record<string, unknown>;
      else warnings.push({ path: displayPath(path), message: "Profile frontmatter must be an object." });
    } catch (cause) {
      warnings.push({ path: displayPath(path), message: `Invalid profile frontmatter: ${cause instanceof Error ? cause.message : String(cause)}` });
    }
  } else {
    warnings.push({ path: displayPath(path), message: "Profile is missing YAML frontmatter." });
  }

  for (const key of required) if (typeof meta[key] === "undefined") warnings.push({ path: displayPath(path), message: `Profile frontmatter ${key} is required.` });
  if (typeof meta.name === "string" && meta.name !== filename) warnings.push({ path: displayPath(path), message: `Profile name "${meta.name}" should match filename "${filename}".` });
  for (const key of ["created_on", "updated_on"]) if (typeof meta[key] === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(meta[key])) warnings.push({ path: displayPath(path), message: `Profile ${key} should use YYYY-MM-DD.` });

  return { name: filename, path: source === "workspace" ? displayPath(path) : null, source, raw, meta, warnings };
}

function isSkillSpec(value: unknown): value is SkillSpec {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof (value as SkillSpec).source === "string" && typeof (value as SkillSpec).name === "string");
}

function displayPath(path: string) {
  const rel = relative(process.cwd(), path);
  return rel.startsWith("..") ? path : rel;
}

function validSlug(value: string) {
  return /^[a-z][a-z0-9-]{0,39}$/.test(value);
}
