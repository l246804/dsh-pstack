export interface CoverageGap {
  id: string;
  status: string;
  /** Package-relative citations backing the gap: tree files or the answer documents. */
  sources?: string[];
}

export interface GapCoverageScenario {
  id: string;
  kind?: string;
  capability?: string;
  gap?: string;
  variants?: readonly string[];
}

/**
 * Cross-check gap scenarios against the native gap list. A confirmed gap needs at least one
 * gap scenario; every gap scenario must reference an existing confirmed gap, carry the same
 * capability id as its gap, and run in both variants; a regression scenario must not claim
 * a gap. Empty inputs are allowed until the gap list and scenarios are generated.
 */
export function gapCoverageProblems(
  scenarios: readonly GapCoverageScenario[],
  gaps: readonly CoverageGap[],
): string[] {
  if (scenarios.length === 0 && gaps.length === 0) return [];
  const problems: string[] = [];
  const statusById = new Map(gaps.map((gap) => [gap.id, gap.status]));
  const scenariosByGap = new Map<string, number>();
  for (const scenario of scenarios) {
    if (scenario.kind === "gap") {
      if (scenario.gap === undefined) {
        problems.push(`gap scenario ${scenario.id} has no gap id`);
      } else if (!statusById.has(scenario.gap)) {
        problems.push(`gap scenario ${scenario.id} references unknown gap ${scenario.gap}`);
      } else if (statusById.get(scenario.gap) !== "confirmed") {
        problems.push(
          `gap scenario ${scenario.id} references gap ${scenario.gap} with status ${statusById.get(scenario.gap)}; delete the scenario or restore the gap to confirmed`,
        );
      } else {
        scenariosByGap.set(scenario.gap, (scenariosByGap.get(scenario.gap) ?? 0) + 1);
      }
      if (scenario.capability !== undefined && scenario.capability !== scenario.gap) {
        problems.push(
          `gap scenario ${scenario.id} must use its gap id as capability (${scenario.gap}), not ${scenario.capability}`,
        );
      }
      if (
        scenario.variants !== undefined &&
        (!scenario.variants.includes("native") || !scenario.variants.includes("adapted"))
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
      problems.push(
        `confirmed gap ${gap.id} has no gap scenario; add one under playground/scenarios/probes or revert the status`,
      );
    }
  }
  return problems;
}
