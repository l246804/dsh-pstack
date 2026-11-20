import { createHash } from "node:crypto";

import type { BehaviorScenario } from "../types.ts";
import { DEFAULT_ENVIRONMENTS, DEFAULT_VARIANTS } from "./defaults.ts";
import { stableStringify } from "../shared/stable-json.ts";

/**
 * Stable hash over everything that defines what a probe asks for. Two records are only
 * comparable when their scenario content hash matches, so this is a run-identity axis and
 * never `upstreamRevision`.
 */
export function scenarioContentHash(scenario: BehaviorScenario): string {
  const payload = {
    capability: scenario.capability,
    kind: scenario.kind,
    gap: scenario.gap,
    variants: scenario.variants ?? DEFAULT_VARIANTS,
    environments: scenario.environments ?? DEFAULT_ENVIRONMENTS,
    turns: scenario.turns,
    workspace: scenario.workspace,
    assertions: scenario.assertions,
    rubric: scenario.rubric,
    uiObservations: scenario.uiObservations,
    answers: scenario.answers,
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
