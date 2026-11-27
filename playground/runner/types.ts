export const VARIANTS = ["native", "adapted"] as const;
export type Variant = (typeof VARIANTS)[number];

export function isVariant(value: unknown): value is Variant {
  return typeof value === "string" && VARIANTS.some((variant) => variant === value);
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

/**
 * One entry of the DSH `dsh-llm-deepseek` model catalog. Mirrors the upstream
 * shape: modality list is `inputModalities`, and reasoning tiers live on the
 * provider, not on each model.
 */
export interface DeepSeekModel {
  id: string;
  name?: string;
  description?: string;
  contextWindow?: number;
  maxTokens?: number;
  inputModalities?: Array<"text" | "image">;
  imagePixelBudget?: number | "low";
  imageTargetBytes?: number;
  systemPromptUpdate?: "in-history";
  toolUpdate?: "in-history" | "addition-only";
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
      apiKeyEnv: string;
      models?: DeepSeekModel[];
      reasoning?: string;
    }
  | {
      kind: "deepseek-account";
      modelOverrides?: Record<string, unknown>;
      reasoning?: string;
    };

export interface BrowserConfig {
  mode?: "managed" | "cdp";
  cdpUrl?: string;
  headed?: boolean;
}

export type RoleModels = Record<string, TestTarget | TestTarget[]>;

export interface RuntimeConfig {
  /** One scenario's wall-clock budget in milliseconds. */
  scenarioTimeoutMs: number;
  /** Wait budget after one main turn ends. */
  turnTimeoutMs: number;
  /** Wait budget for delegated subagents after the main turn. */
  subagentTimeoutMs: number;
  /** Network namespace strategy for worker containers. */
  networkMode: "host" | "bridge";
  /** Base host port for the first worker in host mode. */
  workerPortBase: number;
  /** Machine-capacity policy for parallel workers. */
  workerCapacity: {
    coreHeadroom: number;
    memoryFraction: number;
    memoryPerWorkerGB: number;
  };
  /** Root under the ignored repository workspace where each worker keeps its workspace. */
  workspaceRoot: string;
  /** Root for worker home, browser, evidence, and logs. */
  workersDir: string;
  /** Docker-compatible CLI binary. */
  dockerBin: string;
  /** DSH CLI binary. */
  dshBin: string;
  /** Vite+ CLI binary. */
  vpxBin: string;
  /** pnpm binary. */
  pnpmBin: string;
  /** Host Chrome binary; omitted means discover the installed browser. */
  chromePath?: string;
}

export interface PlaygroundConfig {
  testModel: TestTarget;
  providers: Record<string, ProviderConfig>;
  roleModels?: RoleModels;
  browser?: BrowserConfig;
  runtime: RuntimeConfig;
  copyCredentials?: boolean;
  credentialsFile?: string;
}

export type Assertion =
  | { kind: "turn-completed" }
  | { kind: "skill-loaded"; skill: string }
  | { kind: "no-tool-error" }
  | { kind: "artifact-contains"; path: string; text: string }
  | { kind: "artifact-exists"; path: string }
  | { kind: "artifact-dir-nonempty"; path: string }
  | { kind: "artifact-absent"; path: string }
  | { kind: "assistant-contains"; text: string };

export interface WorkspaceFixture {
  files: Record<string, string>;
  /** Files copied from repository-relative fixture paths into the workspace. */
  assets?: Record<string, string>;
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
  /** Variants this probe is allowed to run in; omitted means both native and adapted. */
  variants?: readonly Variant[];
  /** Environments this probe runs in; omitted means only the base environment. */
  environments?: readonly string[];
  answers?: Array<{ match: string; selected?: string[]; custom?: string }>;
  /** Capability id this probe covers. */
  capability: string;
  /** Scenario kind: gap (linked to the native gap list) or regression. */
  kind: "gap" | "regression";
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
  matrix: EnvironmentMatrix;
  upstreamRevision: string;
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
  | { variant: "native"; status: "observed"; gaps: string[] }
  | { variant: "native"; status: "gap"; gaps: string[] }
  | { variant: "native"; status: "blocked"; reason: string }
  | { variant: "native"; status: "unobserved"; reason: string }
  | { variant: "adapted"; status: "verified" }
  | { variant: "adapted"; status: "not-verified"; failures: string[] }
  /** A conflict regression whose expected startup conflict reproduced: blocked by design. */
  | { variant: "adapted"; status: "blocked"; reason: string }
  | { variant: "adapted"; status: "inconclusive"; reason: string };

export interface RunRecord {
  scenarioId: string;
  /** Stable hash of the scenario content captured with this record. */
  scenarioHash?: string;
  variant: Variant;
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
  /**
   * Set when the scenario did not produce a normal record, for example because execution
   * failed before assertions ran. Review must never recompute such a record into a pass.
   */
  blockedReason?: string;
  capturedAt: string;
  /** Batch that produced this record; optional on records written before current snapshots. */
  batchId?: string;
}
