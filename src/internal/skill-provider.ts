/**
 * The bundled pstack skill provider: one provider over the generated skills and the
 * independent skill trees that ship inside this package.
 *
 * Roots hold skills at different depths (`pstack/skills/<skill>`,
 * `skills/vendored/<source>/<skill>`, `skills/authored/<skill>`), so discovery walks
 * down until it finds a directory with a `SKILL.md` and stops there. A malformed
 * bundled skill fails the whole index instead of disappearing from the catalog: a
 * broken asset is a startup error, not a skill users silently cannot see.
 *
 * `get()` accepts only a locator this provider produced, so a caller cannot name an
 * arbitrary path.
 */

import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { parseFrontmatter, validateSkillFrontmatter } from "./frontmatter.ts";
import type {
  SkillCandidate,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillLookupOptions,
  SkillProvider,
  SkillResourceBase,
} from "./host-contract.ts";
import type { SkillRoot } from "./paths.ts";

/** Standard precedence rank for packaged skill providers. */
export const BUNDLED_SKILL_RANK = 600;

/** Default provider name. */
export const DEFAULT_PROVIDER_NAME = "pstack";

/** One validated on-disk bundled skill. */
export interface BundledSkill {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly invocation: SkillInvocationPolicy;
  /** Absolute skill directory; also the resource base. */
  readonly directory: string;
  /** Absolute `SKILL.md` path. */
  readonly instructionFile: string;
}

/** Validated skills keyed by their absolute directory. */
export type BundledSkillIndex = ReadonlyMap<string, BundledSkill>;

/** Raised when a bundled asset violates the provider contract. */
export class BundledSkillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundledSkillError";
  }
}

interface BundledSkillLocator {
  readonly kind: "bundled-skill";
  readonly directory: string;
  readonly instructionFile: string;
}

/**
 * Read and validate every bundled skill under every root.
 *
 * A skill name may appear in only one root; a duplicate is a packaging mistake, so it
 * fails activation rather than letting one silently shadow the other. A root that does
 * not exist is skipped, but an empty merged catalog fails.
 */
export function loadBundledSkillIndexes(roots: readonly SkillRoot[]): BundledSkillIndex {
  const merged = new Map<string, BundledSkill>();
  const byName = new Map<string, string>();

  for (const root of roots) {
    for (const skill of loadRoot(root).values()) {
      const previous = byName.get(skill.name);
      if (previous !== undefined) {
        throw new BundledSkillError(
          `bundled skills: "${skill.name}" is offered by both "${previous}" and "${skill.directory}"; one name belongs to one source`,
        );
      }
      byName.set(skill.name, skill.directory);
      merged.set(skill.directory, skill);
    }
  }

  if (merged.size === 0) {
    throw new BundledSkillError(
      `bundled skills: no skill directories under ${roots.map((root) => `"${root.path}"`).join(", ")}`,
    );
  }
  return merged;
}

/** Validate every skill under one root. */
function loadRoot(root: SkillRoot): BundledSkillIndex {
  const index = new Map<string, BundledSkill>();
  for (const directory of discoverSkillDirectories(root.path)) {
    const instructionFile = join(directory, "SKILL.md");
    const text = readSkillFile(instructionFile);
    const frontmatter = readSkillFrontmatter(text, instructionFile);
    if (frontmatter.name !== basename(directory)) {
      throw new BundledSkillError(
        `${instructionFile}: skill name "${frontmatter.name}" does not match its directory "${basename(directory)}"`,
      );
    }
    index.set(directory, {
      name: frontmatter.name,
      description: frontmatter.description,
      ...(frontmatter.whenToUse === undefined ? {} : { whenToUse: frontmatter.whenToUse }),
      invocation: {
        modelInvocable: !frontmatter.disableModelInvocation,
        userInvocable: frontmatter.userInvocable,
      },
      directory,
      instructionFile,
    });
  }
  return index;
}

/** Directories that hold a `SKILL.md`, discovered recursively. A found skill is a leaf. */
function discoverSkillDirectories(root: string): string[] {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw new BundledSkillError(`bundled skills: cannot read "${root}": ${messageOf(error)}`);
  }

  if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) return [root];

  const found: string[] = [];
  const children = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => (left.name < right.name ? -1 : 1));
  for (const child of children) {
    found.push(...discoverSkillDirectories(join(root, child.name)));
  }
  return found;
}

/**
 * Build the provider over an already validated index.
 *
 * The catalog is sorted by name so two installs present the same order, and it never
 * changes until the package does.
 */
export function createPstackSkillProvider(
  index: BundledSkillIndex,
  providerName: string = DEFAULT_PROVIDER_NAME,
): SkillProvider {
  const ordered = [...index.values()].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

  return {
    name: providerName,

    async list(options: SkillLookupOptions) {
      throwIfAborted(options?.signal);
      return ordered.map((skill): SkillCandidate => ({
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
        invocation: skill.invocation,
        source: "bundled",
        provider: providerName,
        rank: BUNDLED_SKILL_RANK,
        locator: {
          kind: "bundled-skill",
          directory: skill.directory,
          instructionFile: skill.instructionFile,
        } satisfies BundledSkillLocator,
        path: skill.instructionFile,
        resourceBase: { kind: "directory", path: skill.directory } satisfies SkillResourceBase,
      }));
    },

    async get(candidate, options) {
      const locator = asBundledSkillLocator(candidate.locator);
      if (locator === undefined) return undefined;

      const skill = index.get(locator.directory);
      if (
        skill === undefined ||
        skill.instructionFile !== locator.instructionFile ||
        skill.name !== candidate.name
      ) {
        return undefined;
      }

      throwIfAborted(options?.signal);

      const text = readOptionalSkillFile(skill.instructionFile);
      if (text === undefined) return undefined;
      const { body } = parseFrontmatter(text);

      return {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
        invocation: skill.invocation,
        source: "bundled",
        provider: providerName,
        path: skill.instructionFile,
        resourceBase: { kind: "directory", path: skill.directory } satisfies SkillResourceBase,
        content: body,
      } satisfies SkillDefinition;
    },
  };
}

function asBundledSkillLocator(locator: unknown): BundledSkillLocator | undefined {
  if (typeof locator !== "object" || locator === null) return undefined;
  const candidate = locator as Partial<BundledSkillLocator>;
  if (candidate.kind !== "bundled-skill") return undefined;
  if (typeof candidate.directory !== "string") return undefined;
  if (typeof candidate.instructionFile !== "string") return undefined;
  return {
    kind: "bundled-skill",
    directory: candidate.directory,
    instructionFile: candidate.instructionFile,
  };
}

function readSkillFile(instructionFile: string): string {
  try {
    return readFileSync(instructionFile, "utf8");
  } catch (error) {
    throw new BundledSkillError(
      `bundled skills: cannot read "${instructionFile}": ${messageOf(error)}`,
    );
  }
}

function readSkillFrontmatter(
  text: string,
  instructionFile: string,
): ReturnType<typeof validateSkillFrontmatter> {
  try {
    const { data } = parseFrontmatter(text);
    return validateSkillFrontmatter(data, instructionFile);
  } catch (error) {
    const message = messageOf(error);
    throw new BundledSkillError(
      message.includes(instructionFile) ? message : `${instructionFile}: ${message}`,
    );
  }
}

function readOptionalSkillFile(instructionFile: string): string | undefined {
  try {
    return readFileSync(instructionFile, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return undefined;
    throw error;
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted !== true) return;
  throw signal.reason ?? new Error("skill provider work was aborted");
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
