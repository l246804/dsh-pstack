/**
 * dsh-pstack Host entry: the bundled skill provider and `pstack_skill`.
 *
 * One `ctx.skills` provider serves the generated pstack tree and the independent skill
 * trees. The catalog is built once at activation and never watched; reinstalling the
 * package is the refresh boundary. A malformed bundled skill fails activation with a
 * path-qualified error instead of removing one skill from the catalog.
 *
 * `pstack_skill` is registered from the same row because it is the other half of the
 * provider: the provider keeps hidden skills out of the model catalog, and the tool
 * gives trusted pstack routing a way to load them by name.
 */

import { registerAuditContext } from "./internal/audit-context.ts";
import type { SkillProvider, SkillProviderControl, ToolsHost } from "./internal/host-contract.ts";
import { SKILL_ROOTS } from "./internal/paths.ts";
import {
  DEFAULT_PROVIDER_NAME,
  createPstackSkillProvider,
  loadBundledSkillIndexes,
} from "./internal/skill-provider.ts";
import { apply as applySkillTool, type SkillsHost } from "./skill.ts";

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack";

/** The row needs the skill registry and the tool registry. */
export const inject = ["skills", "tools"];

/** The slice of the Cordis context this plugin requires. */
export interface PstackSkillHost {
  readonly skills: SkillsHost & {
    registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void;
  };
  readonly tools: ToolsHost;
  /** Optional-service read for `systemPrompt`; absent is fine. */
  get?(name: string): unknown;
}

/**
 * Register the bundled pstack skill provider and the trusted loader.
 *
 * @param ctx - host context carrying the skill and tool registries.
 * @throws {import("./internal/skill-provider.ts").BundledSkillError} when the tree is malformed.
 */
export function apply(ctx: PstackSkillHost): void {
  const index = loadBundledSkillIndexes(SKILL_ROOTS);
  ctx.skills.registerProvider((_control) =>
    createPstackSkillProvider(index, DEFAULT_PROVIDER_NAME),
  );
  registerAuditContext(ctx);
  applySkillTool({ skills: ctx.skills, tools: ctx.tools });
}

export {
  AUTHORED_SKILLS_ROOT,
  HARNESS_DOC_PATH,
  PACKAGE_ROOT,
  PORT_ROOT,
  SKILLS_ROOT,
  SKILL_ROOTS,
  VENDORED_SKILLS_ROOT,
} from "./internal/paths.ts";
export type { SkillRoot } from "./internal/paths.ts";
export {
  BUNDLED_SKILL_RANK,
  BundledSkillError,
  DEFAULT_PROVIDER_NAME,
  createPstackSkillProvider,
  loadBundledSkillIndexes,
} from "./internal/skill-provider.ts";
export {
  createPstackSkillTool,
  readSkillResource,
  renderLoadedSkill,
  TOOL_NAME as PSTACK_SKILL_TOOL_NAME,
} from "./skill.ts";
export type { LoadSkillResult, SkillResourceResult } from "./skill.ts";
