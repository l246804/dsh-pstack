/**
 * Pure logic behind the plugin-UI executor: step parsing, expected-value templating,
 * role-file assertions, and RunRecord/verdict construction. No filesystem or browser
 * access lives here so every rule can be unit tested without a running host.
 */

import type {
  RunEnvironment,
  RunRecord,
  SemanticReview,
  TestTarget,
  Verdict,
} from "../../types.ts";

/** The role file the settings page writes under `$DSH_HOME`. */
export const ROLE_FILE = "pstack-models.mdc";

/** Every action verb `run-ui.ts` understands. Scenario steps must stay inside this set. */
export const UI_ACTION_VERBS = [
  "open-plugins-detail",
  "open-role-tab",
  "select-role",
  "set-route",
  "save",
  "clear-role",
  "assert-file-contains",
  "assert-file-not-contains",
  "assert-plugin-listed",
  "toggle-plugin",
  "assert-plugin-state",
  "screenshot",
] as const;

export type UiActionVerb = (typeof UI_ACTION_VERBS)[number];

export interface UiAction {
  readonly verb: string;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Split one action string into its verb and `key=value` parameters. Values cannot
 * contain whitespace; package names, role keys, and screenshot names never do.
 */
export function parseUiAction(action: string): UiAction {
  const tokens = action.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error("UI action is empty");
  const [verb, ...rest] = tokens;
  const params: Record<string, string> = {};
  for (const token of rest) {
    const separator = token.indexOf("=");
    if (separator <= 0 || separator === token.length - 1) {
      throw new Error(`UI action parameter must be key=value, got ${JSON.stringify(token)}`);
    }
    params[token.slice(0, separator)] = token.slice(separator + 1);
  }
  return { verb: verb as string, params };
}

/** One route rendered the way the role file spells it. */
export function routeValue(plan: TestTarget): string {
  return plan.effort === ""
    ? `${plan.provider}/${plan.model}`
    : `${plan.provider}/${plan.model} [${plan.effort}]`;
}

/** The role line the editor writes for a concrete route. */
export function expectedRoleLine(role: string, plan: TestTarget): string {
  return `${role}: ${routeValue(plan)}`;
}

export interface ExpectedContext {
  readonly plan: TestTarget;
  readonly role?: string;
}

/**
 * Fill the `{{...}}` placeholders an expected value may carry. Unknown placeholders are
 * left untouched on purpose, so a typo surfaces as a failed assertion instead of silently
 * matching an empty string.
 */
export function resolveExpected(template: string, context: ExpectedContext): string {
  const values: Record<string, string> = {
    provider: context.plan.provider,
    model: context.plan.model,
    effort: context.plan.effort,
    route: routeValue(context.plan),
    ...(context.role === undefined
      ? {}
      : { role: context.role, roleLine: expectedRoleLine(context.role, context.plan) }),
  };
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? (values[name] as string) : match,
  );
}

export type FileAssertionVerb = "assert-file-contains" | "assert-file-not-contains";

/**
 * Evaluate a role-file assertion. `assert-file-contains` fails when the line is absent;
 * `assert-file-not-contains` fails when it is still present. Returns null on success.
 */
export function fileAssertionFailure(input: {
  readonly verb: FileAssertionVerb;
  readonly fileText: string;
  readonly expectedLine: string;
  readonly role: string;
}): string | null {
  const present = input.fileText.includes(input.expectedLine);
  if (input.verb === "assert-file-contains") {
    return present
      ? null
      : `role file lacks ${JSON.stringify(input.expectedLine)} for role ${JSON.stringify(input.role)}`;
  }
  return present
    ? `role file still contains ${JSON.stringify(input.expectedLine)} for role ${JSON.stringify(input.role)}`
    : null;
}

/** The pending human review a UI run carries: screenshots are inspected by eye. */
export function uiSemanticReview(): SemanticReview {
  return {
    status: "pending",
    reason:
      "UI 场景只机械断言可判定的 DOM/状态与文件行为；视觉结果由人工目测 screenshot 步骤落盘的截图判定，未做像素对比。",
  };
}

/**
 * Adapted three-state verdict for a UI run. A blocked run is inconclusive, any failed
 * step is not-verified, and a clean run stays inconclusive until the human screenshot
 * review replaces the pending semantic review.
 */
export function uiVerdict(input: {
  readonly failures: readonly string[];
  readonly semanticReview: SemanticReview;
  readonly blockedReason?: string;
}): Verdict {
  if (input.blockedReason !== undefined) {
    return { phase: "adapted", status: "inconclusive", reason: input.blockedReason };
  }
  if (input.failures.length > 0) {
    return { phase: "adapted", status: "not-verified", failures: [...input.failures] };
  }
  const reason =
    input.semanticReview.status === "pending" || input.semanticReview.status === "inconclusive"
      ? input.semanticReview.reason
      : "UI 场景的语义审核需要人工目测截图。";
  return { phase: "adapted", status: "inconclusive", reason };
}

export interface UiRecordInput {
  readonly scenarioId: string;
  readonly environment: RunEnvironment;
  readonly target: TestTarget | null;
  readonly recordFile: string;
  readonly screenshotFile?: string;
  readonly observed: readonly string[];
  readonly failures: readonly string[];
  readonly blockedReason?: string;
  readonly capturedAt: string;
}

/** Build a complete RunRecord for one UI scenario, always with a pending human review. */
export function buildUiRunRecord(input: UiRecordInput): RunRecord {
  const semanticReview = uiSemanticReview();
  return {
    scenarioId: input.scenarioId,
    phase: "adapted",
    environment: input.environment,
    target: input.target,
    session: null,
    artifacts: {
      recordFile: input.recordFile,
      ...(input.screenshotFile === undefined ? {} : { screenshotFile: input.screenshotFile }),
      observed: [...input.observed],
    },
    semanticReview,
    mechanicalFailures: [...input.failures],
    verdict: uiVerdict({
      failures: input.failures,
      semanticReview,
      ...(input.blockedReason === undefined ? {} : { blockedReason: input.blockedReason }),
    }),
    capturedAt: input.capturedAt,
  };
}
