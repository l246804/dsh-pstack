/**
 * Pure logic behind the conflict executor: keyword matching against a startup log and
 * RunRecord/verdict construction. No filesystem or process access lives here so every rule
 * can be unit tested without starting a host.
 */

import type {
  ConflictRegression,
  RunEnvironment,
  RunRecord,
  SemanticReview,
  Verdict,
} from "../../types.ts";

/**
 * Keyword groups that prove the documented Agent Teams vs pstack-root-preset conflict fired.
 * The exact crash line comes from `src/poteto-mode.ts`'s `AGENT_TEAMS_CONFLICT`
 * ("pstack root presets cannot be used with Agent Teams ..."), which carries both an
 * Agent Teams identity token and a preset token. The failure group also accepts `conflict`
 * so a future rephrasing still matches without hard-coding one sentence.
 */
export interface ConflictKeywordGroups {
  /** Any hit proves the Agent Teams profile is loaded. */
  readonly identity: readonly string[];
  /** Any hit proves a preset/conflict failure rather than a benign status line. */
  readonly failure: readonly string[];
}

export const CONFLICT_KEYWORD_GROUPS: ConflictKeywordGroups = {
  identity: ["agent team", "agent-team", "agent_team", "agentteam"],
  failure: ["preset", "conflict", "cannot be used", "冲突"],
};

export interface ConflictMatch {
  readonly matched: boolean;
  readonly matchedIdentity: string[];
  readonly matchedFailure: string[];
}

/** Case-insensitive match: a hit needs one identity keyword AND one failure keyword. */
export function matchConflictSymptom(
  text: string,
  groups: ConflictKeywordGroups = CONFLICT_KEYWORD_GROUPS,
): ConflictMatch {
  const haystack = text.toLowerCase();
  const matchedIdentity = groups.identity.filter((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
  const matchedFailure = groups.failure.filter((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
  return {
    matched: matchedIdentity.length > 0 && matchedFailure.length > 0,
    matchedIdentity,
    matchedFailure,
  };
}

/** What the executor observed when it tried to start the conflicting profile. */
export type ConflictStartupOutcome =
  | { readonly kind: "started"; readonly url: string }
  | { readonly kind: "exited"; readonly combinedText: string; readonly runError?: string };

export interface ConflictVerdictInput {
  readonly scenario: ConflictRegression;
  readonly outcome: ConflictStartupOutcome;
}

export interface ConflictVerdictResult {
  readonly verdict: Verdict;
  readonly match: ConflictMatch;
}

/**
 * Turn the observed startup outcome into a verdict. A process that started is a failure of
 * the regression (the conflict did not reproduce). A process that exited while its log
 * carries the conflict keywords is `blocked`, the expected pass. Any other exit is
 * `not-verified` with the matched tokens and log tail so the real cause stays visible.
 */
export function conflictVerdict(input: ConflictVerdictInput): ConflictVerdictResult {
  const { scenario, outcome } = input;
  if (outcome.kind === "started") {
    return {
      match: matchConflictSymptom(outcome.url),
      verdict: {
        phase: "adapted",
        status: "not-verified",
        failures: [
          `environment started at ${outcome.url}; the expected startup conflict did not reproduce`,
        ],
      },
    };
  }
  const match = matchConflictSymptom(outcome.combinedText);
  if (match.matched) {
    return {
      match,
      verdict: {
        phase: "adapted",
        status: "blocked",
        reason: `expected conflict confirmed: ${scenario.expectedConflict.symptom}`,
      },
    };
  }
  const failures = [
    "startup failed without the expected conflict keywords",
    `matched identity=[${match.matchedIdentity.join(", ")}] failure=[${match.matchedFailure.join(", ")}]`,
  ];
  if (outcome.runError !== undefined && outcome.runError !== "") {
    failures.push(`runner error: ${outcome.runError}`);
  }
  const tail = outcome.combinedText.trim().split("\n").slice(-20).join("\n");
  if (tail !== "") failures.push(`log tail: ${tail}`);
  return { match, verdict: { phase: "adapted", status: "not-verified", failures } };
}

const CONFLICT_SEMANTIC_REVIEW: SemanticReview = {
  status: "pending",
  reason: "冲突回归只机械判定启动日志，无需模型语义评审。",
};

export interface ConflictRecordInput {
  readonly scenario: ConflictRegression;
  readonly environment: RunEnvironment;
  readonly recordFile: string;
  readonly observed: readonly string[];
  readonly outcome: ConflictStartupOutcome;
  readonly capturedAt: string;
}

/** Build a complete RunRecord for one conflict regression from the observed startup. */
export function buildConflictRunRecord(input: ConflictRecordInput): RunRecord {
  const { verdict, match } = conflictVerdict({ scenario: input.scenario, outcome: input.outcome });
  const observed = [
    ...input.observed,
    `conflict.matched=${match.matched}`,
    `conflict.identity=${match.matchedIdentity.join(",") || "none"}`,
    `conflict.failure=${match.matchedFailure.join(",") || "none"}`,
  ];
  return {
    scenarioId: input.scenario.id,
    phase: "adapted",
    environment: input.environment,
    target: null,
    session: null,
    artifacts: { recordFile: input.recordFile, observed },
    semanticReview: CONFLICT_SEMANTIC_REVIEW,
    mechanicalFailures: verdict.status === "not-verified" ? [...verdict.failures] : [],
    verdict,
    capturedAt: input.capturedAt,
  };
}
