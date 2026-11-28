/** Legacy values accepted by file readers and the startup migration. */
import { normalizeRoleName } from "../roles/role-manifest.ts";
import { budgetTierFromLabel, budgetValueFor } from "../roles/budget.ts";

/** Roles upstream retired. An older role file may still name one; readers drop it silently. */
export const RETIRED_ROLE_KEYS = [
  "hardest tasks",
  "how explorer",
  "how explainer",
  "why investigators",
  "why synthesizer",
  "reflect tooling",
  "reflect judgment, divergent, synthesizer",
  "architect runners",
] as const;

const RETIRED_ROLE_KEY_SET = new Set<string>(RETIRED_ROLE_KEYS);

/** Whether a role key names a retired upstream role to drop instead of reporting unknown. */
export function isRetiredRoleKey(raw: string): boolean {
  return RETIRED_ROLE_KEY_SET.has(normalizeRoleName(raw));
}

/** Normalize an old budget label without changing unknown user labels. */
export function normalizeBudgetValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const tier = /^\s*unlimited\b/i.test(raw) ? "large" : budgetTierFromLabel(raw);
  return tier === undefined ? raw : budgetValueFor(tier);
}
