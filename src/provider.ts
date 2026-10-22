/**
 * Bundled pstack skill provider.
 *
 * One provider hosts every pstack skill so the catalog stays one entry per
 * skill and the package ships as a single installable bundle. The provider is
 * immutable: `assets/skills/` is generated at build time, so discovery always
 * completes with the same list.
 */
import { readdirSync, readFileSync } from "node:fs";
import type { Context } from "@deepseek-ai/cordis";
import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from "@deepseek-ai/dsh-skill";
import { parseFrontmatter } from "./frontmatter.ts";
import { SKILLS_ROOT, SKILLS_ROOT_URL } from "./paths.ts";

export interface PstackSkillEntry {
  readonly name: string;
  readonly description: string;
  readonly modelInvocable: boolean;
  readonly userInvocable: boolean;
  readonly directory: string;
}

export const PROVIDER_NAME = "pstack";

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Parse one generated SKILL.md into the catalog entry the provider serves.
 * Generated files always carry `name` and `description`; a hand-edit that
 * removes them fails loudly instead of silently dropping the skill.
 */
export function toEntry(directory: string, source: string): PstackSkillEntry {
  const { data } = parseFrontmatter(source);
  if (!text(data.name) || !text(data.description)) {
    throw new Error(`pstack skill "${directory}" is missing name or description frontmatter`);
  }
  return {
    name: text(data.name),
    description: text(data.description),
    modelInvocable: data["disable-model-invocation"] !== "true",
    userInvocable: data["user-invocable"] !== "false",
    directory,
  };
}

function resourceBase(directory: string) {
  return { kind: "directory" as const, path: `${SKILLS_ROOT}${directory}/` };
}

export function toCandidate(entry: PstackSkillEntry): SkillCandidate {
  return {
    name: entry.name,
    description: entry.description,
    invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable },
    provider: PROVIDER_NAME,
    source: "bundled",
    rank: BUNDLED_SKILL_RANK,
    resourceBase: resourceBase(entry.directory),
    locator: entry.directory,
    path: `${SKILLS_ROOT}${entry.directory}/SKILL.md`,
  };
}

export interface PstackProviderOptions {
  /** Directory names to serve. The build passes the generated list. */
  readonly directories: readonly string[];
  /** Reads one skill body. Tests override it to avoid touching the package. */
  readonly read?: (directory: string) => string;
}

export function createProvider(options: PstackProviderOptions): SkillProvider {
  const read =
    options.read ??
    ((directory: string) => readFileSync(`${SKILLS_ROOT}${directory}/SKILL.md`, "utf8"));
  const entries = options.directories.map((directory) => toEntry(directory, read(directory)));
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const load = (entry: PstackSkillEntry): SkillDefinition => {
    const { body } = parseFrontmatter(read(entry.directory));
    return {
      name: entry.name,
      description: entry.description,
      invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable },
      provider: PROVIDER_NAME,
      source: "bundled",
      resourceBase: resourceBase(entry.directory),
      path: `${SKILLS_ROOT}${entry.directory}/SKILL.md`,
      content: body,
    };
  };

  return {
    name: PROVIDER_NAME,
    list: async () => entries.map(toCandidate),
    get: async (candidate) => {
      const entry = byName.get(candidate.name);
      return entry ? load(entry) : undefined;
    },
  };
}

export const name = "pstack";

export interface Config {
  /** Extra skill directories to serve in addition to the bundled set. */
  readonly extraSkillDirectories?: string[];
}

export const inject = ["skills"];

export function listBundledSkillDirectories(): string[] {
  return readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function apply(ctx: Context, config: Config = {}): void {
  const directories = [
    ...new Set([...listBundledSkillDirectories(), ...(config.extraSkillDirectories ?? [])]),
  ];
  ctx.skills.registerProvider(() => createProvider({ directories }));
}

/** Absolute root of the generated skill tree, exported for doctor checks. */
export const skillsRoot = SKILLS_ROOT;
export const skillsRootUrl = SKILLS_ROOT_URL;
