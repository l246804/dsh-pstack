/**
 * A fake `Agent` that satisfies the real contract.
 *
 * `Agent` restates three seams the reasoning-effort control appends to:
 * `options`, `session.requestHeader()`, and an agent-scoped `ctx` carrying the
 * `agent/request` waterfall and a tool registry. A test that only cares about
 * `agent.id` still has to build them, and building them per test file is how the
 * three copies drift.
 *
 * `requestHeader()` returning `undefined` is the honest default: it means "this
 * session has not made a request yet", which is exactly the state an inherit-parent
 * effort override has to cope with.
 */
import type { Agent, LlmCallConfig, ToolDefinition, ToolRunContext } from "../src/host-contract.ts";

/** One registered scoped tool, as a fake child would see it. */
export interface ScopedTool extends ToolDefinition {}

export interface FakeAgentOptions {
  readonly id?: string;
  readonly provider?: string;
  readonly model?: string;
  /** The live route after a model switch; omitted means no request has been made. */
  readonly header?: LlmCallConfig;
}

export interface FakeAgent {
  readonly agent: Agent;
  /** Tools registered on this agent's own scope, in registration order. */
  readonly tools: ScopedTool[];
  /** The route the next request would use, after every listener has run. */
  request(config: LlmCallConfig): Promise<LlmCallConfig>;
  /** The `agent/request` listener this agent carries, when it has one. */
  readonly listeners: number;
}

/**
 * Build one fake agent.
 *
 * @param options - identity, creation-time route, and the live header.
 * @returns the agent plus handles for asserting what was registered on its scope.
 */
export function fakeAgent(options: FakeAgentOptions = {}): FakeAgent {
  const tools: ScopedTool[] = [];
  const listeners: Array<
    (
      payload: { agent: Agent; turn: number; step: number },
      next: () => Promise<LlmCallConfig>,
    ) => Promise<LlmCallConfig>
  > = [];

  const agent = {
    id: options.id ?? "parent-session",
    options: {
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.model === undefined ? {} : { model: options.model }),
    },
    session: {
      requestHeader: () => (options.header === undefined ? undefined : { config: options.header }),
    },
    ctx: {
      on(event: string, listener: (typeof listeners)[number]) {
        if (event !== "agent/request") {
          throw new Error(`fake agent only restates agent/request, got ${event}`);
        }
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index !== -1) listeners.splice(index, 1);
        };
      },
      get tools() {
        return {
          register(definition: ToolDefinition) {
            tools.push(definition);
            return () => {
              const index = tools.indexOf(definition);
              if (index !== -1) tools.splice(index, 1);
            };
          },
        };
      },
    },
  } as unknown as Agent;

  return {
    agent,
    tools,
    get listeners() {
      return listeners.length;
    },
    async request(config: LlmCallConfig) {
      // The waterfall composes outermost-first: each listener calls `next()` and may
      // replace the result. Replaying in registration order is what the Host does.
      let index = 0;
      const next = async (): Promise<LlmCallConfig> => {
        const listener = listeners[index];
        if (listener === undefined) return config;
        index += 1;
        return listener({ agent, turn: 1, step: 1 }, next);
      };
      return next();
    },
  };
}

/**
 * The `exec` argument one tool call receives.
 *
 * `ToolRunContext` names six fields beyond the agent, and a literal that omits them
 * typechecks as a cast and then diverges from the real shape. Building it here keeps
 * the tool-body tests honest about what the Host passes.
 *
 * @param agent - the calling agent, or `undefined` for a call with no agent.
 * @param callId - stable call identity, echoed into the execution.
 * @returns a complete `ToolRunContext`.
 */
export function toolExec(agent: Agent | undefined, callId = "call-1"): ToolRunContext {
  return {
    name: "test_tool",
    callId,
    arguments: {},
    ...(agent === undefined ? {} : { agent }),
    signal: new AbortController().signal,
    deferContext: () => {},
    concludeTurn: () => {},
  };
}
