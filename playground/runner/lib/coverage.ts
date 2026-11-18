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
