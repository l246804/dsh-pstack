/**
 * Reasoning-effort control at both ends of one delegation.
 *
 * A role line names the effort a child *starts* at. The caller may override it for one
 * delegation with `reasoningEffort`, and a running child may raise or lower it with
 * `set_reasoning_effort`, which this module installs on that child's own scope.
 *
 * The effort vocabulary belongs to the adapter: a token is accepted only when the model
 * the child will actually request advertises it. Ordering is the adapter's too, so no
 * ladder is invented here.
 */

import type {
  Agent,
  AgentOptions,
  JsonSchemaNode,
  LlmCallConfig,
  LlmHost,
  ReasoningEffortId,
  ToolDefinition,
} from "./host-contract.ts";
import type { Route } from "./role-config.ts";

/** Model-facing name of the child's own control. */
export const SET_EFFORT_TOOL = "set_reasoning_effort";

/** One exact route an effort applies to. */
export interface EffortTarget {
  readonly provider: string;
  readonly model: string;
}

/**
 * Resolve the route a child's effort will actually apply to: an explicit route wins,
 * then the session's live request header, then the creation-time options.
 */
export function resolveEffortTarget(
  agent: Agent | undefined,
  route?: Route,
): EffortTarget | undefined {
  const explicit = route?.kind === "route" ? route : undefined;
  const header = agent?.session.requestHeader()?.config;
  const provider = explicit?.provider ?? header?.provider ?? agent?.options.provider;
  const model = explicit?.model ?? header?.model ?? agent?.options.model;
  return provider !== undefined && model !== undefined ? { provider, model } : undefined;
}

async function advertisedEfforts(
  llm: LlmHost,
  target: EffortTarget,
  signal: AbortSignal | undefined,
): Promise<readonly ReasoningEffortId[]> {
  const info = await llm.resolveModelInfo(target.provider, target.model, signal);
  return info.reasoning?.efforts.map((entry) => entry.id) ?? [];
}

/** Validate one effort against the route a child will actually request. */
export async function validateEffortFor(
  llm: LlmHost,
  route: Route | undefined,
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

  let efforts: readonly ReasoningEffortId[];
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
  if (!efforts.includes(effort as ReasoningEffortId)) {
    throw new Error(
      `${target.provider}/${target.model} does not support reasoning effort "${effort}". It supports: ${efforts.join(", ")}.`,
    );
  }
}

/**
 * Install the effort control on one live child.
 *
 * Registration is child-scoped, so both the waterfall and the tool dispose with the
 * child. The waterfall re-states the current effort on every request and never rewrites
 * a request already in flight.
 */
export function installEffortControl(
  child: Agent,
  llm: LlmHost,
  initialEffort: ReasoningEffortId | undefined,
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

function defineSetEffortTool(
  child: Agent,
  llm: LlmHost,
  apply: (effort: ReasoningEffortId) => void,
): ToolDefinition {
  const outputSchema: JsonSchemaNode = { type: "string" };

  return {
    name: SET_EFFORT_TOOL,
    description: [
      "Change your reasoning effort for future model requests.",
      "Use it when the task turns out harder or more routine than the role line assumed: raise it for subtle design, concurrency, or algorithm work, lower it once the remaining work is mechanical.",
      "The change applies from your next step; a request already in flight is unaffected, and it lasts for the rest of this child's life.",
    ].join(" "),
    parameters: {
      effort: {
        type: "string",
        description:
          "The reasoning effort to use from your next step onward. Use one of the values this model advertises; the call rejects an unknown one and lists the real values.",
      },
    },
    output: {
      schema: outputSchema,
      render: (_args, value) => [
        { type: "text", text: typeof value === "string" ? value : JSON.stringify(value) },
      ],
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

      let efforts: readonly ReasoningEffortId[];
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
      if (!efforts.includes(value as ReasoningEffortId)) {
        throw new Error(
          `${target.provider}/${target.model} does not support reasoning effort "${value}", so nothing changed. It supports: ${efforts.join(", ")}.`,
        );
      }

      apply(value as ReasoningEffortId);
      return `reasoning effort set to "${value}". It applies from your next step; the request already in flight is unaffected.`;
    },
  };
}

/** The `agentOptions` one (route, effort override) pair contributes. */
export function agentOptionsFor(route: Route, effortOverride?: string): AgentOptions | undefined {
  const effort = (effortOverride ?? (route.kind === "route" ? route.effort : undefined)) as
    | ReasoningEffortId
    | undefined;
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
export function effectiveEffort(route: Route, effortOverride?: string): string | undefined {
  return effortOverride ?? (route.kind === "route" ? route.effort : undefined);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.message} (${code})` : error.message;
  }
  return String(error);
}
