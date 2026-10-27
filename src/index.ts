/**
 * dsh-pstack Host entry.
 *
 * Unit 2 ships one minimal capability: a single `ctx.skills` provider over the
 * generated assets in this package. Delegation, restricted history, roles, and
 * the worktree integration are later units and are deliberately absent here.
 *
 * The provider contract types live in `./provider.ts` and are structural copies
 * of the `@deepseek-ai/dsh-skill` 0.2.1-rc.3 declarations, so this module imports
 * nothing from the host packages at runtime.
 */

import { SKILLS_EXT_ROOT, SKILLS_ROOT } from "./paths.ts";
import {
  DEFAULT_PROVIDER_NAME,
  createPstackSkillProvider,
  loadBundledSkillIndexes,
} from "./provider.ts";
import type { SkillProvider, SkillProviderControl } from "./provider.ts";
import { registerAuditContext } from "./audit-context.ts";

/** Plugin name used by Loader diagnostics for this row. */
export const name = "pstack";

/** The provider needs the skill registry and nothing else. */
export const inject = ["skills"];

/** Row configuration. Every field is optional; an omitted `config` is valid. */
export interface PstackConfig {
  /** Registry name for the provider; change it when two rows must coexist. */
  readonly providerName?: string;
}

interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

type StandardSchemaResult =
  | { readonly value: PstackConfig; readonly issues?: undefined }
  | { readonly issues: readonly StandardSchemaIssue[] };

/**
 * Minimal Standard Schema validator for this plugin's row config.
 *
 * Cordis validates `apply()`'s second argument with `Config["~standard"]` and
 * substitutes the returned `value`, so an omitted row `config` resolves to the
 * documented defaults without a schemastery dependency.
 */
export const Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-pstack",
    validate(value: unknown): StandardSchemaResult {
      if (value === undefined || value === null) {
        return { value: { providerName: DEFAULT_PROVIDER_NAME } };
      }
      if (typeof value !== "object" || Array.isArray(value)) {
        return { issues: [{ message: "config must be a mapping" }] };
      }

      const issues: StandardSchemaIssue[] = [];
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (key !== "providerName") issues.push({ message: `unknown field "${key}"`, path: [key] });
      }

      const providerName = record["providerName"];
      if (providerName === undefined) {
        return issues.length > 0
          ? { issues }
          : { value: { providerName: DEFAULT_PROVIDER_NAME } };
      }
      if (typeof providerName !== "string" || providerName.trim() === "") {
        issues.push({ message: "providerName must be a non-empty string", path: ["providerName"] });
        return { issues };
      }

      return issues.length > 0 ? { issues } : { value: { providerName } };
    },
  },
};

/** The slice of the Cordis context this plugin requires. */
export interface PstackSkillHost {
  readonly skills: {
    registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void;
  };
  /**
   * Optional-service accessor.
   *
   * `systemPrompt` is deliberately absent from `inject`: a composition without a
   * prompt registry would then keep this whole row inactive and drop every skill.
   * `get` reads an absent service as `undefined` instead, which is why the registry
   * is reached through it rather than as a property.
   */
  get?(name: string): unknown;
}

/**
 * Register the bundled pstack skill provider.
 *
 * The bundled tree is validated before the provider registers, so a malformed
 * `SKILL.md` fails plugin activation with a path-qualified error instead of
 * removing one skill from the catalog. Nothing is copied out of the package and
 * nothing is watched: reinstalling the package is the refresh boundary.
 *
 * @param ctx - host context carrying the skill registry.
 * @param config - validated row config.
 * @throws {import("./provider.ts").BundledSkillError} when the bundled tree is malformed.
 */
export function apply(ctx: PstackSkillHost, config: PstackConfig = {}): void {
  const providerName = config.providerName ?? DEFAULT_PROVIDER_NAME;
  const index = loadBundledSkillIndexes(SKILLS_ROOT, SKILLS_EXT_ROOT);
  ctx.skills.registerProvider((_control) => createPstackSkillProvider(index, providerName));
  registerAuditContext(ctx);
}

export { ASSETS_ROOT, HARNESS_DOC_PATH, PACKAGE_ROOT, SKILLS_EXT_ROOT, SKILLS_ROOT } from "./paths.ts";
export {
  BUNDLED_SKILL_RANK,
  BundledSkillError,
  DEFAULT_PROVIDER_NAME,
  createPstackSkillProvider,
  createPstackSkillProviderFromRoot,
  loadBundledSkillIndex,
  loadBundledSkillIndexes,
} from "./provider.ts";
export type {
  BundledSkill,
  BundledSkillIndex,
  SkillCandidate,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
  SkillResourceBase,
  SkillSource,
  SkillSummary,
} from "./provider.ts";
export * from "./frontmatter.ts";
