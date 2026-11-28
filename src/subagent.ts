/**
 * `pstack_subagent`: a thin pstack wrapper over `ctx.subagents.startActivation`.
 *
 * The native `subagent` tool enforces the Host `subagent-model-selection`
 * setting on every call, and the shipped composition leaves that setting off,
 * so an unconfigured session can delegate only to the parent route. pstack
 * roles need a different route per role, so this tool writes the route into the
 * activation's `agentOptions` and owns its own caller contract. It also adds
 * the `agent_preset` selector and a `maxDepth` cap. Everything else mirrors the
 * native delegation contract, including the activation result shape.
 */

import type { Agent, AgentOptions } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import type { LlmRuntime, ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type { SubagentCapabilities, SubagentRuntime } from "@deepseek-ai/dsh-subagent";
import { ToolArgsError } from "@deepseek-ai/dsh-tools";
import type { JsonSchemaNode, ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";

import { POTETO_MODE_SKILL_PATH } from "./lib/paths.ts";
import { textOutput } from "./lib/tool-output.ts";

export const name = "pstack-subagent";

export const inject = ["tools", "subagents", "llm"];

export const TOOL_NAME = "pstack_subagent";

export const INTERRUPT_TOOL_NAME = "pstack_interrupt";

/** Default subagent backend when the row does not name one. */
export const DEFAULT_PROVIDER = "spawn";

/** Child kinds this tool can brief. */
export const AGENT_KINDS = ["poteto-agent", "comment-sicko", "readonly", "general"] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

/** Preset id for each independently composed child kind. */
const AGENT_PRESETS: Readonly<Record<Exclude<AgentKind, "general">, string>> = {
  "poteto-agent": "poteto-agent",
  "comment-sicko": "comment-sicko",
  readonly: "readonly",
};

/** Row configuration. `provider` names the subagent backend, not a model route. */
export interface PstackSubagentConfig {
  readonly provider: string;
  readonly maxDepth?: number;
}

const DEFAULT_CONFIG: PstackSubagentConfig = { provider: DEFAULT_PROVIDER };

export interface DelegationArgs {
  readonly description: string;
  readonly prompt: string;
  readonly agent: AgentKind;
  readonly name: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly reasoningEffort: string | null;
  readonly maxDepth: number | null;
}

/** One child ready to start. */
export interface DelegationPlan {
  readonly backend: string;
  readonly label: string;
  readonly prompt: string;
  readonly name?: string;
  readonly agentOptions?: AgentOptions;
  readonly agentPreset?: string;
  readonly maxDepth?: number;
}

/** The native subagent tool's activation result. */
export interface ActivationResult {
  readonly kind: "activation";
  readonly name: string;
}

/** The live services one delegation reads. */
export interface DelegationRuntime {
  readonly subagents: SubagentRuntime;
  readonly llm: LlmRuntime;
  readonly potetoModeSkillPath: string;
}

/** Validate the row config; omitted config uses the default backend. */
export function normalizeConfig(value: unknown): PstackSubagentConfig {
  if (value === undefined || value === null) return DEFAULT_CONFIG;
  const record = value as Record<string, unknown>;
  const provider = record["provider"];
  if (typeof provider !== "string" || provider.trim() === "") {
    throw new Error("pstack-subagent: provider must be a non-empty string");
  }
  const maxDepth = record["maxDepth"];
  if (
    maxDepth !== undefined &&
    (typeof maxDepth !== "number" || !Number.isSafeInteger(maxDepth) || maxDepth < 1)
  ) {
    throw new Error("pstack-subagent: maxDepth must be a positive safe integer");
  }
  return {
    provider: provider.trim(),
    ...(maxDepth === undefined ? {} : { maxDepth }),
  };
}

function stringArg(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Read the model-facing arguments. The runtime validates their types. */
export function parseDelegationArgs(raw: unknown): DelegationArgs {
  const record = (raw ?? {}) as Record<string, unknown>;
  const prompt = stringArg(record["prompt"]);
  if (prompt === null) throw new ToolArgsError(["prompt is required"]);
  const description = stringArg(record["description"]);
  if (description === null) throw new ToolArgsError(["description is required"]);
  const agentValue = record["agent_preset"];
  let agent: AgentKind = "general";
  if (agentValue !== undefined && agentValue !== null) {
    if (
      typeof agentValue !== "string" ||
      !(AGENT_KINDS as readonly string[]).includes(agentValue)
    ) {
      const shown = typeof agentValue === "string" ? agentValue : JSON.stringify(agentValue);
      throw new ToolArgsError([`unknown agent preset "${shown}"`]);
    }
    agent = agentValue as AgentKind;
  }
  const maxDepth = record["maxDepth"];
  if (
    maxDepth !== undefined &&
    maxDepth !== null &&
    (typeof maxDepth !== "number" || !Number.isSafeInteger(maxDepth) || maxDepth < 1)
  ) {
    throw new ToolArgsError(["maxDepth must be a positive safe integer"]);
  }
  const name = stringArg(record["name"]);
  if (name !== null && (!/^[a-z][a-z0-9-]{0,31}$/.test(name) || name === "lead")) {
    throw new ToolArgsError([
      'name must be 1-32 lower-case letters, digits, or hyphens starting with a letter, and not "lead"',
    ]);
  }
  const provider = stringArg(record["provider"]);
  const model = stringArg(record["model"]);
  const reasoningEffort = stringArg(record["reasoning_effort"]);
  if ((provider === null) !== (model === null)) {
    throw new ToolArgsError(["provider and model must be provided together, or both omitted"]);
  }
  if (reasoningEffort !== null && (provider === null || model === null)) {
    throw new ToolArgsError(["reasoning_effort requires provider and model"]);
  }
  return {
    description,
    prompt,
    agent,
    name,
    provider,
    model,
    reasoningEffort,
    maxDepth: typeof maxDepth === "number" ? maxDepth : null,
  };
}

/** Resolve the child's preset, prompt, route, and depth before activation starts. */
export function planDelegation(
  args: DelegationArgs,
  runtime: DelegationRuntime,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): DelegationPlan {
  const agentPreset = args.agent === "general" ? undefined : AGENT_PRESETS[args.agent];
  const prompt =
    args.agent === "poteto-agent"
      ? injectPotetoModePath(args.prompt, runtime.potetoModeSkillPath)
      : args.prompt;
  const limit = runtime.subagents.resolveMaxDepth(config.maxDepth);
  const maxDepth = args.maxDepth ?? limit;
  if (maxDepth !== undefined && limit !== undefined && maxDepth > limit) {
    throw new Error(`maxDepth ${maxDepth} exceeds the delegation limit of ${limit}`);
  }
  const effort = args.reasoningEffort ?? undefined;
  const agentOptions = buildAgentOptions(args.provider, args.model, effort);

  return {
    backend: config.provider,
    label: args.description,
    prompt,
    ...(agentOptions === undefined ? {} : { agentOptions }),
    ...(agentPreset === undefined ? {} : { agentPreset }),
    ...(args.name === null ? {} : { name: args.name }),
    ...(maxDepth === undefined ? {} : { maxDepth }),
  };
}

/** Start one child through the subagent service. */
export async function startChild(
  parent: Agent,
  plan: DelegationPlan,
  runtime: DelegationRuntime,
  signal: AbortSignal,
): Promise<ActivationResult> {
  const provider = runtime.subagents.getProvider(plan.backend);
  if (provider === undefined) {
    throw new Error(`subagent provider "${plan.backend}" is not registered`);
  }
  assertCapabilities(provider.capabilities, plan);
  await preflightRoute(runtime.llm, plan, signal);

  const activation = await runtime.subagents.startActivation({
    provider: plan.backend,
    label: plan.label,
    signal,
    delivery: "parent",
    prompt: [{ type: "text", text: plan.prompt }],
    parent,
    ...(plan.agentPreset === undefined ? {} : { agentPreset: plan.agentPreset }),
    ...(plan.name === undefined ? {} : { name: plan.name }),
    ...(plan.agentOptions === undefined ? {} : { agentOptions: plan.agentOptions }),
    ...(plan.maxDepth === undefined ? {} : { maxDepth: plan.maxDepth }),
  });
  return { kind: "activation", name: activation.name };
}

/** Complete delegation: plan and start one child. */
export async function delegate(
  parent: Agent,
  args: DelegationArgs,
  runtime: DelegationRuntime,
  config: PstackSubagentConfig,
  signal: AbortSignal,
): Promise<ActivationResult> {
  return startChild(parent, planDelegation(args, runtime, config), runtime, signal);
}

export function apply(ctx: Context, rawConfig?: unknown): void {
  const config = normalizeConfig(rawConfig);
  const runtime: DelegationRuntime = {
    subagents: ctx.subagents,
    llm: ctx.llm,
    potetoModeSkillPath: POTETO_MODE_SKILL_PATH,
  };
  ctx.tools.register(createPstackSubagentTool(runtime, config));
  ctx.tools.register(createPstackInterruptTool(runtime));
}

/** Build the model-facing tool. Exported for tests. */
export function createPstackSubagentTool(
  runtime: DelegationRuntime,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: {
          type: "string",
          description: "A short 3-5 word description of the delegated task, for display.",
        },
        prompt: {
          type: "string",
          description:
            "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs.",
        },
        name: {
          type: ["string", "null"],
          description:
            "Optional subagent name, unique among the parent's children; lets list_agents and send_message address it by name.",
        },
        agent_preset: {
          type: "string",
          enum: [...AGENT_KINDS],
          description:
            'Optional child agent preset; defaults to "general". "poteto-agent" for pstack implementation, "comment-sicko" for comment review, "readonly" for a sandbox-enforced read-only researcher.',
        },
        provider: {
          type: ["string", "null"],
          description:
            "Optional model provider; pass together with `model` to override the child route, or omit both to inherit the parent route.",
        },
        model: {
          type: ["string", "null"],
          description:
            "Optional model id; pass together with `provider` to override the child route, or omit both to inherit the parent route.",
        },
        reasoning_effort: {
          type: ["string", "null"],
          description:
            "Optional advertised reasoning-effort token; requires `provider` and `model`. Omit it to use the target model's default when changing routes, or inherit the parent's current effort when keeping the same route.",
        },
        maxDepth: {
          type: ["integer", "null"],
          minimum: 1,
          description:
            "Optional delegation-depth cap. Omit or null to use the configured row and Host cap.",
        },
      },
      required: ["description", "prompt"],
    },
    output: textOutput<ActivationResult>(OUTPUT_SCHEMA, renderDelegation),
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec: ToolRunContext) {
      if (exec.agent === undefined) throw new Error("pstack_subagent requires a calling Agent");
      return delegate(exec.agent, parseDelegationArgs(rawArgs), runtime, config, exec.signal);
    },
  };
}

/** Build the pstack-owned interrupt tool. Exported for tests. */
export function createPstackInterruptTool(runtime: DelegationRuntime): ToolDefinition {
  return {
    name: INTERRUPT_TOOL_NAME,
    description: INTERRUPT_TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        agent: {
          type: "string",
          description: "The child agent to stop: its name from `list_agents` or its Session id.",
        },
      },
      required: ["agent"],
    },
    output: textOutput<InterruptResult>(INTERRUPT_OUTPUT_SCHEMA, renderInterrupt),
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec: ToolRunContext) {
      if (exec.agent === undefined) throw new Error("pstack_interrupt requires a calling Agent");
      const agent = parseInterruptTarget(rawArgs);
      const targetId = await runtime.subagents.resolveName(exec.agent, agent, exec.signal);
      runtime.subagents.interrupt(targetId, { kind: "ancestor", agent: exec.agent });
      return { interrupted: true };
    },
  };
}

interface InterruptResult {
  interrupted: boolean;
}

const INTERRUPT_TOOL_DESCRIPTION = [
  "Stop the current turn of one child agent, addressed by its name from `list_agents` or its Session id.",
  "",
  "Built-in presets disable the native `interrupt_agent`, so this is the interruption path for a pstack child.",
].join("\n");

const INTERRUPT_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  required: ["interrupted"],
  properties: { interrupted: { type: "boolean" } },
};

function renderInterrupt(result: InterruptResult): string {
  return result.interrupted ? "interrupt admitted to the child" : "interrupt not admitted";
}

/** Read the interrupt target before touching the runtime. */
export function parseInterruptTarget(raw: unknown): string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ToolArgsError(["arguments must be an object"]);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "agent") throw new ToolArgsError([`unknown argument "${key}"`]);
  }
  const agent = record["agent"];
  if (typeof agent !== "string" || agent.trim() === "") {
    throw new ToolArgsError(["agent must be a non-empty string"]);
  }
  return agent.trim();
}

const TOOL_DESCRIPTION = [
  "Delegate self-contained work to one subagent.",
  "",
  "Pass `description` and `prompt`. Pass `provider` and `model` together, plus an optional `reasoning_effort` token the model advertises, to override the child route; omit both to inherit the parent route.",
  "",
  "One call starts one child. Fan out by calling this tool several times in one message; each call is independent.",
  "",
  "`agent_preset` picks a DSH agent preset: `poteto-agent` mounts the pstack implementation delegate and receives the absolute path of the poteto-mode instructions; `comment-sicko` mounts the comment reviewer; `readonly` mounts a read-only research preset with the sandbox policy set to read-only; `general` joins the parent preset.",
  "",
  "Omit `maxDepth` to use the configured row and Host delegation cap.",
  "",
  "Returns the started subagent name. Results arrive as a completion notice; do not poll.",
].join("\n");

const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", const: "activation" },
    name: { type: "string" },
  },
  required: ["kind", "name"],
};

function renderDelegation(result: ActivationResult): string {
  return `started subagent ${result.name}`;
}

function buildAgentOptions(
  provider: string | null,
  model: string | null,
  effort: string | undefined,
): AgentOptions | undefined {
  const effortOption = effort === undefined ? {} : { reasoningEffort: effort as ReasoningEffortId };
  if (provider !== null && model !== null) {
    return { provider, model, ...effortOption };
  }
  return effort === undefined ? undefined : effortOption;
}

function injectPotetoModePath(task: string, path: string): string {
  return [
    "Absolute path injected by `pstack_subagent`:",
    `- \`poteto-mode\` SKILL.md: \`${path}\``,
    "",
    "Read it directly before doing any work. Your skill catalog hides this skill, so a missing catalog entry does not mean pstack is absent.",
    "",
    "Task:",
    "",
    task,
  ].join("\n");
}

function assertCapabilities(capabilities: SubagentCapabilities, plan: DelegationPlan): void {
  const missing = [
    ...(plan.agentOptions !== undefined && !capabilities.agentOptions ? ["agentOptions"] : []),
    ...(plan.agentPreset !== undefined && !capabilities.agentPreset ? ["agentPreset"] : []),
    ...(plan.maxDepth !== undefined && !capabilities.depthLimit ? ["maxDepth"] : []),
  ];
  if (missing.length > 0) {
    throw new Error(`subagent provider does not support ${missing.join(", ")}`);
  }
}

async function preflightRoute(
  llm: LlmRuntime,
  plan: DelegationPlan,
  signal: AbortSignal,
): Promise<void> {
  const options = plan.agentOptions;
  if (options === undefined || options.provider === undefined || options.model === undefined)
    return;
  await llm.resolveCallConfig(
    {
      provider: options.provider,
      model: options.model,
      ...(options.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: options.reasoningEffort }),
    },
    signal,
  );
}
