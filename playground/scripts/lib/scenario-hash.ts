import { createHash } from "node:crypto";

import type { BehaviorScenario } from "../../types.ts";
import { stableStringify } from "./stable-json.ts";

/**
 * Stable hash over everything that defines what a probe asks for. Two records are only
 * comparable when their scenario content hash matches, so this is a run-identity axis and
 * never `upstreamRevision`.
 */
export function scenarioContentHash(scenario: BehaviorScenario): string {
  const payload = {
    capability: scenario.capability,
    treatments: scenario.treatments ?? ["native", "adapted"],
    environments: scenario.environments ?? ["base"],
    turns: scenario.turns,
    workspace: scenario.workspace,
    assertions: scenario.assertions,
    rubric: scenario.rubric,
    uiObservations: scenario.uiObservations,
    answers: scenario.answers,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
