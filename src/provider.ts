/**
 * Bundled pstack skill provider.
 *
 * One provider hosts every pstack skill so the catalog stays one entry per
 * skill and the package ships as a single installable bundle. The provider is
 * immutable: `assets/skills/` is generated at build time, so discovery always
 * completes with the same list.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
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
  readonly skillPath: string;
}

export const PROVIDER_NAME = "pstack";

function text(value: string | undefined): string {
  return (value ?? "").trim();
}

/**
 * Resolve one skill directory against the bundled root or an absolute path.
 */
function skillDirectory(directory: string): string {
  return isAbsolute(directory) ? resolve(directory) : resolve(SKILLS_ROOT, directory);
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
    skillPath: join(skillDirectory(directory), "SKILL.md"),
  };
}

function resourceBase(skillPath: string) {
  return { kind: "directory" as const, path: `${dirname(skillPath)}/` };
}

export function toCandidate(entry: PstackSkillEntry): SkillCandidate {
  return {
    name: entry.name,
    description: entry.description,
    invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable },
    provider: PROVIDER_NAME,
    source: "bundled",
    rank: BUNDLED_SKILL_RANK,
    resourceBase: resourceBase(entry.skillPath),
    locator: entry.skillPath,
    path: entry.skillPath,
  };
}

export interface PstackProviderOptions {
  /** Directory names to serve. The build passes the generated list. */
  readonly directories: readonly string[];
  /** Reads one skill body. Tests override it to avoid touching the package. */
  readonly read?: (directory: string) => string;
  /** Reports malformed or unavailable extra skill entries without disabling the provider. */
  readonly onError?: (directory: string, error: unknown) => void;
  /** Bundled directories whose malformed entries must fail the provider. */
  readonly strictDirectories?: readonly string[];
}

export function createProvider(options: PstackProviderOptions): SkillProvider {
  const read =
    options.read ??
    ((directory: string) => readFileSync(join(skillDirectory(directory), "SKILL.md"), "utf8"));
  const entries: PstackSkillEntry[] = [];
  const strict = new Set(options.strictDirectories ?? []);
  for (const directory of options.directories) {
    try {
      entries.push(toEntry(directory, read(directory)));
    } catch (error) {
      if (strict.has(directory)) throw error;
      options.onError?.(directory, error);
    }
  }
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const load = (entry: PstackSkillEntry): SkillDefinition => {
    const { body } = parseFrontmatter(read(entry.directory));
    return {
      name: entry.name,
      description: entry.description,
      invocation: { modelInvocable: entry.modelInvocable, userInvocable: entry.userInvocable },
      provider: PROVIDER_NAME,
      source: "bundled",
      resourceBase: resourceBase(entry.skillPath),
      path: entry.skillPath,
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
  /** Extra absolute skill directories to serve alongside bundled skills. */
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
  const bundled = listBundledSkillDirectories();
  const directories = [
    ...new Set([
      ...bundled,
      ...(config.extraSkillDirectories ?? []).map((directory) => resolve(directory)),
    ]),
  ];
  const logger = ctx.logger("pstack");
  ctx.skills.registerProvider(() =>
    createProvider({
      directories,
      strictDirectories: bundled,
      onError: (directory, error) =>
        logger.warn("skipping extra skill directory %s: %s", directory, error),
    }),
  );
}

/** Absolute root of the generated skill tree, exported for doctor checks. */
export const skillsRoot = SKILLS_ROOT;
export const skillsRootUrl = SKILLS_ROOT_URL;
