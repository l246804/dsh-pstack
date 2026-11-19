/**
 * Guards the adapter's role list and budget tiers against the bundled
 * `setup-pstack` skill. The manifest and budget constants are hand-maintained,
 * so this test fails when an upstream bump changes them without an adapter edit.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vite-plus/test";

import { BUDGET_TARGETS, BUDGET_TIERS } from "../src/roles/budget.ts";
import { ROLE_MANIFEST } from "../src/roles/role-manifest.ts";

const SKILL = new URL("../native/pstack/skills/setup-pstack/SKILL.md", import.meta.url);

/** The fenced block that follows one heading. */
function fencedAfter(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`setup-pstack is missing ${JSON.stringify(heading)}`);
  const open = text.indexOf("```", start);
  const close = text.indexOf("```", open + 3);
  if (open < 0 || close < 0) throw new Error("setup-pstack has no fenced shape block");
  return text.slice(open + 3, close);
}

/** Role keys from the step 5 role lines, in order. */
function upstreamRoleKeys(text: string): string[] {
  const lines = fencedAfter(text, "### 5. Write the rule").split("\n");
  const budgetAt = lines.findIndex((line) => /^#\s*budget\s*:/i.test(line));
  const keys: string[] = [];
  for (const line of budgetAt < 0 ? [] : lines.slice(budgetAt + 1)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    keys.push(trimmed.slice(0, colon).trim());
  }
  return keys;
}

/** Tier to target-effort mapping from the step 3 budget bullets. */
function upstreamBudgetTiers(text: string): Map<string, string> {
  const tiers = new Map<string, string>();
  for (const match of text.matchAll(/`([a-z]+) — ([a-z]+) reasoning`/g)) {
    tiers.set(match[1]!, match[2]!);
  }
  return tiers;
}

describe("upstream setup-pstack drift", () => {
  const text = readFileSync(SKILL, "utf8");

  it("keeps the role manifest in step order", () => {
    expect(ROLE_MANIFEST.map((role) => role.key)).toEqual(upstreamRoleKeys(text));
  });

  it("keeps the budget tiers and targets in sync", () => {
    const upstream = upstreamBudgetTiers(text);
    expect([...upstream.keys()]).toEqual([...BUDGET_TIERS]);
    for (const tier of BUDGET_TIERS) {
      expect(upstream.get(tier)).toBe(BUDGET_TARGETS[tier]);
    }
  });
});
