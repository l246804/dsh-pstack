export type Phase = "raw" | "adapted";

export interface TestTarget {
  provider: string;
  model: string;
  effort: string;
}

export interface ProviderAllowance {
  apiKey: string;
  models: Record<string, string[]>;
}

export interface PlaygroundConfig {
  testModel: TestTarget;
  providers: Record<string, ProviderAllowance>;
  hostPatchFile?: string;
  credentialsFile?: string;
}

export type AllowedRoute = TestTarget & {
  efforts: string[];
  apiKey: string;
};

export interface PreparedEnv {
  phase: Phase;
  home: string;
  browserHome: string;
  port: number;
  url: string;
  workspaceDirs: Record<string, string>;
}

export type Assertion =
  | { kind: "turn-completed" }
  | { kind: "skill-loaded"; skill: string }
  | { kind: "no-tool-error" }
  | { kind: "artifact-contains"; path: string; text: string }
  | { kind: "assistant-contains"; text: string };

export interface WorkspaceFixture {
  files: Record<string, string>;
}

export interface SemanticRubric {
  prompt: string;
}

export interface UiObservation {
  id: string;
  description: string;
}

export interface ScenarioSource {
  upstreamSkill: string;
  regression?: string;
}

export interface BehaviorScenario {
  type: "behavior";
  id: string;
  skill: string;
  turns: Array<{ prompt: string }>;
  workspace: WorkspaceFixture;
  assertions: Assertion[];
  rubric: SemanticRubric;
  uiObservations: UiObservation[];
  source: ScenarioSource;
  environmentId?: string;
  answers?: Array<{ match: string; selected?: string[]; custom?: string }>;
}

export interface ConflictRegression {
  type: "conflict-regression";
  id: string;
  turns: Array<{ prompt: string }>;
  workspace: WorkspaceFixture;
  expectedConflict: {
    packages: string[];
    symptom: string;
    recovery: string;
  };
  observations: UiObservation[];
  source: ScenarioSource;
  environmentId: string;
}

export interface PluginUiScenario {
  type: "plugin-ui";
  id: string;
  steps: Array<{ action: string; expected: string }>;
  observations: UiObservation[];
  source: ScenarioSource;
  environmentId: string;
}

export type Scenario = BehaviorScenario | ConflictRegression | PluginUiScenario;

export interface Exclusion {
  id: string;
  skill: string;
  reason: string;
  evidence: string;
}

export interface EnvironmentMatrix {
  id: string;
  enabledPluginPackages: string[];
}

export interface RunEnvironment {
  worker: number;
  dshVersion: string;
  adaptedVersion: string | null;
  matrix: EnvironmentMatrix;
  upstreamRevision: string;
  configHash: string;
}

export interface ToolCallEvidence {
  name: string;
  status: string;
  errorText?: string;
}

export interface SessionFacts {
  sessionId: string;
  sessionFile: string;
  workspacePath: string | null;
  agentPreset: string | null;
  skillLoads: string[];
  toolCalls: ToolCallEvidence[];
  turnEndReason: string | null;
  assistantText: string;
  userText: string;
  autoAnswers: Array<{ question: string; answer: string }>;
}

export interface ArtifactEvidence {
  recordFile: string;
  screenshotFile?: string;
  observed: string[];
}

export type SemanticReview =
  | { status: "pending"; reason: string }
  | {
      status: "supported" | "gap" | "inconclusive";
      reason: string;
      reviewer: { kind: "model"; route: TestTarget } | { kind: "human"; name: string };
    };

export type Verdict =
  | { phase: "raw"; status: "observed"; gaps: string[] }
  | { phase: "raw"; status: "gap"; gaps: string[] }
  | { phase: "raw"; status: "blocked"; reason: string }
  | { phase: "raw"; status: "unobserved"; reason: string }
  | { phase: "adapted"; status: "verified" }
  | { phase: "adapted"; status: "not-verified"; failures: string[] }
  | { phase: "adapted"; status: "inconclusive"; reason: string };

export interface RunRecord {
  scenarioId: string;
  phase: Phase;
  environment: RunEnvironment;
  target: TestTarget | null;
  session: SessionFacts | null;
  artifacts: ArtifactEvidence;
  semanticReview: SemanticReview;
  /**
   * Every mechanical check result at capture time (assertions, workspace, entry, route).
   * Always recorded: an unobserved or inconclusive verdict must not hide them, and a
   * review revision must not launder them. Records written before this field existed
   * lack it on disk.
   */
  mechanicalFailures: string[];
  verdict: Verdict;
  capturedAt: string;
  /** Set on a review revision: the reviewedAt of the sidecar that produced this record. */
  reviewedAt?: string;
}
