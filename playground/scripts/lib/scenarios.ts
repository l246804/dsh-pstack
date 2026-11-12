import { behaviorScenario, behaviorScenarios, reviewScenarioIds } from "../../scenarios/index.ts";
import type { BehaviorScenario } from "../../types.ts";

export function listScenarioIds(): string[] {
  return behaviorScenarios.map((scenario) => scenario.id);
}

/** Behavior, plugin-UI, and conflict scenario ids: every owner of a review sidecar. */
export function listReviewScenarioIds(): string[] {
  return reviewScenarioIds();
}

export function loadScenario(id: string): BehaviorScenario {
  return behaviorScenario(id);
}

export function listScenariosForSkill(skill: string): BehaviorScenario[] {
  return behaviorScenarios.filter((scenario) => scenario.skill === skill);
}
