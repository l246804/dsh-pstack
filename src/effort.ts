/**
 * Reasoning-effort control, at both ends of one delegation.
 *
 * A role line names the effort a child *starts* at. That value is a baseline, not a
 * verdict:
 *
 * 1. the caller may override it for one delegation with `reasoningEffort`
 *    (validated in `src/subagent.ts` before the first child starts);
 * 2. a running child may raise or lower it with `set_reasoning_effort`, which this
 *    module installs on that child's own scope.
 *
 * Both halves exist because the two people who know the right level are not the same
 * person: only the caller knows the job, and only the child knows what it found once
 * it started reading the code.
 *
 * **The effort vocabulary belongs to the adapter.** This module never carries a
 * ladder of its own. A token is accepted only when the model the child will actually
 * request advertises it in `reasoning.efforts`, and a rejection lists that model's
 * real values. A hardcoded list (`max`/`xhigh`/…) would both invent a universal
 * ladder and reject a deployment that names its efforts differently, which is why
 * `docs/decisions/2026-10-26-dynamic-reasoning-effort.md` records that shape as the
 * rejected alternative.
 *
 * @module
 */

import type {
  Agent,
  AgentOptions,
  JsonSchemaNode,
  LlmCallConfig,
  LlmHost,
  ToolDefinition,
} from "./host-contract.ts";
import type { ChildRoute } from "./models.ts";

/** Model-facing name of the child's own control. */
export const SET_EFFORT_TOOL = "set_reasoning_effort";

/** One exact route an effort applies to. */
export interface EffortTarget {
  readonly provider: string;
  readonly model: string;
}

/**
 * Resolve the route a child's effort will actually apply to.
 *
 * The session's latest request header is the live route after a model switch, and
 * `Agent.options` is the creation-time fallback. DSH's own delegation code resolves
 * `inherit-parent` the same way, so reading `options` alone would validate a
 * different model than the child really inherits.
 *
 * An explicit route wins over both, because it is what the delegation will request.
 */
export function resolveEffortTarget(
  agent: Agent | undefined,
  route?: ChildRoute,
): EffortTarget | undefined {
  const explicit = route?.kind === "route" ? route : undefined;
  const header = agent?.session.requestHeader()?.config;

  const provider = explicit?.provider ?? header?.provider ?? agent?.options.provider;
  const model = explicit?.model ?? header?.model ?? agent?.options.model;
  return provider !== undefined && model !== undefined ? { provider, model } : undefined;
}

/** The efforts one route advertises, in the adapter's own order. */
async function advertisedEfforts(
  llm: LlmHost,
  target: EffortTarget,
  signal: AbortSignal | undefined,
): Promise<readonly string[]> {
  const info = await llm.resolveModelInfo(target.provider, target.model, signal);
  return info.reasoning?.efforts.map((entry) => entry.id) ?? [];
}

/**
 * Validate one effort against the route a child will actually request.
 *
 * Rejects with the target's real effort list rather than a generic message, because
 * "max is not supported" leaves the caller guessing while "supports xhigh, high,
 * medium" is actionable. A model that advertises no efforts at all is reported
 * separately: that is a route incapable of the control, not a wrong token.
 */
export async function validateEffortFor(
  llm: LlmHost,
  route: ChildRoute | undefined,
  effort: string,
  parent: Agent | undefined,
  signal?: AbortSignal,
): Promise<void> {
  const target = resolveEffortTarget(parent, route);
  if (target === undefined) {
    throw new Error(
      "cannot resolve the child provider/model route for reasoningEffort. Pass `role` with an exact route, or run the delegation from a session that has already made a request.",
    );
  }

  let efforts: readonly string[];
  try {
    efforts = await advertisedEfforts(llm, target, signal);
  } catch (error) {
    throw new Error(
      `route ${target.provider}/${target.model} could not be resolved for reasoningEffort: ${describeError(error)}`,
      { cause: error },
    );
  }

  if (efforts.length === 0) {
    throw new Error(
      `${target.provider}/${target.model} advertises no reasoning efforts, so it cannot take reasoningEffort "${effort}". Omit the argument and let the adapter use its own default.`,
    );
  }
  if (!efforts.includes(effort)) {
    throw new Error(
      `${target.provider}/${target.model} does not support reasoning effort "${effort}". It supports: ${efforts.join(", ")}.`,
    );
  }
}

/**
 * Install the effort control on one live child.
 *
 * Registration is child-scoped, so the waterfall and the tool dispose with the
 * child: a sibling delegation never sees them, and a later child cannot inherit a
 * stale value.
 *
 * The waterfall re-states the starting effort on every request and applies a
 * change from the next request onward. It never rewrites a request already in
 * flight, because `next()` has already been called and its result is the request
 * the machine built.
 *
 * A missing route is not fatal here. The child still runs on whatever the adapter
 * chose; the tool reports the missing route when the child tries to change effort.
 *
 * @param child - the live child agent, already started.
 * @param llm - the adapter host used to validate a requested change.
 * @param initialEffort - the effort the delegation started the child at, if any.
 * @returns a disposer that unwinds this contribution early, or does nothing when
 * the child context is already gone.
 */
export function installEffortControl(
  child: Agent,
  llm: LlmHost,
  initialEffort: string | undefined,
): () => void {
  let current = initialEffort;

  const disposeListener = child.ctx.on("agent/request", async (_payload, next) => {
    const config = await next();
    return current === undefined
      ? config
      : ({ ...config, reasoningEffort: current } satisfies LlmCallConfig);
  });

  const disposeTool = child.ctx.tools.register(
    defineSetEffortTool(child, llm, (effort) => {
      current = effort;
    }),
  );

  return () => {
    disposeTool();
    disposeListener();
  };
}

/** The child's own view of its effort, for the tool body. */
function defineSetEffortTool(
  child: Agent,
  llm: LlmHost,
  apply: (effort: string) => void,
): ToolDefinition {
  const parameters: Record<string, unknown> = {
    effort: {
      type: "string",
      description:
        "The reasoning effort to use from your next step onward. Use one of the values this model advertises; the call rejects an unknown one and lists the real values.",
    },
  };

  const outputSchema: JsonSchemaNode = { type: "string" };

  return {
    name: SET_EFFORT_TOOL,
    description: [
      "Change your reasoning effort for future model requests.",
      "Use it when the task turns out harder or more routine than the role line assumed: raise it for subtle design, concurrency, or algorithm work, lower it once the remaining work is mechanical.",
      "The change applies from your next step; a request already in flight is unaffected, and it lasts for the rest of this child's life.",
      "This tool may not be visible until your second step. The effort you were started with applies to the first step, so a slow first step is expected when that level is high.",
    ].join(" "),
    parameters,
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: "text", text: String(value) }],
    },
    isConcurrencySafe: () => false,
    async execute(rawArgs, exec) {
      const args = rawArgs as { effort?: unknown };
      const value = typeof args.effort === "string" ? args.effort.trim() : "";
      if (value === "") {
        throw new Error(
          "set_reasoning_effort needs a non-empty `effort`. Pass the exact token this model advertises; an empty value would silently re-enable the adapter default.",
        );
      }

      const target = resolveEffortTarget(exec.agent ?? child);
      if (target === undefined) {
        throw new Error(
          "this child has no resolved provider/model route, so reasoning effort cannot be validated against the live adapter metadata",
        );
      }

      let efforts: readonly string[];
      try {
        efforts = await advertisedEfforts(llm, target, exec.signal);
      } catch (error) {
        throw new Error(
          `${target.provider}/${target.model} could not be resolved for reasoning effort: ${describeError(error)}`,
          { cause: error },
        );
      }
      if (efforts.length === 0) {
        throw new Error(
          `${target.provider}/${target.model} advertises no reasoning efforts, so this child has none to change. Your current effort stays as it is.`,
        );
      }
      if (!efforts.includes(value)) {
        throw new Error(
          `${target.provider}/${target.model} does not support reasoning effort "${value}", so nothing changed. It supports: ${efforts.join(", ")}.`,
        );
      }

      apply(value);
      return `reasoning effort set to "${value}". It applies from your next step; the request already in flight is unaffected.`;
    },
  };
}

/**
 * The `agentOptions` one (route, effort override) pair contributes.
 *
 * The two independent halves are easy to get wrong in opposite directions:
 *
 * - an inherit-parent route with an override must still send `reasoningEffort`,
 *   which means `{ reasoningEffort }` on its own is a real `agentOptions` value and
 *   the backend still has to support the capability;
 * - an override always wins over the role line, because the caller asked for this
 *   delegation specifically.
 */
export function agentOptionsFor(
  route: ChildRoute,
  effortOverride?: string,
): AgentOptions | undefined {
  const effort = effortOverride ?? (route.kind === "route" ? route.effort : undefined);
  if (route.kind === "inherit") {
    return effort === undefined ? undefined : { reasoningEffort: effort };
  }
  return {
    provider: route.provider,
    model: route.model,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
}

/** The effort a plan entry will actually run at, override included. */
export function effectiveEffort(route: ChildRoute, effortOverride?: string): string | undefined {
  return effortOverride ?? (route.kind === "route" ? route.effort : undefined);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.message} (${code})` : error.message;
  }
  return String(error);
}
