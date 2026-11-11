import type { BehaviorScenario, EnvironmentMatrix, Exclusion } from "../types.ts";
import { potetoHelpSmoke } from "./poteto-help-smoke.ts";

export const behaviorScenarios: readonly BehaviorScenario[] = [potetoHelpSmoke];
export const scenariosById = new Map(behaviorScenarios.map((scenario) => [scenario.id, scenario]));

export function behaviorScenario(id: string): BehaviorScenario {
  const scenario = scenariosById.get(id);
  if (!scenario) throw new Error(`unknown behavior scenario: ${id}`);
  return scenario;
}

export const environments: readonly EnvironmentMatrix[] = [
  { id: "base", enabledPluginPackages: [] },
];

export const exclusions: readonly Exclusion[] = [
  {
    id: "make-bot-ui",
    skill: "make-bot-ui",
    reason: "Its workflow requires Cursor routines, a Grok Bot webhook, and SendToUser secrets.",
    evidence: "pstack/skills/make-bot-ui/SKILL.md#create-the-webhook-routine",
  },
  {
    id: "automations-benny",
    skill: "automations/benny",
    reason: "The automation pack requires two live Cursor automations.",
    evidence: "pstack/automations/benny/skills/setup-benny/SKILL.md",
  },
];
