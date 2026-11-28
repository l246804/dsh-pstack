/**
 * The pstack role manifest.
 *
 * Role keys are matched exactly after whitespace and comma normalization. Commas
 * belong to some keys (`feature, refactoring`), so the key is never split on a
 * comma. Role behavior comes from `pstack/skills/setup-pstack/SKILL.md`.
 */

/** Whether a role holds one route or a comma-separated list of routes. */
export const ROLE_SHAPES = ["single", "list"] as const;
export type RoleShape = (typeof ROLE_SHAPES)[number];

/** One role in the pstack role manifest, keyed and shaped for the role file and `pstack_roles`. */
export interface RoleSpec {
  /** Exact key as written in the role file. Commas belong to the key. */
  readonly key: string;
  readonly shape: RoleShape;
}

/** Values that resolve to "send no route override and inherit the parent route". */
export const INHERIT_ALIASES = ["inherit-parent", "auto"] as const;
export type InheritAlias = (typeof INHERIT_ALIASES)[number];

/** The 9 roles, in the order `setup-pstack` documents them. */
export const ROLE_MANIFEST = [
  { key: "feature, refactoring", shape: "single" },
  { key: "bug-fix", shape: "single" },
  { key: "perf-issue", shape: "single" },
  { key: "hillclimb", shape: "single" },
  { key: "judgment and prose", shape: "single" },
  { key: "arena runners", shape: "list" },
  { key: "arena cross-judge pool", shape: "list" },
  { key: "swarm workers", shape: "list" },
  { key: "interrogate reviewers", shape: "list" },
] as const satisfies readonly RoleSpec[];

export type RoleKey = (typeof ROLE_MANIFEST)[number]["key"];

/** Normalize spacing and comma formatting without splitting the key. */
export function normalizeRoleName(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/:+$/, "")
    .trim();
}

/** Look up one role by its exact normalized key. */
export function findRole(raw: string): RoleSpec | undefined {
  const key = normalizeRoleName(raw);
  return ROLE_MANIFEST.find((role) => role.key === key);
}

/** Whether a string is one of the manifest keys. */
export function isRoleKey(raw: string): raw is RoleKey {
  return findRole(raw) !== undefined;
}
