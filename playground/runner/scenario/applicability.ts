import type { BehaviorScenario, Variant } from "../types.ts";
import { DEFAULT_ENVIRONMENTS, DEFAULT_VARIANTS } from "./defaults.ts";
export function scenarioApplies(
  scenario: BehaviorScenario,
  variant: Variant,
  environmentId: string,
): boolean {
  return (
    (scenario.variants ?? DEFAULT_VARIANTS).includes(variant) &&
    (scenario.environments ?? DEFAULT_ENVIRONMENTS).includes(environmentId)
  );
}
