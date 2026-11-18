export interface CoverageScenario {
  id: string;
  capability: string;
  kind?: string;
  gap?: string;
  treatments?: readonly string[];
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

export interface CoverageGap {
  id: string;
  status: string;
}

export interface GapCoverageScenario {
  id: string;
  kind?: string;
  gap?: string;
  treatments?: readonly string[];
}

/**
 * Cross-check gap scenarios against the native gap list. A confirmed gap needs at least one
 * gap scenario, every gap scenario must reference an existing gap, a gap scenario must run in
 * both treatments, and a regression scenario must not claim a gap. Empty inputs are allowed
 * until the gap list and scenarios are generated.
 */
export function gapCoverageProblems(
  scenarios: readonly GapCoverageScenario[],
  gaps: readonly CoverageGap[],
): string[] {
  if (scenarios.length === 0 && gaps.length === 0) return [];
  const problems: string[] = [];
  const gapIds = new Set(gaps.map((gap) => gap.id));
  const scenariosByGap = new Map<string, number>();
  for (const scenario of scenarios) {
    if (scenario.kind === "gap") {
      if (scenario.gap === undefined) {
        problems.push(`gap scenario ${scenario.id} has no gap id`);
      } else if (!gapIds.has(scenario.gap)) {
        problems.push(`gap scenario ${scenario.id} references unknown gap ${scenario.gap}`);
      } else {
        scenariosByGap.set(scenario.gap, (scenariosByGap.get(scenario.gap) ?? 0) + 1);
      }
      if (
        scenario.treatments !== undefined &&
        (!scenario.treatments.includes("native") || !scenario.treatments.includes("adapted"))
      ) {
        problems.push(`gap scenario ${scenario.id} must run in both native and adapted`);
      }
    } else if (scenario.kind === "regression") {
      if (scenario.gap !== undefined) {
        problems.push(`regression scenario ${scenario.id} must not declare a gap`);
      }
    } else {
      problems.push(`scenario ${scenario.id} has no kind`);
    }
  }
  for (const gap of gaps) {
    if (gap.status === "confirmed" && !scenariosByGap.has(gap.id)) {
      problems.push(`confirmed gap ${gap.id} has no gap scenario`);
    }
  }
  return problems;
}
