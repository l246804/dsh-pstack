import { fileURLToPath } from "node:url";

import { runnerImport } from "vite-plus";

import type { BehaviorScenario, Variant } from "../types.ts";
import { DEFAULT_ENVIRONMENTS, DEFAULT_VARIANTS } from "./defaults.ts";

interface ScenarioRegistry {
  behaviorScenarios: readonly BehaviorScenario[];
  behaviorScenario: (id: string) => BehaviorScenario;
}

const registryPath = fileURLToPath(new URL("../scenario/registry.ts", import.meta.url));
const loaded = (await runnerImport(registryPath)) as { module: ScenarioRegistry };
const registry = loaded.module;

export function listScenarioIds(): string[] {
  return registry.behaviorScenarios.map((scenario) => scenario.id);
}

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

export function listScenarioIdsFor(variant: Variant, environmentId: string): string[] {
  return listScenarioIds().filter((id) =>
    scenarioApplies(loadScenario(id), variant, environmentId),
  );
}

export function loadScenario(id: string): BehaviorScenario {
  return registry.behaviorScenario(id);
}
