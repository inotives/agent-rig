import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateWorkspace } from "./validate.js";

type Check = { name: string; status: "pass" | "warn" | "fail"; message: string };

export function runDoctor(args: string[], cwd: string) {
  const json = args.includes("--json");
  const unknown = args.filter((arg) => arg !== "--json");
  const checks = unknown.length ? unknown.map((arg) => ({ name: "options", status: "fail" as const, message: `Unknown option: ${arg}` })) : doctorChecks(cwd);
  const ok = !checks.some((check) => check.status === "fail");
  if (json) console.log(JSON.stringify({ ok, checks }, null, 2));
  else for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.name}: ${check.message}`);
  return ok ? 0 : 1;
}

function doctorChecks(cwd: string) {
  const checks: Check[] = [];
  checks.push(nodeCheck());
  checks.push(commandCheck("npm"));
  checks.push(commandCheck("npx"));

  const root = join(cwd, ".agent-rig");
  if (!existsSync(root)) {
    checks.push({ name: "workspace", status: "fail", message: "No .agent-rig directory found. Run `agent-rig init`." });
    return checks;
  }

  checks.push({ name: "workspace", status: "pass", message: ".agent-rig directory found." });
  const result = validateWorkspace(cwd);
  for (const item of result.errors) checks.push({ name: "validate", status: "fail", message: `${item.path}: ${item.message}` });
  for (const item of result.warnings) checks.push({ name: "validate", status: "warn", message: `${item.path}: ${item.message}` });
  for (const name of ["find-skills", "skill-creator", "handoff"]) {
    checks.push(existsSync(join(root, "_shared", "skills", name))
      ? { name: `skill:${name}`, status: "pass", message: "Installed in shared skills." }
      : { name: `skill:${name}`, status: "warn", message: "Missing from shared skills." });
  }
  checks.push(existsSync(join(root, "_shared", "profiles"))
    ? { name: "profiles", status: "pass", message: "Shared profiles directory found." }
    : { name: "profiles", status: "warn", message: "Missing .agent-rig/_shared/profiles/." });
  return checks;
}

function nodeCheck(): Check {
  const version = Number(process.versions.node.split(".")[0]);
  return version >= 20
    ? { name: "node", status: "pass", message: `Node ${process.versions.node} satisfies >=20.` }
    : { name: "node", status: "fail", message: `Node ${process.versions.node} does not satisfy >=20.` };
}

function commandCheck(command: string): Check {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.status === 0
    ? { name: command, status: "pass", message: `${command} available.` }
    : { name: command, status: "fail", message: `${command} is not available.` };
}
