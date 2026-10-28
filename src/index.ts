/**
 * dsh-pstack Host entry: the bundled skill provider.
 *
 * One `ctx.skills` provider serves the generated pstack tree and the independent skill
 * trees. The catalog is built once at activation and never watched; reinstalling the
 * package is the refresh boundary. A malformed bundled skill fails activation with a
 * path-qualified error instead of removing one skill from the catalog.
 */

import { registerAuditContext } from "./internal/audit-context.ts";
import type { SkillProvider, SkillProviderControl } from "./internal/host-contract.ts";
import { SKILL_ROOTS } from "./internal/paths.ts";
import {
  DEFAULT_PROVIDER_NAME,
  createPstackSkillProvider,
  loadBundledSkillIndexes,
} from "./internal/skill-provider.ts";

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack";

/** The provider needs the skill registry and nothing else. */
export const inject = ["skills"];

/** The slice of the Cordis context this plugin requires. */
export interface PstackSkillHost {
  readonly skills: {
    registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void;
  };
  /** Optional-service read for `systemPrompt`; absent is fine. */
  get?(name: string): unknown;
}

/**
 * Register the bundled pstack skill provider.
 *
 * @param ctx - host context carrying the skill registry.
 * @throws {import("./internal/skill-provider.ts").BundledSkillError} when the tree is malformed.
 */
export function apply(ctx: PstackSkillHost): void {
  const index = loadBundledSkillIndexes(SKILL_ROOTS);
  ctx.skills.registerProvider((_control) => createPstackSkillProvider(index, DEFAULT_PROVIDER_NAME));
  registerAuditContext(ctx);
}
