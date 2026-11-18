export interface CoverageScenario {
  id: string;
  capability: string;
}

export interface CoverageInventoryEntry {
  id: string;
  status: string;
  probes?: { base?: string };
}

export interface CoverageExclusion {
  reason?: unknown;
  decidedBy?: unknown;
}

export type CoverageExclusions = Record<string, CoverageExclusion>;

/**
 * Cross-check the probe scenarios against the capability inventory and the user-approved
 * exclusions. Returns one message per broken rule, or an empty list when the three inputs
 * agree. A run with neither scenarios nor inventory entries is allowed: the probes have not
 * been generated yet.
 */
export function coverageProblems(
  scenarios: readonly CoverageScenario[],
  inventory: readonly CoverageInventoryEntry[],
  exclusions: CoverageExclusions,
): string[] {
  if (scenarios.length === 0 && inventory.length === 0) return [];
  const problems: string[] = [];
  if (scenarios.length > 0 && inventory.length === 0) {
    problems.push("scenarios are registered but the capability inventory is empty");
  }
  if (inventory.length > 0 && scenarios.length === 0) {
    problems.push("the capability inventory has entries but no scenarios are registered");
  }
  const inventoryIds = new Set(inventory.map((entry) => entry.id));
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.id));
  for (const scenario of scenarios) {
    if (!inventoryIds.has(scenario.capability)) {
      problems.push(`scenario ${scenario.id} references unknown capability ${scenario.capability}`);
    }
  }
  for (const entry of inventory) {
    if (entry.status === "covered") {
      const base = entry.probes?.base;
      if (base === undefined) {
        problems.push(`covered capability ${entry.id} has no base probe`);
      } else if (!scenarioIds.has(base)) {
        problems.push(`covered capability ${entry.id} points at unknown probe ${base}`);
      }
    }
    if (entry.status === "excluded") {
      const exclusion = exclusions[entry.id];
      const valid =
        exclusion !== undefined &&
        typeof exclusion.reason === "string" &&
        exclusion.reason.trim() !== "" &&
        exclusion.decidedBy === "user";
      if (!valid) {
        problems.push(
          `excluded capability ${entry.id} needs a user exclusion with a non-empty reason`,
        );
      }
    }
  }
  return problems;
}
