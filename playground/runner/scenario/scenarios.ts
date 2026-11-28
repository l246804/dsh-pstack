import { fileURLToPath } from "node:url";

import { runnerImport } from "vite-plus";

import type { BehaviorScenario, Variant } from "../types.ts";
import { scenarioApplies } from "./applicability.ts";
export { scenarioApplies } from "./applicability.ts";

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

export function listScenarioIdsFor(variant: Variant, environmentId: string): string[] {
  return listScenarioIds().filter((id) =>
    scenarioApplies(loadScenario(id), variant, environmentId),
  );
}

export function loadScenario(id: string): BehaviorScenario {
  return registry.behaviorScenario(id);
}
