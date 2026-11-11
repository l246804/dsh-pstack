import { behaviorScenario, behaviorScenarios } from "../../scenarios/index.ts";
import type { BehaviorScenario } from "../../types.ts";

export function listScenarioIds(): string[] {
  return behaviorScenarios.map((scenario) => scenario.id);
}

export function loadScenario(id: string): BehaviorScenario {
  return behaviorScenario(id);
}

export function listScenariosForSkill(skill: string): BehaviorScenario[] {
  return behaviorScenarios.filter((scenario) => scenario.skill === skill);
}
