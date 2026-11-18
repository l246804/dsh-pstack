import { createHash } from "node:crypto";

import type { BehaviorScenario } from "../../types.ts";

/** Recursively sort object keys so the same scenario always yields the same text. */
function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

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
  };
  return createHash("sha256").update(canonical(payload)).digest("hex");
}
