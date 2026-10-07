import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export const issuePlanStatuses = ["draft", "pushed", "approved"] as const;
export type IssuePlanStatus = (typeof issuePlanStatuses)[number];

export type IssuePlanFrontmatter = {
  issue: number;
  source_url: string;
  branch: string;
  status: IssuePlanStatus;
  created_at: string;
  approved_at?: string;
};

export type IssuePlan = {
  frontmatter: IssuePlanFrontmatter;
  body: string;
};

const invalidBranchCharacters = /[\u0000-\u0020\u007f~^:?*\\]/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateIssuePlanFrontmatter(value: unknown): IssuePlanFrontmatter {
  if (!isRecord(value)) throw new Error("Issue plan frontmatter must be an object");

  const issue = value.issue;
  if (typeof issue !== "number" || !Number.isInteger(issue) || issue < 1) throw new Error("Issue plan issue must be a positive integer");

  const sourceUrl = value.source_url;
  if (typeof sourceUrl !== "string" || !isHttpUrl(sourceUrl)) throw new Error("Issue plan source_url must be an HTTP or HTTPS URL");

  const branch = value.branch;
  if (typeof branch !== "string" || !isGitBranchName(branch)) {
    throw new Error("Issue plan branch is invalid");
  }

  const status = value.status;
  if (typeof status !== "string" || !issuePlanStatuses.includes(status as IssuePlanStatus)) {
    throw new Error(`Issue plan status must be one of: ${issuePlanStatuses.join(", ")}`);
  }
  const planStatus = status as IssuePlanStatus;

  const createdAt = value.created_at;
  assertTimestamp(createdAt, "created_at");

  const approvedAt = value.approved_at;
  if (typeof approvedAt !== "undefined") assertTimestamp(approvedAt, "approved_at");
  if (planStatus === "approved" && typeof approvedAt === "undefined") {
    throw new Error("Approved issue plans require approved_at");
  }

  return {
    issue,
    source_url: sourceUrl,
    branch,
    status: planStatus,
    created_at: createdAt,
    ...(typeof approvedAt === "undefined" ? {} : { approved_at: approvedAt })
  };
}

export function serializeIssuePlan(frontmatter: IssuePlanFrontmatter, body: string): string {
  const valid = validateIssuePlanFrontmatter(frontmatter);
  return `---\n${stringifyYaml(valid).trimEnd()}\n---\n${body}`;
}

export function parseIssuePlan(source: string, file = "issue plan"): IssuePlan {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error(`Issue plan is missing frontmatter: ${file}`);
  const metadata = parseYaml(match[1]);
  return { frontmatter: validateIssuePlanFrontmatter(metadata), body: source.slice(match[0].length) };
}

export function readIssuePlan(file: string): IssuePlan {
  return parseIssuePlan(readFileSync(file, "utf8"), file);
}

export function writeIssuePlan(file: string, frontmatter: IssuePlanFrontmatter, body: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, serializeIssuePlan(frontmatter, body), "utf8");
}

export function issueSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "issue";
}

export function issuePlanPath(root: string, issue: number, slug: string): string {
  if (!Number.isInteger(issue) || issue < 1) throw new Error("Issue plan issue must be a positive integer");
  const safeSlug = issueSlug(slug);
  return join(root, "docs", "plans", `issue-${issue}-${safeSlug}.md`);
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !timestampPattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Issue plan ${field} must be an ISO 8601 timestamp`);
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isGitBranchName(value: string): boolean {
  if (!value || value.startsWith("-") || invalidBranchCharacters.test(value)) return false;
  if (value.includes("..") || value.includes("@{")) return false;
  if (value.endsWith("/") || value.endsWith(".") || value.endsWith(".lock")) return false;
  return value.split("/").every((part) => part.length > 0 && !part.startsWith(".") && !part.endsWith(".lock"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
