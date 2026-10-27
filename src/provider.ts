/**
 * The bundled pstack skill provider: one provider over the generated skills
 * that ship inside this package.
 *
 * The provider contract below mirrors `@deepseek-ai/dsh-skill` 0.2.1-rc.3, which
 * was read through the host Inspect provider (`Service.listService` with
 * `service: "skills"`) and the installed type declarations. It is restated here
 * as a structural contract instead of imported so the plugin keeps zero runtime
 * imports from the host packages: a workspace-directory bundle is linked from
 * its checkout, where `@deepseek-ai/*` is not resolvable.
 *
 * Design constraints this module enforces, from the port design document §8.1:
 *
 * - The catalog is built once from the package assets and never watched. A
 *   package update is the refresh boundary.
 * - A malformed bundled skill fails the whole index instead of disappearing
 *   from the catalog, so a broken asset is a startup error rather than a skill
 *   users silently cannot see.
 * - `get()` only accepts a locator this provider produced. Directory names are
 *   never joined from caller input.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatter, validateSkillFrontmatter } from "./frontmatter.ts";
import type { SkillRoot } from "./paths.ts";

/**
 * Standard precedence rank for packaged skill providers, re-exported by
 * `@deepseek-ai/dsh-skill` as `BUNDLED_SKILL_RANK`. Restated to keep the package
 * dependency-free; a mismatch only changes which provider wins a name collision.
 */
export const BUNDLED_SKILL_RANK = 600;

/** Default provider name used when the row does not override it. */
export const DEFAULT_PROVIDER_NAME = "pstack";

/** Origin bucket for a skill contribution. */
export type SkillSource =
  | "project-dsh"
  | "project-agents"
  | "runtime"
  | "user-dsh"
  | "user-agents"
  | "custom"
  | "bundled"
  | (string & {});

/** Optional provider-specific base used by loaded skill bodies to resolve relative resources. */
export type SkillResourceBase =
  | { readonly kind: "directory"; readonly path: string }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "opaque"; readonly description: string };

/** Invocation controls shared by skill discovery consumers. */
export interface SkillInvocationPolicy {
  /** Whether model-facing catalogs and loaders include this skill. */
  readonly modelInvocable: boolean;
  /** Whether human-facing command catalogs and loaders include this skill. */
  readonly userInvocable: boolean;
}

/** Invocation-neutral skill metadata returned by `ctx.skills.list()`. */
export interface SkillSummary {
  /** Absolute instruction file path. */
  readonly path?: string;
  /** Kebab-case identifier used to address the skill. */
  readonly name: string;
  /** Short routing description shown by discovery consumers. */
  readonly description: string;
  /** Optional extra routing guidance. */
  readonly whenToUse?: string;
  /** Resolved model and user invocation controls. */
  readonly invocation: SkillInvocationPolicy;
  /** Discovery source that produced this skill. */
  readonly source: SkillSource;
  /** Provider that owns this skill body. */
  readonly provider: string;
  /** Provider-specific base for relative resources. */
  readonly resourceBase?: SkillResourceBase;
}

/** Provider catalog entry used by the registry to merge and later load skills. */
export interface SkillCandidate extends SkillSummary {
  /** Lower ranks win duplicate skill names. */
  readonly rank: number;
  /** Opaque provider-owned handle passed back to `provider.get()`. */
  readonly locator: unknown;
  /** Parsed optional metadata object from provider-specific skill frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Complete parsed skill definition, including the body loaded by `ctx.skills.get()`. */
export interface SkillDefinition extends SkillSummary {
  /** Markdown instruction body after frontmatter removal. */
  readonly content: string;
  /** Parsed optional metadata object from frontmatter. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Caller context used for cwd-sensitive and abortable provider work. */
export interface SkillLookupOptions {
  /** Workspace selector for the current lookup. */
  readonly cwd?: string | undefined;
  /** Abort discovery or loading work for the current caller. */
  readonly signal?: AbortSignal | undefined;
}

/** Registration-scoped lifecycle capability handed to a provider factory. */
export interface SkillProviderControl {
  /** Aborts when registration fails or the exact provider registration is disposed. */
  readonly signal: AbortSignal;
  /** Invalidate completed catalogs and notify consumers. */
  readonly invalidate: () => void;
}

/** Provider interface for one source of skills. */
export interface SkillProvider {
  /** Unique provider name in the `ctx.skills` registry. */
  readonly name: string;
  /** List available skill candidates for the current lookup context. */
  readonly list: (options: SkillLookupOptions) => Promise<readonly SkillCandidate[]>;
  /** Load a complete skill body for a previously listed candidate. */
  readonly get: (
    candidate: SkillCandidate,
    options: SkillLookupOptions,
  ) => Promise<SkillDefinition | undefined>;
}

/** Opaque handle this provider hands back to itself; never derived from caller input. */
interface BundledSkillLocator {
  readonly kind: "bundled-skill";
  /** Absolute skill directory that also serves as the resource base. */
  readonly directory: string;
  /** Absolute `SKILL.md` path read by `get()`. */
  readonly instructionFile: string;
}

/** One validated on-disk bundled skill. */
export interface BundledSkill {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly invocation: SkillInvocationPolicy;
  /** Absolute skill directory; the candidate resource base. */
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

/**
 * Read and validate the whole shipped catalog.
 *
 * Roots come from `SKILL_ROOTS`. A `flat` root holds skill directories directly; a
 * `sourced` root holds one directory per upstream source, each holding its skills. The
 * model sees one catalog, and each root stays independently verifiable because it is
 * loaded by its own layout rule. The two `skills/` roots sit outside `pstack/` so that
 * a regeneration of the port cannot delete them.
 *
 * A skill name may appear in only one root. A duplicate is a packaging mistake, not a
 * precedence question, so it fails activation instead of letting one silently shadow
 * the other.
 *
 * @param roots - skill roots in load order, each labelled for collision errors.
 * @returns validated skills keyed by absolute skill directory.
 * @throws {BundledSkillError} when any root is malformed or names collide.
 */
export function loadBundledSkillIndexes(roots: readonly SkillRoot[]): BundledSkillIndex {
  const merged = mergeIndexes(
    roots.map((root) =>
      root.kind === "flat" ? loadBundledSkillIndex(root.path) : loadSourcedSkillIndex(root.path),
    ),
  );
  if (merged.size === 0) {
    const listed = roots.map((root) => `"${root.path}"`).join(", ");
    throw new BundledSkillError(`bundled skills: no skill directories under ${listed}`);
  }
  return merged;
}

/** Merge validated indexes, rejecting a name that appears in more than one. */
function mergeIndexes(indexes: readonly BundledSkillIndex[]): BundledSkillIndex {
  const merged = new Map<string, BundledSkill>();
  const byName = new Map<string, string>();

  for (const index of indexes) {
    for (const skill of index.values()) {
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
  return merged;
}

/**
 * Read every bundled skill below a tree whose first level is a source directory.
 *
 * `skills/vendored/<source>/<skill>/` groups vendored skills by where they came
 * from, so the layout mirrors `skills/sources.yml` and a maintainer can update one
 * upstream repository without touching another. The provider needs a flat catalog,
 * so this walks one level of source directories and merges what it finds.
 *
 * An absent or empty source root is not an error: a package may ship without any
 * vendored source at all.
 *
 * @param sourceRoot - absolute path holding one directory per upstream source.
 * @returns validated skills keyed by absolute skill directory.
 * @throws {BundledSkillError} when a source directory or a skill inside it is
 *   malformed, or when one name appears in two sources.
 */
export function loadSourcedSkillIndex(sourceRoot: string): BundledSkillIndex {
  let sources;
  try {
    sources = readdirSync(sourceRoot, { withFileTypes: true });
  } catch {
    return new Map<string, BundledSkill>();
  }

  const indexes: BundledSkillIndex[] = [];
  for (const source of sources.sort((left, right) => (left.name < right.name ? -1 : 1))) {
    if (!source.isDirectory()) {
      throw new BundledSkillError(
        `bundled skills: "${join(sourceRoot, source.name)}" is not a source directory; the extension tree groups skills under their upstream source`,
      );
    }
    indexes.push(loadBundledSkillIndex(join(sourceRoot, source.name), { allowEmpty: true }));
  }

  return mergeIndexes(indexes);
}

/**
 * Read and validate every bundled skill below one directory.
 *
 * This is the startup check: it runs before the provider registers, so a missing
 * `SKILL.md`, an invalid frontmatter block, or a name that disagrees with its
 * directory fails plugin activation with a path-qualified message instead of
 * dropping a skill from the catalog.
 *
 * @param skillsRoot - absolute path of the directory holding the skill directories.
 * @param options - `allowEmpty` lets the extension root ship empty before any
 *   third-party skill is vendored, which is its state on a fresh checkout.
 * @returns validated skills keyed by absolute skill directory, sorted by name.
 * @throws {BundledSkillError} when the tree or any skill in it is malformed.
 */
export function loadBundledSkillIndex(
  skillsRoot: string,
  options: { readonly allowEmpty?: boolean } = {},
): BundledSkillIndex {
  let entries;
  try {
    entries = readdirSync(skillsRoot, { withFileTypes: true });
  } catch (error) {
    if (options.allowEmpty === true) return new Map<string, BundledSkill>();
    throw new BundledSkillError(
      `bundled skills: cannot read "${skillsRoot}": ${messageOf(error)}`,
    );
  }

  const index = new Map<string, BundledSkill>();

  for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : 1))) {
    const directory = join(skillsRoot, entry.name);
    if (!entry.isDirectory()) {
      throw new BundledSkillError(
        `bundled skills: "${directory}" is not a skill directory; remove it or add a SKILL.md`,
      );
    }

    const instructionFile = join(directory, "SKILL.md");
    const text = readSkillFile(instructionFile);
    const frontmatter = readSkillFrontmatter(text, instructionFile);

    if (frontmatter.name !== entry.name) {
      throw new BundledSkillError(
        `${instructionFile}: skill name "${frontmatter.name}" does not match its directory "${entry.name}"`,
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

  if (index.size === 0) {
    if (options.allowEmpty === true) return index;
    throw new BundledSkillError(`bundled skills: no skill directories under "${skillsRoot}"`);
  }

  return index;
}

/**
 * Build the provider over an already validated index.
 *
 * @param index - result of {@link loadBundledSkillIndex}.
 * @param providerName - registry name for this provider.
 * @returns a read-only provider whose catalog never changes until the package does.
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

    async list(options) {
      throwIfAborted(options?.signal);
      return ordered.map(
        (skill): SkillCandidate => ({
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
          resourceBase: { kind: "directory", path: skill.directory },
        }),
      );
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
        resourceBase: { kind: "directory", path: skill.directory },
        content: body,
      };
    },
  };
}

/**
 * Load the index and build the provider in one step, failing on a malformed tree.
 *
 * `apply()` uses this exact function, so the startup failure path and the
 * provider used in tests are the same code.
 *
 * @param skillsRoot - absolute path of the bundled skill root.
 * @param providerName - registry name for this provider.
 * @returns the provider over the validated index.
 */
export function createPstackSkillProviderFromRoot(
  skillsRoot: string,
  providerName: string = DEFAULT_PROVIDER_NAME,
): SkillProvider {
  return createPstackSkillProvider(loadBundledSkillIndex(skillsRoot), providerName);
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

/** Parse and validate one skill header, reporting failures as bundled-asset errors. */
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
