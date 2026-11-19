import type { BehaviorScenario, Treatment } from "../types.ts";

const DEFAULT_TREATMENTS: readonly Treatment[] = ["native", "adapted"];
const DEFAULT_ENVIRONMENTS: readonly string[] = ["base"];

/**
 * Probes live flat under playground/scenarios/probes. Each file default-exports a
 * BehaviorScenario; the registry supplies shared defaults for treatments and
 * environments so individual probes only declare deliberate deviations.
 */
const modules = import.meta.glob<{ default: BehaviorScenario }>("../../scenarios/probes/*.ts", {
  eager: true,
});

const collected = Object.values(modules)
  .map((module) => module.default)
  .filter(
    (scenario): scenario is BehaviorScenario =>
      scenario !== undefined && typeof scenario.id === "string",
  )
  .map((scenario) => ({
    ...scenario,
    treatments: scenario.treatments ?? DEFAULT_TREATMENTS,
    environments: scenario.environments ?? DEFAULT_ENVIRONMENTS,
  }));

const duplicates = collected
  .map((scenario) => scenario.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicates.length > 0) throw new Error(`duplicate scenario ids: ${duplicates.join(", ")}`);

export const behaviorScenarios: readonly BehaviorScenario[] = collected;
export const scenariosById = new Map(behaviorScenarios.map((scenario) => [scenario.id, scenario]));

export function behaviorScenario(id: string): BehaviorScenario {
  const scenario = scenariosById.get(id);
  if (!scenario) throw new Error(`unknown scenario: ${id}`);
  return scenario;
}
