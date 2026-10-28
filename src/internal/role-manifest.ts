/**
 * The one pstack role manifest.
 *
 * Keys are matched exactly after normalization, and commas belong to some keys
 * (`feature, refactoring`, `reflect judgment, divergent, synthesizer`), so nothing here
 * may split a key on a comma. A second literal role list anywhere is a bug.
 *
 * This module has no Node imports: the bundle imports it directly.
 */

/** Whether a role holds one route or a comma-separated list of routes. */
export type RoleValueShape = "single" | "list";

export interface RoleSpec {
  /** Exact key as written in the role file. Commas belong to the key. */
  readonly key: string;
  readonly shape: RoleValueShape;
  /** A list role that starts one child per entry automatically. */
  readonly autoPanel: boolean;
}

/** File name the role configuration lives under inside `$DSH_HOME`. */
export const PSTACK_MODELS_FILENAME = "pstack-models.md";

/** Values that resolve to "send no `agentOptions` and inherit the parent route". */
export const INHERIT_PARENT_ALIASES: readonly string[] = ["inherit-parent", "auto"];

/** The 17 roles, in manifest order. */
export const ROLE_MANIFEST: readonly RoleSpec[] = [
  { key: "feature, refactoring", shape: "single", autoPanel: false },
  { key: "bug-fix", shape: "single", autoPanel: false },
  { key: "perf-issue", shape: "single", autoPanel: false },
  { key: "hillclimb", shape: "single", autoPanel: false },
  { key: "judgment and prose", shape: "single", autoPanel: false },
  { key: "hardest tasks", shape: "single", autoPanel: false },
  { key: "how explorer", shape: "single", autoPanel: false },
  { key: "how explainer", shape: "single", autoPanel: false },
  { key: "why investigators", shape: "single", autoPanel: false },
  { key: "why synthesizer", shape: "single", autoPanel: false },
  { key: "reflect tooling", shape: "single", autoPanel: false },
  { key: "reflect judgment, divergent, synthesizer", shape: "single", autoPanel: false },
  { key: "arena runners", shape: "list", autoPanel: true },
  { key: "arena cross-judge pool", shape: "list", autoPanel: false },
  { key: "swarm workers", shape: "list", autoPanel: false },
  { key: "architect runners", shape: "list", autoPanel: true },
  { key: "interrogate reviewers", shape: "list", autoPanel: true },
];

/** Exact manifest lookup. Callers normalize the key first. */
export function findRoleSpec(key: string): RoleSpec | undefined {
  return ROLE_MANIFEST.find((role) => role.key === key);
}

/** Every exact role key, in manifest order. */
export function roleKeys(): readonly string[] {
  return ROLE_MANIFEST.map((role) => role.key);
}
