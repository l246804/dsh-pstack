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
import { loadRoleTable, modelConfigPath } from "./models.ts";
import { AGENTS_ROOT, SKILLS_ROOT } from "./paths.ts";
import { findNearMisses, lookupRole, resolveRole, type Route } from "./roles.ts";

export const name = "pstack-subagent";
export const inject = ["tools", "subagents", "llm"];

const AGENT_KINDS = ["poteto-agent", "comment-sicko", "general"] as const;
const PANEL_ROLES = new Set(["arena runners", "architect runners", "interrogate reviewers"]);
export type AgentKind = (typeof AGENT_KINDS)[number];

export interface Config {
  /** Tool name exposed to the model. */
  readonly toolName?: string;
  /** Subagent provider registered on `ctx.subagents`. */
  readonly provider?: string;
  /** Default agent kind when the model omits `agent`. */
  readonly defaultAgent?: AgentKind;
  /**
   * Delegation depth cap for pstack-created children. The model may request a
   * lower value, but never exceed this cap. Omitted values use the DSH
   * subagent setting.
   */
  readonly maxDepth?: number;
  /** Presets the model may select. Omit to keep preset selection deployment-only. */
  readonly allowedAgentPresets?: readonly string[];
  /** Preset applied to every child when the model cannot select one. */
  readonly agentPreset?: string;
  /**
   * Exact `provider/model` routes allowed for role-resolved children. Omit to
   * leave pstack route selection unrestricted. An empty list rejects every
   * explicit route.
   */
  readonly allowedModels?: readonly string[];
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

export interface RoleResolution {
  readonly route: Route | undefined;
  /** Present for multi-entry roles, with one route (or inheritance) per entry. */
  readonly panelRoutes?: readonly (Route | undefined)[];
  /** Human-readable notes to append to the tool reply: issues, near misses. */
  readonly notes: readonly string[];
}

/**
 * Resolve the `role` argument against the shipped role table, explaining a miss
 * instead of swallowing it.
 *
 * A missing file is normal. A configured-but-unmatched role is not: it means a
 * skill and `~/.dsh/pstack-models.md` disagree, and the child would silently run
 * on the parent route. The tool reply says so, so the parent can fix the file or
 * report the miss rather than believing the route applied.
 */
export async function resolveRoleArg(
  role: string | undefined,
  roleIndex?: number,
): Promise<RoleResolution> {
  if (!role) return { route: undefined, notes: [] };
  if (roleIndex !== undefined && (!Number.isSafeInteger(roleIndex) || roleIndex < 0)) {
    throw new Error("pstack: roleIndex must be a non-negative safe integer");
  }

  const { table, issues, unreadable } = await loadRoleTable();
  const match = lookupRole(table, role);
  if (match) {
    const notes = issues.map((issue) =>
      issue.line > 0
        ? `pstack: ${modelConfigPath()}:${issue.line}: ${issue.message}`
        : issue.message,
    );
    const panelRoutes =
      roleIndex === undefined && PANEL_ROLES.has(match.key) && match.values.length > 1
        ? match.values.map((_, index) => resolveRole(table, role, index))
        : undefined;
    return {
      route: resolveRole(table, role, roleIndex),
      ...(panelRoutes ? { panelRoutes } : {}),
      notes,
    };
  }

  const near = findNearMisses(table, role);
  const lines: string[] = [];
  if (unreadable) {
    lines.push(
      `pstack: ${modelConfigPath()} could not be read; the child inherits the parent route.`,
    );
  } else if (table.size === 0) {
    lines.push(
      `pstack: no role table at ${modelConfigPath()}; the child inherits the parent route. Run /setup-pstack to configure roles.`,
    );
  } else {
    lines.push(
      `pstack: role "${role}" is not in ${modelConfigPath()}; the child inherits the parent route.`,
    );
    if (near.length > 0)
      lines.push(`pstack: did you mean ${near.map((n) => `"${n}"`).join(" or ")}?`);
  }
  return { route: undefined, notes: lines };
}

export interface PstackToolDeps {
  readonly start: (input: {
    readonly parent: Agent;
    readonly label: string;
    readonly prompt: ContentBlock[];
    readonly signal: AbortSignal;
    readonly route: Route | undefined;
    readonly cwd: string | undefined;
    readonly agentPreset: string | undefined;
    readonly maxDepth: number | undefined;
  }) => Promise<{ readonly childId: string }>;
  readonly loadAgent: (kind: AgentKind) => Promise<string>;
  /**
   * Resolve the `role` argument. The notes explain a miss so the reply can name
   * it; an empty list means the route applied as written, or there was no role.
   */
  readonly loadRole: (role: string | undefined, roleIndex?: number) => Promise<RoleResolution>;
  readonly potetoModePath?: string;
  readonly defaultAgent?: AgentKind;
  readonly toolName?: string;
  /** Returns the current depth cap. Read per call so host setting changes apply. */
  readonly maxDepth?: () => number | undefined;
  readonly allowedAgentPresets?: readonly string[];
  readonly defaultAgentPreset?: string;
  readonly allowedModels?: readonly string[];
  readonly validateRoute?: (route: Route, signal: AbortSignal) => Promise<void>;
}

/**
 * Turn a resolved role into the `agentOptions` a child activation carries.
 *
 * This is the only place a `Route` becomes a provider request. Keeping it a
 * pure function lets a test assert the exact options without starting a child,
 * which is where a role-to-route bug would otherwise stay invisible until a
 * live delegation picked the wrong model.
 */
export function routeToAgentOptions(
  route: Route | undefined,
): { provider: string; model: string; reasoningEffort?: ReasoningEffortId } | undefined {
  if (!route) return undefined;
  return {
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort ? { reasoningEffort: ReasoningEffortId(route.reasoningEffort) } : {}),
  };
}

/** Tool definition over injected dependencies; `apply` supplies the runtime. */
export function createPstackTool(deps: PstackToolDeps) {
  const allowedPresets = deps.allowedAgentPresets ?? [];
  const agentPresetParameter =
    allowedPresets.length > 0
      ? {
          type: "string" as const,
          enum: [...allowedPresets],
          description:
            "Optional DSH agent preset for this child, limited to the pstack-subagent allowlist. Omit to inherit the parent's preset.",
        }
      : undefined;

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
      ...(agentPresetParameter ? { agentPreset: agentPresetParameter } : {}),
      maxDepth: {
        type: "integer",
        description:
          "Requested maximum delegation depth. pstack clamps it to the pstack-subagent cap; omit to use the cap.",
      },
      roleIndex: {
        type: "integer",
        description:
          "Select one zero-based entry from a multi-route role. Omit for automatic panel expansion on panel roles.",
      },
    },
    output: {
      schema: { type: "string" },
      render: (_args, value) => [{ type: "text", text: value }],
    },
    isConcurrencySafe: () => true,
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
      if (args.roleIndex !== undefined && !args.role) {
        throw new Error("pstack: roleIndex requires a role");
      }
      const allowedPresets = deps.allowedAgentPresets ?? [];
      if (args.agentPreset !== undefined && !allowedPresets.includes(args.agentPreset)) {
        throw new Error(
          `pstack: agentPreset "${args.agentPreset}" is not in the pstack-subagent allowlist`,
        );
      }
      const agentPreset = args.agentPreset ?? deps.defaultAgentPreset;
      const { route, panelRoutes, notes } = await deps.loadRole(args.role, args.roleIndex);
      const routes = panelRoutes ?? [route];
      const routeNotes = [...notes];
      const configuredMaxDepth = deps.maxDepth?.();
      const requestedMaxDepth = args.maxDepth;
      if (
        requestedMaxDepth !== undefined &&
        (!Number.isSafeInteger(requestedMaxDepth) || requestedMaxDepth < 0)
      ) {
        throw new Error("pstack: maxDepth must be a non-negative safe integer");
      }
      let maxDepth = configuredMaxDepth;
      if (requestedMaxDepth !== undefined) {
        if (configuredMaxDepth === undefined) {
          routeNotes.push("pstack: maxDepth is provider-managed; the requested value is ignored.");
        } else {
          maxDepth = Math.min(requestedMaxDepth, configuredMaxDepth);
          if (requestedMaxDepth > configuredMaxDepth) {
            routeNotes.push(
              `pstack: maxDepth ${requestedMaxDepth} exceeds the pstack-subagent cap ${configuredMaxDepth}; using ${maxDepth}.`,
            );
          }
        }
      }
      const assertAllowedRoute = (childRoute: Route): void => {
        if (
          deps.allowedModels !== undefined &&
          !deps.allowedModels.includes(`${childRoute.provider}/${childRoute.model}`)
        ) {
          throw new Error(
            `pstack: route ${childRoute.provider}/${childRoute.model} is not in the pstack-subagent allowedModels list`,
          );
        }
      };
      const validatedRoutes: Array<Route | undefined> = [];
      for (const [index, childRoute] of routes.entries()) {
        if (childRoute) {
          assertAllowedRoute(childRoute);
          try {
            if (deps.validateRoute) await deps.validateRoute(childRoute, exec.signal);
          } catch (error) {
            if (!panelRoutes || exec.signal.aborted) throw error;
            const detail = error instanceof Error ? error.message : String(error);
            routeNotes.push(
              `pstack: panel entry ${index + 1} route ${childRoute.provider}/${childRoute.model} is unavailable; using the parent route. ${detail}`,
            );
            validatedRoutes.push(undefined);
            continue;
          }
        }
        validatedRoutes.push(childRoute);
      }
      const childIds: string[] = [];
      for (const [index, childRoute] of validatedRoutes.entries()) {
        try {
          const activation = await deps.start({
            parent,
            label:
              routes.length > 1
                ? `${args.description} (${index + 1}/${routes.length})`
                : args.description,
            prompt: [
              {
                type: "text",
                text:
                  routes.length > 1
                    ? `${prompt}\n\nPanel entry: ${index + 1} of ${routes.length}.`
                    : prompt,
              },
            ],
            signal: exec.signal,
            route: childRoute,
            cwd: args.cwd,
            agentPreset,
            maxDepth,
          });
          childIds.push(activation.childId);
        } catch (error) {
          const started = childIds.length > 0 ? ` Already started: ${childIds.join(", ")}.` : "";
          throw new Error(
            `pstack: failed to start panel entry ${index + 1} of ${routes.length}.${started}`,
            { cause: error },
          );
        }
      }

      const started =
        childIds.length === 1
          ? `started subagent ${childIds[0]}`
          : `started ${childIds.length} panel subagents ${childIds.join(", ")}`;
      return routeNotes.length > 0 ? [started, ...routeNotes].join("\n") : started;
    },
  });
}

/**
 * Build the provider-facing activation request for one child.
 *
 * A role is resolved once, at delegation time, into concrete provider options.
 * The child inherits the parent route when the role is absent or resolves to
 * `inherit-parent`, which is why the field is omitted rather than set to a
 * placeholder.
 */
export function buildActivationRequest(input: {
  readonly parent: Agent;
  readonly prompt: ContentBlock[];
  readonly route: Route | undefined;
  readonly cwd: string | undefined;
  readonly agentPreset?: string;
  readonly maxDepth?: number;
}): {
  parent: Agent;
  prompt: ContentBlock[];
  cwd?: string;
  agentPreset?: string;
  agentOptions?: { provider: string; model: string; reasoningEffort?: ReasoningEffortId };
  maxDepth?: number;
} {
  const options = routeToAgentOptions(input.route);
  return {
    parent: input.parent,
    prompt: input.prompt,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.agentPreset ? { agentPreset: input.agentPreset } : {}),
    ...(options ? { agentOptions: options } : {}),
    ...(input.maxDepth !== undefined ? { maxDepth: input.maxDepth } : {}),
  };
}

/**
 * Mount the tool. `ctx.subagents` owns child lifecycle; this row only supplies
 * the pstack-specific shape (agent preambles and role routes) on top.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const providerName = config.provider ?? "spawn";

  const tool = createPstackTool({
    async start({ parent, label, prompt, signal, route, cwd, agentPreset, maxDepth }) {
      const activation = await ctx.subagents.startActivation({
        provider: providerName,
        label,
        signal,
        delivery: "parent",
        request: buildActivationRequest({
          parent,
          prompt,
          route,
          cwd,
          agentPreset,
          maxDepth,
        }),
      });
      return { childId: String(activation.childId) };
    },
    loadAgent: readAgentInstructions,
    loadRole: resolveRoleArg,
    maxDepth: () => ctx.subagents.resolveMaxDepth(config.maxDepth),
    ...(config.allowedAgentPresets !== undefined
      ? { allowedAgentPresets: config.allowedAgentPresets }
      : {}),
    ...(config.agentPreset !== undefined ? { defaultAgentPreset: config.agentPreset } : {}),
    ...(config.allowedModels !== undefined ? { allowedModels: config.allowedModels } : {}),
    validateRoute: async (route, signal) => {
      let model;
      try {
        model = await ctx.llm.resolveModelInfo(route.provider, route.model, signal);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `pstack: configured route ${route.provider}/${route.model} could not be resolved: ${detail}`,
          { cause: error },
        );
      }
      if (
        route.reasoningEffort &&
        !model.reasoning?.efforts.some((effort) => effort.id === route.reasoningEffort)
      ) {
        throw new Error(
          `pstack: ${route.provider}/${route.model} does not support reasoning effort "${route.reasoningEffort}"`,
        );
      }
    },
    potetoModePath: POTETO_MODE_PATH,
    ...(config.defaultAgent ? { defaultAgent: config.defaultAgent } : {}),
    ...(config.toolName ? { toolName: config.toolName } : {}),
  });
  ctx.tools.register(tool);
}
