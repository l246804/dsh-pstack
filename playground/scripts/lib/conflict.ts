/**
 * Pure logic behind the conflict executor: keyword matching, verdict construction, and the
 * RunRecord shape. No filesystem, process, or browser access lives here so every rule can be
 * unit tested without starting a host.
 *
 * The real guard path is two-phase: the web host starts (Agent Teams and pstack coexist), then
 * the pstack root preset fails to compose because `assertNoAgentTeams` sees `agentTeams`. So a
 * passing regression is `startup started` AND `guard blocked with conflict text`.
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
 * The exact text comes from `src/poteto-mode.ts`'s `AGENT_TEAMS_CONFLICT`
 * ("pstack root presets cannot be used with Agent Teams ..."), which carries both an Agent
 * Teams identity token and a preset token. The failure group also accepts `conflict` so a
 * future rephrasing still matches without hard-coding one sentence.
 */
export interface ConflictKeywordGroups {
  /** Any hit proves the Agent Teams profile is loaded. */
  readonly identity: readonly string[];
  /** Any hit proves a preset/conflict failure rather than a benign status line. */
  readonly failure: readonly string[];
}

export const CONFLICT_KEYWORD_GROUPS: ConflictKeywordGroups = {
  identity: ["agent team", "agent-team", "agent_team", "agentteam"],
  failure: ["preset", "conflict", "cannot be used", "加载失败", "冲突"],
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
export type ConflictStartup =
  | { readonly kind: "started"; readonly url: string }
  | { readonly kind: "exited"; readonly combinedText: string; readonly runError?: string };

/**
 * What the browser saw when it inspected the pstack root preset after startup:
 * - `blocked`: the preset is broken/unselectable and its reason text is the guard message.
 * - `available`: the preset loaded and is offered, i.e. the guard did not refuse it.
 * - `unknown`: the preset row could not be located or read (environment or UI problem).
 */
export type ConflictGuard =
  | { readonly kind: "blocked"; readonly text: string }
  | { readonly kind: "available"; readonly detail: string }
  | { readonly kind: "unknown"; readonly detail: string };

export interface ConflictObservation {
  readonly startup: ConflictStartup;
  readonly guard: ConflictGuard;
}

export interface ConflictVerdictInput {
  readonly scenario: ConflictRegression;
  readonly observation: ConflictObservation;
}

export interface ConflictVerdictResult {
  readonly verdict: Verdict;
  readonly match: ConflictMatch;
}

/**
 * Turn the two-phase observation into a verdict.
 *
 * A host that failed to start contradicts the documented behavior (the conflict is
 * non-fatal to startup), so it is `not-verified` even when the exit text matches.
 * Once started, only a blocked guard carrying the conflict keywords is the expected pass;
 * an available preset or an unreadable one is `not-verified` with the evidence kept visible.
 */
export function conflictVerdict(input: ConflictVerdictInput): ConflictVerdictResult {
  const { startup, guard } = input.observation;

  if (startup.kind === "exited") {
    const match = matchConflictSymptom(startup.combinedText);
    const failures = [
      "web did not start; the real guard path lets the host coexist and only blocks the pstack root preset",
    ];
    if (match.matched)
      failures.push("startup log already carries conflict keywords, but startup must succeed");
    if (startup.runError !== undefined && startup.runError !== "") {
      failures.push(`runner error: ${startup.runError}`);
    }
    const tail = startup.combinedText.trim().split("\n").slice(-20).join("\n");
    if (tail !== "") failures.push(`log tail: ${tail}`);
    return { match, verdict: { phase: "adapted", status: "not-verified", failures } };
  }

  if (guard.kind === "blocked") {
    const match = matchConflictSymptom(guard.text);
    if (match.matched) {
      return {
        match,
        verdict: {
          phase: "adapted",
          status: "blocked",
          reason: `expected conflict confirmed: ${guard.text.trim()}`,
        },
      };
    }
    return {
      match,
      verdict: {
        phase: "adapted",
        status: "not-verified",
        failures: [
          "the pstack root preset is blocked, but its reason lacks the conflict keywords",
          `preset reason: ${guard.text.trim().slice(0, 600)}`,
        ],
      },
    };
  }

  if (guard.kind === "available") {
    return {
      match: matchConflictSymptom(guard.detail),
      verdict: {
        phase: "adapted",
        status: "not-verified",
        failures: [
          "the pstack root preset stayed available; the guard did not refuse it beside Agent Teams",
          `detail: ${guard.detail.trim().slice(0, 600)}`,
        ],
      },
    };
  }

  return {
    match: matchConflictSymptom(guard.detail),
    verdict: {
      phase: "adapted",
      status: "not-verified",
      failures: [
        "could not observe the pstack root preset guard",
        `detail: ${guard.detail.trim().slice(0, 600)}`,
      ],
    },
  };
}

const CONFLICT_SEMANTIC_REVIEW: SemanticReview = {
  status: "pending",
  reason: "冲突回归只机械判定启动与 preset 守卫，无需模型语义评审。",
};

export interface ConflictRecordInput {
  readonly scenario: ConflictRegression;
  readonly environment: RunEnvironment;
  readonly recordFile: string;
  readonly screenshotFile?: string;
  readonly observed: readonly string[];
  readonly observation: ConflictObservation;
  readonly capturedAt: string;
}

/** Build a complete RunRecord for one conflict regression from the two-phase observation. */
export function buildConflictRunRecord(input: ConflictRecordInput): RunRecord {
  const { verdict, match } = conflictVerdict({
    scenario: input.scenario,
    observation: input.observation,
  });
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
    artifacts: {
      recordFile: input.recordFile,
      ...(input.screenshotFile === undefined ? {} : { screenshotFile: input.screenshotFile }),
      observed,
    },
    semanticReview: CONFLICT_SEMANTIC_REVIEW,
    mechanicalFailures: verdict.status === "not-verified" ? [...verdict.failures] : [],
    verdict,
    capturedAt: input.capturedAt,
  };
}
