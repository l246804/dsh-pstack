export const TREATMENTS = ["native", "adapted"] as const;
export type Treatment = (typeof TREATMENTS)[number];

export function isTreatment(value: unknown): value is Treatment {
  return typeof value === "string" && TREATMENTS.some((treatment) => treatment === value);
}

export interface TestTarget {
  provider: string;
  model: string;
  effort: string;
}

export interface ProviderModel {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: Array<"text" | "image">;
  reasoningEfforts?: Record<string, string | null>;
}

export type ProviderConfig =
  | {
      kind: "pi-ai";
      apiKey: string;
      apiKeyEnv: string;
      api?: string;
      baseURL?: string;
      reasoning: string;
      models: ProviderModel[];
    }
  | {
      kind: "deepseek-api-key";
      apiKey: string;
      apiKeyEnv?: string;
      models: ProviderModel[];
    }
  | {
      kind: "deepseek-account";
      modelOverrides?: Record<string, unknown>;
    };

export interface BrowserConfig {
  mode?: "managed" | "cdp";
  cdpUrl?: string;
  headed?: boolean;
}

export type RoleModels = Record<string, TestTarget | TestTarget[]>;

export interface PlaygroundConfig {
  testModel: TestTarget;
  providers: Record<string, ProviderConfig>;
  roleModels?: RoleModels;
  browser?: BrowserConfig;
  copyCredentials?: boolean;
  credentialsFile?: string;
}

export type AllowedRoute = TestTarget & {
  efforts: string[];
  apiKey: string;
};

export type Assertion =
  | { kind: "turn-completed" }
  | { kind: "skill-loaded"; skill: string }
  | { kind: "no-tool-error" }
  | { kind: "artifact-contains"; path: string; text: string }
  | { kind: "artifact-dir-nonempty"; path: string }
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

export interface BehaviorScenario {
  id: string;
  turns: Array<{ prompt: string }>;
  workspace: WorkspaceFixture;
  assertions: Assertion[];
  rubric: SemanticRubric;
  uiObservations: UiObservation[];
  /** Treatments this probe is allowed to run in; omitted means both native and adapted. */
  treatments?: readonly Treatment[];
  /** Environments this probe runs in; omitted means only the base environment. */
  environments?: readonly string[];
  answers?: Array<{ match: string; selected?: string[]; custom?: string }>;
  /** Capability id this probe covers. */
  capability: string;
  /** Scenario kind: gap (linked to the native gap list) or regression. */
  kind?: "gap" | "regression";
  /** Native gap id this scenario verifies; required for gap scenarios. */
  gap?: string;
}

export type EnvironmentKind = "base" | "capability" | "conflict";

export interface EnvironmentMatrix {
  id: string;
  /** Why this environment exists. Written in Chinese. */
  description: string;
  kind: EnvironmentKind;
  enabledPluginPackages: string[];
  /** Package names force-loaded despite a peer/runtime version mismatch. */
  versionExemptions?: string[];
  /** Enable Agent Teams for new root Sessions in this environment. */
  teamMode?: boolean;
}

export interface RunEnvironment {
  worker: number;
  dshVersion: string;
  /** The released pstack version pinned in native/upstream.lock.json at capture time. */
  pstackVersion: string;
  adaptedVersion: string | null;
  matrix: EnvironmentMatrix;
  upstreamRevision: string;
  configHash: string;
}

export type ToolCallStatus = "pending" | "ok" | "error";

export interface ToolCallEvidence {
  name: string;
  status: ToolCallStatus;
  /**
   * Tool name plus its whitelisted audit arguments, capped at 200 characters. Only
   * listed keys (paths, commands, patterns, targets) are copied, so credentials and
   * payload parameters never reach the record.
   */
  argsSummary: string;
  errorText?: string;
}

export const SKILL_TOOL_NAMES = ["skill"] as const;
export interface ToolAttemptAnalysis {
  name: string;
  attempts: number;
  failures: number;
  firstAttemptStatus: "ok" | "error" | "pending";
  finalStatus: "ok" | "error" | "pending";
  /** True when at least one attempt failed and the final attempt succeeded. */
  recovered: boolean;
}

export interface SessionAnalysis {
  tools: ToolAttemptAnalysis[];
  artifacts: string[];
  warnings: string[];
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
  /** Every user-authored turn text in order; userText stays the first one for the entry check. */
  userTexts: string[];
  autoAnswers: Array<{ question: string; answer: string }>;
  analysis?: SessionAnalysis;
}

export interface ArtifactEvidence {
  recordFile: string;
  screenshotFile?: string;
  observed: string[];
}

export const SEMANTIC_REVIEW_STATUSES = ["supported", "gap", "inconclusive"] as const;
export type SemanticReviewStatus = (typeof SEMANTIC_REVIEW_STATUSES)[number];

export type SemanticReview =
  | { status: "pending"; reason: string }
  | {
      status: SemanticReviewStatus;
      reason: string;
      reviewer: { kind: "model"; route: TestTarget } | { kind: "human"; name: string };
    };

export const VERDICT_STATUSES = [
  "observed",
  "gap",
  "blocked",
  "unobserved",
  "verified",
  "not-verified",
  "inconclusive",
] as const;

export type Verdict =
  | { treatment: "native"; status: "observed"; gaps: string[] }
  | { treatment: "native"; status: "gap"; gaps: string[] }
  | { treatment: "native"; status: "blocked"; reason: string }
  | { treatment: "native"; status: "unobserved"; reason: string }
  | { treatment: "adapted"; status: "verified" }
  | { treatment: "adapted"; status: "not-verified"; failures: string[] }
  /** A conflict regression whose expected startup conflict reproduced: blocked by design. */
  | { treatment: "adapted"; status: "blocked"; reason: string }
  | { treatment: "adapted"; status: "inconclusive"; reason: string };

export interface RunRecord {
  scenarioId: string;
  /** Stable hash of the scenario content captured, a run identity axis for compare. */
  scenarioHash?: string;
  treatment: Treatment;
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
  /** Batch that produced this record; optional on records written before current snapshots. */
  batchId?: string;
}
