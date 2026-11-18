import { fileURLToPath } from "node:url";

import { runnerImport } from "vite-plus";

import type { BehaviorScenario } from "../types.ts";

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

export function loadScenario(id: string): BehaviorScenario {
  return registry.behaviorScenario(id);
}
