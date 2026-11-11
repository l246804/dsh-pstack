import type { BehaviorScenario, Exclusion } from "../types.ts";

import { architectDiscountStrategy as Architect } from "./architect.ts";
import { arenaDurationBakeoff as Arena } from "./arena.ts";
import { automateMeCapturePreferences as AutomateMe } from "./automate-me.ts";
import { benchmarkChecklist as BenchmarkChecklist } from "./benchmark-checklist.ts";
import { blastRadius as BlastRadius } from "./blast-radius.ts";
import { broPlainRestate as Bro } from "./bro.ts";
import { correct as Correct } from "./correct.ts";
import { createFormalVerificationSkillLeaseMutex as CreateFormalVerificationSkill } from "./create-formal-verification-skill.ts";
import { createVerificationSkillNotesWeb as CreateVerificationSkill } from "./create-verification-skill.ts";
import { figureItOutVarMigration as FigureItOut } from "./figure-it-out.ts";
import { howRequestFlow as How } from "./how.ts";
import { inYourOwnWordsGoalRestate as InYourOwnWords } from "./in-your-own-words.ts";
import { interrogateCartDiscount as Interrogate } from "./interrogate.ts";
import { ketchupVideoRecapSlides as KetchupVideo } from "./ketchup-video.ts";
import { ketchupRecapActionItems as Ketchup } from "./ketchup.ts";
import { maintainFormalVerificationSkillSeatOversell as MaintainFormalVerificationSkill } from "./maintain-formal-verification-skill.ts";
import { maintainVerificationSkillDriftedNotes as MaintainVerificationSkill } from "./maintain-verification-skill.ts";
import { noComments as NoComments } from "./no-comments.ts";
import { potetoHelpSmoke as PotetoHelpSmoke } from "./poteto-help-smoke.ts";
import { potetoModeFeatureRigor as PotetoMode } from "./poteto-mode.ts";
import { attackThePremiseApply as PrincipleAttackThePremise } from "./principle-attack-the-premise.ts";
import { boundaryDisciplineApply as PrincipleBoundaryDiscipline } from "./principle-boundary-discipline.ts";
import { buildTheLeverApply as PrincipleBuildTheLever } from "./principle-build-the-lever.ts";
import { encodeLessonsInStructureApply as PrincipleEncodeLessonsInStructure } from "./principle-encode-lessons-in-structure.ts";
import { exhaustTheDesignSpaceApply as PrincipleExhaustTheDesignSpace } from "./principle-exhaust-the-design-space.ts";
import { experienceFirstApply as PrincipleExperienceFirst } from "./principle-experience-first.ts";
import { explainTheNumberApply as PrincipleExplainTheNumber } from "./principle-explain-the-number.ts";
import { fixRootCausesApply as PrincipleFixRootCauses } from "./principle-fix-root-causes.ts";
import { foundationalThinkingApply as PrincipleFoundationalThinking } from "./principle-foundational-thinking.ts";
import { guardTheContextWindowApply as PrincipleGuardTheContextWindow } from "./principle-guard-the-context-window.ts";
import { lazinessProtocolApply as PrincipleLazinessProtocol } from "./principle-laziness-protocol.ts";
import { makeOperationsIdempotentApply as PrincipleMakeOperationsIdempotent } from "./principle-make-operations-idempotent.ts";
import { principleMigrateCallersThenDeleteLegacyApis as PrincipleMigrateCallersThenDeleteLegacyApis } from "./principle-migrate-callers-then-delete-legacy-apis.ts";
import { principleMinimizeReaderLoad as PrincipleMinimizeReaderLoad } from "./principle-minimize-reader-load.ts";
import { principleModelTheDomain as PrincipleModelTheDomain } from "./principle-model-the-domain.ts";
import { principleNeverBlockOnTheHuman as PrincipleNeverBlockOnTheHuman } from "./principle-never-block-on-the-human.ts";
import { principleOutcomeOrientedExecution as PrincipleOutcomeOrientedExecution } from "./principle-outcome-oriented-execution.ts";
import { principleProveItWorks as PrincipleProveItWorks } from "./principle-prove-it-works.ts";
import { principleRedesignFromFirstPrinciples as PrincipleRedesignFromFirstPrinciples } from "./principle-redesign-from-first-principles.ts";
import { principleSeparateBeforeSerializingSharedState as PrincipleSeparateBeforeSerializingSharedState } from "./principle-separate-before-serializing-shared-state.ts";
import { principleSequenceVerifiableUnits as PrincipleSequenceVerifiableUnits } from "./principle-sequence-verifiable-units.ts";
import { principleSubtractBeforeYouAdd as PrincipleSubtractBeforeYouAdd } from "./principle-subtract-before-you-add.ts";
import { principleTestBehaviorNotImplementation as PrincipleTestBehaviorNotImplementation } from "./principle-test-behavior-not-implementation.ts";
import { principleTypeSystemDiscipline as PrincipleTypeSystemDiscipline } from "./principle-type-system-discipline.ts";
import { recallDegradedNoHistory as Recall } from "./recall.ts";
import { reflectCompletedSearchWork as Reflect } from "./reflect.ts";
import { setupPstackModelConfig as SetupPstack } from "./setup-pstack.ts";
import { sharpenDeepenPrompt as Sharpen } from "./sharpen.ts";
import { showMeYourWorkMultiPhaseMigration as ShowMeYourWork } from "./show-me-your-work.ts";
import { statechartOrderShipRule as Statechart } from "./statechart.ts";
import { swarmBoundaryScan as Swarm } from "./swarm.ts";
import { tdd as Tdd } from "./tdd.ts";
import { teachTokenBucket as Teach } from "./teach.ts";
import { technicalWriting as TechnicalWriting } from "./technical-writing.ts";
import { typescriptBestPractices as TypescriptBestPractices } from "./typescript-best-practices.ts";
import { unslop as Unslop } from "./unslop.ts";
import { whyRetryRationale as Why } from "./why.ts";

export const behaviorScenarios: readonly BehaviorScenario[] = [
  Architect,
  Arena,
  AutomateMe,
  BenchmarkChecklist,
  BlastRadius,
  Bro,
  Correct,
  CreateFormalVerificationSkill,
  CreateVerificationSkill,
  FigureItOut,
  How,
  InYourOwnWords,
  Interrogate,
  KetchupVideo,
  Ketchup,
  MaintainFormalVerificationSkill,
  MaintainVerificationSkill,
  NoComments,
  PotetoHelpSmoke,
  PotetoMode,
  PrincipleAttackThePremise,
  PrincipleBoundaryDiscipline,
  PrincipleBuildTheLever,
  PrincipleEncodeLessonsInStructure,
  PrincipleExhaustTheDesignSpace,
  PrincipleExperienceFirst,
  PrincipleExplainTheNumber,
  PrincipleFixRootCauses,
  PrincipleFoundationalThinking,
  PrincipleGuardTheContextWindow,
  PrincipleLazinessProtocol,
  PrincipleMakeOperationsIdempotent,
  PrincipleMigrateCallersThenDeleteLegacyApis,
  PrincipleMinimizeReaderLoad,
  PrincipleModelTheDomain,
  PrincipleNeverBlockOnTheHuman,
  PrincipleOutcomeOrientedExecution,
  PrincipleProveItWorks,
  PrincipleRedesignFromFirstPrinciples,
  PrincipleSeparateBeforeSerializingSharedState,
  PrincipleSequenceVerifiableUnits,
  PrincipleSubtractBeforeYouAdd,
  PrincipleTestBehaviorNotImplementation,
  PrincipleTypeSystemDiscipline,
  Recall,
  Reflect,
  SetupPstack,
  Sharpen,
  ShowMeYourWork,
  Statechart,
  Swarm,
  Tdd,
  Teach,
  TechnicalWriting,
  TypescriptBestPractices,
  Unslop,
  Why,
];

export const scenariosById = new Map(behaviorScenarios.map((scenario) => [scenario.id, scenario]));

export function behaviorScenario(id: string): BehaviorScenario {
  const scenario = scenariosById.get(id);
  if (!scenario) throw new Error(`unknown behavior scenario: ${id}`);
  return scenario;
}

export { environments } from "./environments.ts";

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
