/**
 * Role lookup over the single manifest in `src/role-manifest.ts`.
 *
 * A role name is matched exactly after normalization. A near miss is reported as
 * a hint and never guessed, because silently running a role on the wrong route is
 * worse than refusing the delegation.
 *
 * Commas belong to some keys (`feature, refactoring`), so nothing here splits a
 * key on a comma. Only a role file *value* is a comma-separated list.
 */

import {
  AUTO_PANEL_ROLE_KEYS,
  ROLE_MANIFEST,
  findRoleSpec,
  type RoleSpec,
  type RoleValueShape,
} from "./role-manifest.ts";

export { AUTO_PANEL_ROLE_KEYS, ROLE_MANIFEST, findRoleSpec, type RoleSpec, type RoleValueShape };

/** Raised when a role name does not match the manifest. */
export class RoleNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleNameError";
  }
}

/**
 * Normalize a role name for lookup.
 *
 * Case, surrounding whitespace, runs of whitespace, spacing around a comma, and a
 * trailing colon are formatting, not naming. Nothing else is normalized: a
 * different word is a different role.
 */
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

/** Every exact role key in manifest order. */
export function roleKeys(): readonly string[] {
  return ROLE_MANIFEST.map((role) => role.key);
}

/** Look a role up by its exact normalized key. */
export function lookupRole(raw: string): RoleSpec | undefined {
  return findRoleSpec(normalizeRoleName(raw));
}

/**
 * Near-miss hints for a role name that did not match.
 *
 * Only used to build a diagnostic. A suggestion is never turned into a selection.
 */
export function suggestRoles(raw: string, limit = 3): readonly string[] {
  const target = normalizeRoleName(raw);
  if (target === "") return [];

  const scored = ROLE_MANIFEST.map((role) => {
    const shared = sharedTokenCount(target, role.key);
    const distance = editDistance(target, role.key);
    const contains = role.key.includes(target) || target.includes(role.key);
    const score =
      (contains ? 1000 : 0) + shared * 100 - distance + Math.min(role.key.length, target.length);
    return { key: role.key, score, distance, shared, contains };
  }).filter((candidate) => candidate.contains || candidate.shared > 0 || candidate.distance <= 4);

  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((candidate) => candidate.key);
}

/**
 * Resolve a role name, or throw a diagnostic that names the near misses.
 */
export function requireRole(raw: string): RoleSpec {
  const spec = lookupRole(raw);
  if (spec !== undefined) return spec;

  const suggestions = suggestRoles(raw);
  const hint =
    suggestions.length === 0
      ? "No role key is close to it."
      : `Closest role keys: ${suggestions.map((key) => `"${key}"`).join(", ")}.`;
  throw new RoleNameError(
    `unknown pstack role ${JSON.stringify(raw)}. ${hint} Role names come from the role manifest, not from free text: pass the exact key, or omit \`role\` to inherit the parent route.`,
  );
}

function sharedTokenCount(left: string, right: string): number {
  const rightTokens = new Set(tokenize(right));
  return [...new Set(tokenize(left))].filter((token) => rightTokens.has(token)).length;
}

function tokenize(value: string): readonly string[] {
  return value.split(/[^a-z0-9]+/).filter((token) => token !== "");
}

/** Levenshtein distance, iterative with one row of state. */
function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left === "") return right.length;
  if (right === "") return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current: number[] = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = (previous[column - 1] as number) + (left[row - 1] === right[column - 1] ? 0 : 1);
      const deletion = (previous[column] as number) + 1;
      const insertion = (current[column - 1] as number) + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }
  return previous[right.length] as number;
}
