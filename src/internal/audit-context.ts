/**
 * What the model is told about where pstack working files go.
 *
 * This host has no per-agent store, so every ported playbook names a repository
 * directory instead. The contribution states one placement rule and does not claim the
 * directory survives the session, because nothing resumes from it on its own.
 *
 * `required: true` keeps the line present when optional runtime context is switched off.
 */

import type { PromptContext, SystemPromptHost } from "./host-contract.ts";

/** Default repository-relative directory for plans, trails, and orchestration state. */
export const AUDIT_DIRECTORY = ".audit";

const AUDIT_CONTEXT: PromptContext = {
  name: "pstack:audit-store",
  order: 500,
  text:
    `pstack writes working files that are not deliverables — plans, decision trails, and ` +
    `orchestration state — under \`${AUDIT_DIRECTORY}/\` in the repository unless the ` +
    `operator names another directory. Nothing outside the repository is assigned for ` +
    `this, and nothing resumes from that directory on its own: a resumed or recreated ` +
    `child must be handed its instructions again rather than told to re-read them. ` +
    `\`${AUDIT_DIRECTORY}/\` stays out of version control; commit a trail only when a ` +
    `reviewer needs it to trust the result.`,
  required: true,
};

/**
 * Register the placement rule, tolerating a host without `systemPrompt`.
 *
 * The service is read through `get`, never as a property: a row whose `inject` does not
 * name `systemPrompt` would throw on property access, and index must not inject it or a
 * composition without a prompt registry would drop every bundled skill.
 */
export function registerAuditContext(host: { get?(name: string): unknown }): boolean {
  const registry = host.get?.("systemPrompt");
  if (registry === undefined || registry === null) return false;
  const candidate = registry as Partial<SystemPromptHost>;
  if (typeof candidate.context !== "function") return false;
  candidate.context(AUDIT_CONTEXT);
  return true;
}
