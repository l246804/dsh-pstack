/**
 * `pstack_subagent`: pstack's delegation surface for DSH.
 *
 * Cursor's `Task` tool gives every spawn a `subagent_type`, a model slug, and
 * background execution. DSH splits those across `ctx.subagents` (background
 * activations), the agent preset system (composition), and the LLM adapter
 * routes (model choice). This tool joins them back into one call whose shape a
 * ported pstack skill can use unchanged.
 */
import { readFile } from "node:fs/promises";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { ReasoningEffortId } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-subagent";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { loadRoleTable } from "./models.ts";
import { AGENTS_ROOT, SKILLS_ROOT } from "./paths.ts";
import { resolveRole, type Route } from "./roles.ts";

export const name = "pstack-subagent";
export const inject = ["tools", "subagents"];

const AGENT_KINDS = ["poteto-agent", "comment-sicko", "general"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export interface Config {
  /** Tool name exposed to the model. */
  readonly toolName?: string;
  /** Subagent provider registered on `ctx.subagents`. */
  readonly provider?: string;
  /** Default agent kind when the model omits `agent`. */
  readonly defaultAgent?: AgentKind;
}

const POTETO_AGENT_PATH = `${AGENTS_ROOT}poteto-agent.md`;
const COMMENT_SICKO_PATH = `${AGENTS_ROOT}comment-sicko.md`;
const POTETO_MODE_PATH = `${SKILLS_ROOT}poteto-mode/SKILL.md`;

export function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) return source;
  const end = source.indexOf("\n---", 3);
  return end === -1 ? source : source.slice(end + 4).replace(/^\n+/, "");
}

export async function readAgentInstructions(kind: AgentKind): Promise<string> {
  if (kind === "general") return "";
  const path = kind === "poteto-agent" ? POTETO_AGENT_PATH : COMMENT_SICKO_PATH;
  try {
    return stripFrontmatter(await readFile(path, "utf8"));
  } catch {
    return "";
  }
}

/**
 * Build the child prompt. A pstack delegate must read `poteto-mode` first, and
 * the parent normally passes its absolute path. When the parent omits it, this
 * fallback keeps the delegate from drifting into general-purpose style.
 */
export function composePrompt(input: {
  readonly kind: AgentKind;
  readonly description: string;
  readonly prompt: string;
  readonly agentInstructions: string;
  readonly potetoModePath?: string;
}): string {
  if (input.kind === "general") return input.prompt;

  const path = input.potetoModePath ?? POTETO_MODE_PATH;
  const sections = [
    input.agentInstructions.trim(),
    `Parent task label: ${input.description}`,
    `Read \`${path}\` in full before any work, including its inline Principles index. Navigate to a leaf \`principle-*\` skill whenever you apply that principle.`,
    input.prompt.trim(),
  ].filter(Boolean);
  return sections.join("\n\n");
}

export interface PstackToolDeps {
  readonly start: (input: {
    readonly parent: Agent;
    readonly label: string;
    readonly prompt: ContentBlock[];
    readonly signal: AbortSignal;
    readonly route: Route | undefined;
    readonly cwd: string | undefined;
  }) => Promise<{ readonly childId: string }>;
  readonly loadAgent: (kind: AgentKind) => Promise<string>;
  readonly loadRole: (role: string | undefined) => Promise<Route | undefined>;
  readonly potetoModePath?: string;
  readonly defaultAgent?: AgentKind;
  readonly toolName?: string;
}

/** Tool definition over injected dependencies; `apply` supplies the runtime. */
export function createPstackTool(deps: PstackToolDeps) {
  return defineTool({
    name: deps.toolName ?? "pstack_subagent",
    description:
      'Delegate a self-contained task to a pstack subagent. Use `agent: "poteto-agent"` for code-writing delegates and helper tasks spawned inside a /poteto-mode playbook step. Use `agent: "general"` for workflow reviewers such as how, why, arena, swarm, interrogate, and reflect. Use `agent: "comment-sicko"` only through /no-comments. Pass `role` to select the route configured in ~/.dsh/pstack-models.md; omit it to inherit the parent route. The call returns the child id immediately and the runtime reports the final answer in a completion notice.',
    parameters: {
      description: {
        type: "string",
        description: "A short (3-5 word) description of the delegated task, for display.",
        required: true,
      },
      prompt: {
        type: "string",
        description:
          "The complete, self-contained task for the subagent. It does not share this conversation, so include context, file pointers, constraints, and the check that proves the work.",
        required: true,
      },
      agent: {
        type: "string",
        enum: AGENT_KINDS,
        description:
          "poteto-agent (default) for pstack delegates; general for workflow reviewers; comment-sicko for comment review.",
      },
      role: {
        type: "string",
        description:
          'Role line in ~/.dsh/pstack-models.md, such as "feature, refactoring" or "judgment and prose". Omit to inherit the parent route.',
      },
      cwd: {
        type: "string",
        description: "Initial child working directory. Omit to inherit the parent directory.",
      },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    async execute(args, exec) {
      const parent = exec.agent;
      if (!parent) throw new Error("pstack_subagent requires an agent context");

      const kind = (args.agent ?? deps.defaultAgent ?? "poteto-agent") as AgentKind;
      const agentInstructions = await deps.loadAgent(kind);
      const prompt = composePrompt({
        kind,
        description: args.description,
        prompt: args.prompt,
        agentInstructions,
        ...(deps.potetoModePath ? { potetoModePath: deps.potetoModePath } : {}),
      });
      const route = await deps.loadRole(args.role);

      const activation = await deps.start({
        parent,
        label: args.description,
        prompt: [{ type: "text", text: prompt }],
        signal: exec.signal,
        route,
        cwd: args.cwd,
      });

      return `started subagent ${activation.childId}`;
    },
  });
}

/**
 * Mount the tool. `ctx.subagents` owns child lifecycle; this row only supplies
 * the pstack-specific shape (agent preambles and role routes) on top.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const providerName = config.provider ?? "spawn";

  const tool = createPstackTool({
    async start({ parent, label, prompt, signal, route, cwd }) {
      const activation = await ctx.subagents.startActivation({
        provider: providerName,
        label,
        signal,
        delivery: "parent",
        request: {
          parent,
          prompt,
          ...(cwd ? { cwd } : {}),
          ...(route
            ? {
                agentOptions: {
                  provider: route.provider,
                  model: route.model,
                  ...(route.reasoningEffort
                    ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }
                    : {}),
                },
              }
            : {}),
        },
      });
      return { childId: String(activation.childId) };
    },
    loadAgent: readAgentInstructions,
    loadRole: async (role) => (role ? resolveRole(await loadRoleTable(), role) : undefined),
    potetoModePath: POTETO_MODE_PATH,
    ...(config.defaultAgent ? { defaultAgent: config.defaultAgent } : {}),
    ...(config.toolName ? { toolName: config.toolName } : {}),
  });
  ctx.tools.register(tool);
}
