/**
 * What the model is told about where working files go.
 *
 * Upstream's plays assume an agent store: a per-agent directory the host states in
 * the system prompt, outside the repository, surviving past the session. This host
 * has no such store, so every ported playbook names a repository directory instead.
 * That left one gap worth closing without inventing a store this host does not have:
 * a child that is never told the path has to be told by its caller, and a resumed
 * child has to be told again.
 *
 * The contribution here states one placement rule and nothing else. It deliberately
 * does not claim the directory survives the session, because it does not: the files
 * live on disk, but nothing resumes work from them on its own.
 *
 * `required: true` keeps the line present when optional runtime context is switched
 * off. It is one sentence in a user-role snapshot, and a playbook that writes to
 * `.audit/` is wrong the moment the rule disappears.
 */

import type { PromptContextContribution, SystemPromptHost } from "./host-contract.ts";

/** Default repository-relative directory for plans, trails, and orchestration state. */
export const AUDIT_DIRECTORY = ".audit";

/**
 * Registry name for this contribution.
 *
 * Prefixed with the plugin name so a second row or another plugin cannot collide:
 * the host throws on a duplicate name inside one layer.
 */
export const AUDIT_CONTEXT_NAME = "pstack:audit-store";

/** Sort order for the contribution. Placed with the other repository guidance. */
export const AUDIT_CONTEXT_ORDER = 500;

/**
 * The exact text registered with the host.
 *
 * Kept as a constant so a test can assert the sentence instead of a copy of it, and
 * so the wording change that matters (claiming durability) fails a check rather than
 * drifting in one direction.
 */
export const AUDIT_CONTEXT_TEXT =
  `pstack writes working files that are not deliverables — plans, decision trails, and ` +
  `orchestration state — under \`${AUDIT_DIRECTORY}/\` in the repository unless the ` +
  `operator names another directory. Nothing outside the repository is assigned for ` +
  `this, and nothing resumes from that directory on its own: a resumed or recreated ` +
  `child must be handed its instructions again rather than told to re-read them. ` +
  `\`${AUDIT_DIRECTORY}/\` stays out of version control; commit a trail only when a ` +
  `reviewer needs it to trust the result.`;

/** The contribution this module registers. */
export const AUDIT_CONTEXT: PromptContextContribution = {
  name: AUDIT_CONTEXT_NAME,
  order: AUDIT_CONTEXT_ORDER,
  text: AUDIT_CONTEXT_TEXT,
  required: true,
};

/**
 * Register the placement rule, tolerating a host without `systemPrompt`.
 *
 * The row is optional on purpose. A profile that composes a tool-only slice has no
 * prompt registry, and losing one sentence of placement guidance is a far better
 * outcome than refusing to start the whole provider.
 *
 * The service is read through `get`, never as a property. Cordis gates property
 * access on `inject`, so `host.systemPrompt` on a row whose `inject` does not name
 * that service throws `cannot get property "systemPrompt" without inject` — and
 * `pstack` must not inject it, because a composition without a prompt registry
 * would then keep the row inactive and drop all 55 skills. `get` returns `undefined`
 * for an absent service and the service when present.
 *
 * @returns whether a contribution was registered.
 */
export function registerAuditContext(host: {
  get?(name: string): unknown;
}): boolean {
  const registry = host.get?.("systemPrompt");
  if (registry === undefined || registry === null) return false;
  const candidate = registry as Partial<SystemPromptHost>;
  if (typeof candidate.context !== "function") return false;
  candidate.context(AUDIT_CONTEXT);
  return true;
}
