/**
 * `pstack_subagent`: pstack's delegation entry point.
 *
 * One call plans one or more fresh children, validates everything before the first
 * start, then starts them through `ctx.subagents.startActivation` with parent
 * delivery. Results arrive as completion notices; this module never polls.
 *
 * Validation order follows the design's delegation flow, and every check that can
 * reject a call happens before the first child starts, except a start failure in
 * the middle of a panel, which keeps the children already running and names them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PSTACK_MODELS_FILENAME } from "../scripts/role-manifest.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import type {
  Agent,
  AgentOptions,
  AgentsHost,
  JsonSchemaNode,
  LlmHost,
  SubagentCapabilities,
  SubagentsHost,
  TextBlock,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
} from "./host-contract.ts";
import {
  SET_EFFORT_TOOL,
  agentOptionsFor,
  effectiveEffort,
  installEffortControl,
  validateEffortFor,
} from "./effort.ts";
import {
  modelsFilePath,
  readRoleFile,
  resolveDshHome,
  selectRoleRoutes,
  type ChildRoute,
  type RouteSelection,
} from "./models.ts";
import { ASSETS_ROOT, POTETO_MODE_SKILL_PATH, agentPreamblePath } from "./paths.ts";
import { requireRole, type RoleSpec } from "./roles.ts";

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack-subagent";

/**
 * Delegation needs the tool registry, the subagent registry, and the LLM adapters.
 *
 * `agents` is deliberately **not** here. It is used only to reach a child this tool
 * has just started, and a composition without it still delegates: the children keep
 * the effort their request carried and cannot change it afterwards. Declaring it as
 * a hard dependency would make the whole row inert in such a profile, so the tool
 * would not exist at all — the failure `pstack-history` already paid for once with
 * `sessionQuery`. It is read per call through `ctx.get("agents")` instead, which is
 * why a controller mounted after this row is still seen.
 */
export const inject = ["tools", "subagents", "llm"];

/** Model-facing tool name. */
export const TOOL_NAME = "pstack_subagent";

/** Backend used when the row does not name one. */
export const DEFAULT_SUBAGENT_PROVIDER = "spawn";

/** Agent type used when the call does not name one. */
export const DEFAULT_AGENT_KIND = "poteto-agent";

/** The child kinds this tool knows how to brief. */
export const AGENT_KINDS = ["poteto-agent", "comment-sicko", "general"] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

/** One exact route a row may authorize for explicit child selection. */
export interface AllowedModelRoute {
  readonly provider: string;
  readonly model: string;
}

/** Row configuration. */
export interface PstackSubagentConfig {
  /** `ctx.subagents` provider to start children on. */
  readonly provider: string;
  /**
   * This row's delegation-depth cap. A call may lower it and may never exceed it.
   * Omitted means the Host setting decides.
   */
  readonly maxDepth?: number;
  /**
   * Exact routes this row authorizes. Empty means no explicit route limit. This is
   * pstack's own check and is unrelated to the native session `allowedModels`
   * policy, which this plugin does not read.
   */
  readonly allowedModels: readonly AllowedModelRoute[];
  /** Non-empty allowlist; also what makes `agentPreset` appear in the schema. */
  readonly allowedAgentPresets: readonly string[];
}

const DEFAULT_CONFIG: PstackSubagentConfig = {
  provider: DEFAULT_SUBAGENT_PROVIDER,
  allowedModels: [],
  allowedAgentPresets: [],
};

/** What a call asked for, after argument validation. */
export interface DelegationArgs {
  readonly description: string;
  readonly prompt: string;
  readonly agent: AgentKind;
  readonly role?: string;
  readonly cwd?: string;
  readonly agentPreset?: string;
  readonly maxDepth?: number;
  readonly roleIndex?: number;
  /**
   * Effort for every child this call starts, overriding each role line's value.
   *
   * Validated per entry against the model that entry will actually request, so a
   * panel with one incompatible entry starts nothing rather than half its children.
   */
  readonly reasoningEffort?: string;
}

/** One child this call started. */
export interface ChildRecord {
  readonly childId: string;
  readonly label: string;
  readonly agent: string;
  readonly role: string;
  readonly route: string;
  /** The effort this child runs at, when any applies. */
  readonly effort?: string;
  readonly maxDepth?: number;
}

export interface DelegationResult {
  readonly kind: "activation" | "activations";
  readonly children: readonly ChildRecord[];
  readonly diagnostics: readonly string[];
}

/** Raised for a configuration or argument problem, before any child starts. */
export class DelegationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationError";
  }
}

/** Raised when a child starts but a later entry in the same call fails. */
export class PartialDelegationError extends DelegationError {
  readonly startedChildren: readonly ChildRecord[];

  constructor(message: string, startedChildren: readonly ChildRecord[]) {
    super(message);
    this.name = "PartialDelegationError";
    this.startedChildren = startedChildren;
  }
}

/** Raised when a required agent preamble is missing or unusable. */
export class PreambleError extends DelegationError {
  constructor(message: string) {
    super(message);
    this.name = "PreambleError";
  }
}

/** The live services and locations one delegation reads. */
export interface SubagentRuntime {
  readonly subagents: SubagentsHost;
  readonly llm: LlmHost;
  /**
   * The Agent registry, used to reach a child this tool just started.
   *
   * Optional because a row can be composed without the `agents` service and a
   * delegation still works there: the children then keep the effort their request
   * carried and simply cannot change it afterwards. Making it required would turn a
   * missing service into a row that registers no tool at all.
   */
  readonly agents?: AgentsHost;
  /** `$DSH_HOME`, home of the role file. */
  readonly dshHome: string;
  /** Absolute package assets root, home of the agent preambles. */
  readonly assetsRoot: string;
}

// ---------------------------------------------------------------------------
// Row config
// ---------------------------------------------------------------------------

interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

type StandardSchemaResult =
  | { readonly value: PstackSubagentConfig; readonly issues?: undefined }
  | { readonly issues: readonly StandardSchemaIssue[] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Minimal Standard Schema for this row, so an omitted `config` is valid and a
 * typo fails at load instead of at the first delegation.
 */
export const Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-pstack",
    validate(value: unknown): StandardSchemaResult {
      if (value === undefined || value === null) return { value: DEFAULT_CONFIG };
      if (typeof value !== "object" || Array.isArray(value)) {
        return { issues: [{ message: "config must be a mapping" }] };
      }

      const record = value as Record<string, unknown>;
      const issues: StandardSchemaIssue[] = [];
      const allowedKeys = new Set([
        "provider",
        "maxDepth",
        "allowedModels",
        "allowedAgentPresets",
      ]);
      for (const key of Object.keys(record)) {
        if (!allowedKeys.has(key)) issues.push({ message: `unknown field "${key}"`, path: [key] });
      }

      const provider = record["provider"];
      if (provider !== undefined && !isNonEmptyString(provider)) {
        issues.push({ message: "provider must be a non-empty string", path: ["provider"] });
      }

      const maxDepth = record["maxDepth"];
      if (maxDepth !== undefined && !isNonNegativeSafeInteger(maxDepth)) {
        issues.push({
          message: "maxDepth must be a non-negative safe integer",
          path: ["maxDepth"],
        });
      }

      const allowedModels = record["allowedModels"];
      const models: AllowedModelRoute[] = [];
      if (allowedModels !== undefined) {
        if (!Array.isArray(allowedModels)) {
          issues.push({ message: "allowedModels must be an array", path: ["allowedModels"] });
        } else {
          allowedModels.forEach((entry, index) => {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
              issues.push({
                message: "each allowedModels entry must be a { provider, model } object",
                path: ["allowedModels", index],
              });
              return;
            }
            const route = entry as Record<string, unknown>;
            const routeProvider = route["provider"];
            const routeModel = route["model"];
            if (!isNonEmptyString(routeProvider) || !isNonEmptyString(routeModel)) {
              issues.push({
                message: "each allowedModels entry needs a non-empty provider and model",
                path: ["allowedModels", index],
              });
              return;
            }
            if (models.some((known) => known.provider === routeProvider && known.model === routeModel)) {
              issues.push({
                message: `duplicate allowedModels route "${routeProvider}/${routeModel}"`,
                path: ["allowedModels", index],
              });
              return;
            }
            models.push({ provider: routeProvider, model: routeModel });
          });
        }
      }

      const allowedPresets = record["allowedAgentPresets"];
      const presets: string[] = [];
      if (allowedPresets !== undefined) {
        if (!Array.isArray(allowedPresets)) {
          issues.push({
            message: "allowedAgentPresets must be an array",
            path: ["allowedAgentPresets"],
          });
        } else {
          allowedPresets.forEach((entry, index) => {
            if (!isNonEmptyString(entry)) {
              issues.push({
                message: "each allowedAgentPresets entry must be a non-empty string",
                path: ["allowedAgentPresets", index],
              });
              return;
            }
            if (presets.includes(entry)) {
              issues.push({
                message: `duplicate allowedAgentPresets entry "${entry}"`,
                path: ["allowedAgentPresets", index],
              });
              return;
            }
            presets.push(entry);
          });
        }
      }

      if (issues.length > 0) return { issues };
      return {
        value: {
          provider: isNonEmptyString(provider) ? provider : DEFAULT_SUBAGENT_PROVIDER,
          ...(isNonNegativeSafeInteger(maxDepth) ? { maxDepth } : {}),
          allowedModels: models,
          allowedAgentPresets: presets,
        },
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Preamble
// ---------------------------------------------------------------------------

/**
 * Read one agent preamble from the package assets by absolute path.
 *
 * A missing or empty preamble blocks that agent type. It never degrades into a
 * plain child, because a `comment-sicko` or `poteto-agent` child without its
 * instructions is a different agent wearing the name.
 */
export function loadAgentPreamble(agent: AgentKind, assetsRoot: string): string | undefined {
  const path = agentPreamblePath(agent);
  if (path === undefined) return undefined;

  const absolute = join(assetsRoot, "agents", `${agent}.md`);
  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    const detail = typeof code === "string" ? code : String(error);
    throw new PreambleError(
      `the ${agent} preamble cannot be read at ${absolute} (${detail}). This agent type does not start without its preamble; reinstall dsh-pstack so the packaged assets are present, or pass agent: "general" for a plain child that gets no preamble.`,
    );
  }

  const body = parseFrontmatter(text).body.trim();
  if (body === "") {
    throw new PreambleError(
      `the ${agent} preamble at ${absolute} is empty. This agent type does not start without its instructions; repair the packaged asset or pass agent: "general".`,
    );
  }
  return body;
}

/** One absolute path the Host injects into a child brief. */
export interface InjectedPath {
  readonly label: string;
  readonly path: string;
}

/**
 * Compose the self-contained prompt one child receives.
 *
 * The preambles used to locate things themselves; the Host injects the absolute
 * paths instead, so a child never scans a plugin directory or guesses a version.
 */
export function composeChildPrompt(input: {
  readonly preamble?: string;
  readonly injectedPaths?: readonly InjectedPath[];
  readonly task: string;
}): string {
  const sections: string[] = [];
  if (input.preamble !== undefined) sections.push(input.preamble);

  const injected = input.injectedPaths ?? [];
  if (injected.length > 0) {
    sections.push(
      [
        "Absolute paths injected by `pstack_subagent`. Read them directly; do not search a plugin directory.",
        "",
        ...injected.map((entry) => `- ${entry.label}: \`${entry.path}\``),
      ].join("\n"),
    );
  }

  if (sections.length === 0) return input.task;
  sections.push(`Task:\n\n${input.task}`);
  return sections.join("\n\n---\n\n");
}

/** One planned child, before any Host call. */
export interface ChildPlan {
  readonly index: number;
  readonly total: number;
  readonly label: string;
  readonly agent: AgentKind;
  readonly role: string;
  readonly route: ChildRoute;
  readonly routeLabel: string;
  /** The effort this child will actually run at: the override when present, else the role line's. */
  readonly effort?: string;
  readonly agentOptions?: AgentOptions;
  readonly agentPreset?: string;
  readonly cwd?: string;
  readonly maxDepth?: number;
}

/** The decided plan for one call. */
export interface DelegationPlan {
  readonly agent: AgentKind;
  readonly prompt: string;
  readonly provider: string;
  readonly role: string;
  readonly mode: RouteSelection["mode"];
  readonly roleIndex?: number;
  readonly roleTotal: number;
  /** The call-wide effort override, when it supplied one. */
  readonly reasoningEffort?: string;
  readonly children: readonly ChildPlan[];
  readonly diagnostics: readonly string[];
}

// ---------------------------------------------------------------------------
// Route and depth helpers
// ---------------------------------------------------------------------------

/** The text form of one route, as reported back to the model. */
export function routeLabel(route: ChildRoute): string {
  if (route.kind === "inherit") return "inherit-parent";
  return route.effort === undefined
    ? `${route.provider}/${route.model}`
    : `${route.provider}/${route.model} [${route.effort}]`;
}

/**
 * The route text a caller sees when an effort override wins.
 *
 * `routeLabel` describes the role file, which stops being the whole truth once the
 * caller overrode the effort. Reporting the file's value there would tell the model
 * its override had been ignored.
 */
export function plannedRouteLabel(route: ChildRoute, effortOverride?: string): string {
  const effort = effectiveEffort(route, effortOverride);
  const base = route.kind === "inherit" ? "inherit-parent" : `${route.provider}/${route.model}`;
  return effort === undefined ? base : `${base} [${effort}]`;
}

export { agentOptionsFor };

/**
 * Take the smallest of the requested depth, this row's cap, and the Host setting.
 *
 * A request above the row cap is an error rather than a silent clamp, so a caller
 * cannot believe it asked for two levels when the row allows one.
 */
export function resolveDelegationDepth(
  configured: number | undefined,
  requested: number | undefined,
  hostLimit: number | undefined,
): number | undefined {
  if (requested !== undefined && !isNonNegativeSafeInteger(requested)) {
    throw new DelegationError("maxDepth must be a non-negative safe integer");
  }
  if (configured !== undefined && requested !== undefined && requested > configured) {
    throw new DelegationError(
      `maxDepth ${requested} exceeds this row's configured cap of ${configured}. Lower the request or raise \`pstack-subagent\` config.maxDepth; this tool never forwards a depth above its own row.`,
    );
  }

  const candidates = [configured, requested, hostLimit].filter(
    (value): value is number => value !== undefined,
  );
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * Validate the model-facing arguments.
 *
 * The tool schema is advisory at the model boundary, so every constraint is
 * re-checked here and reported with the reason.
 */
export function parseDelegationArgs(
  raw: unknown,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): DelegationArgs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DelegationError("arguments must be an object");
  }
  const record = raw as Record<string, unknown>;

  const known = new Set([
    "description",
    "prompt",
    "agent",
    "role",
    "cwd",
    ...(config.allowedAgentPresets.length > 0 ? ["agentPreset"] : []),
    "maxDepth",
    "roleIndex",
    "reasoningEffort",
  ]);
  for (const key of Object.keys(record)) {
    if (!known.has(key)) {
      const hint =
        key === "agentPreset"
          ? "agentPreset is only available when this row configures allowedAgentPresets"
          : `accepted arguments are ${[...known].join(", ")}`;
      throw new DelegationError(`unknown argument "${key}": ${hint}`);
    }
  }

  const description = record["description"];
  if (!isNonEmptyString(description)) {
    throw new DelegationError("description must be a non-empty string: it becomes the child label");
  }
  const prompt = record["prompt"];
  if (!isNonEmptyString(prompt)) {
    throw new DelegationError("prompt must be a non-empty string");
  }

  const agentRaw = record["agent"];
  if (agentRaw !== undefined && typeof agentRaw !== "string") {
    throw new DelegationError(`agent must be a string: ${AGENT_KINDS.join(", ")}`);
  }
  const agent = (agentRaw ?? DEFAULT_AGENT_KIND) as string;
  if (!(AGENT_KINDS as readonly string[]).includes(agent)) {
    throw new DelegationError(
      `unknown agent "${agent}". Accepted kinds are ${AGENT_KINDS.join(", ")}; a pstack agent type is not a DSH agent preset, so \`agent\` never accepts a preset id.`,
    );
  }

  const role = record["role"];
  if (role !== undefined && !isNonEmptyString(role)) {
    throw new DelegationError("role must be a non-empty string when present");
  }

  const cwd = record["cwd"];
  if (cwd !== undefined && !isNonEmptyString(cwd)) {
    throw new DelegationError("cwd must be a non-empty string when present");
  }

  const agentPreset = record["agentPreset"];
  if (agentPreset !== undefined) {
    if (config.allowedAgentPresets.length === 0) {
      throw new DelegationError(
        "agentPreset is not available: this pstack-subagent row configures no allowedAgentPresets",
      );
    }
    if (!isNonEmptyString(agentPreset) || !config.allowedAgentPresets.includes(agentPreset)) {
      throw new DelegationError(
        `agentPreset ${JSON.stringify(agentPreset)} is not in this row's allowlist (${config.allowedAgentPresets.join(", ")})`,
      );
    }
  }

  const maxDepth = record["maxDepth"];
  if (maxDepth !== undefined && !isNonNegativeSafeInteger(maxDepth)) {
    throw new DelegationError("maxDepth must be a non-negative safe integer");
  }

  const roleIndex = record["roleIndex"];
  if (roleIndex !== undefined) {
    if (!isNonNegativeSafeInteger(roleIndex)) {
      throw new DelegationError("roleIndex must be a non-negative safe integer");
    }
    if (role === undefined) {
      throw new DelegationError(
        "roleIndex requires role: it selects one entry of a list-valued role, and without a role there is no list",
      );
    }
  }

  const requestedEffort = record["reasoningEffort"];
  if (requestedEffort !== undefined && !isNonEmptyString(requestedEffort)) {
    throw new DelegationError(
      "reasoningEffort must be a non-empty string when present. It is one adapter-owned token, validated against the model this call will actually request; an empty value would silently re-enable the adapter default.",
    );
  }
  if (typeof requestedEffort === "string" && /\s/.test(requestedEffort.trim())) {
    throw new DelegationError(
      `reasoningEffort ${JSON.stringify(requestedEffort)} contains whitespace. An effort is one token, exactly as the model advertises it.`,
    );
  }

  return {
    description,
    prompt,
    agent: agent as AgentKind,
    ...(role === undefined ? {} : { role }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(agentPreset === undefined ? {} : { agentPreset }),
    ...(maxDepth === undefined ? {} : { maxDepth }),
    ...(roleIndex === undefined ? {} : { roleIndex }),
    ...(requestedEffort === undefined ? {} : { reasoningEffort: requestedEffort.trim() }),
  };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * Resolve the role file, the routes, the prompt, and the depth into one plan.
 *
 * Pure with respect to the Host: it reads the role file and the packaged preamble,
 * and it makes no service call.
 */
export function planDelegation(
  args: DelegationArgs,
  runtime: SubagentRuntime,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): DelegationPlan {
  const preamble = loadAgentPreamble(args.agent, runtime.assetsRoot);

  const rolePath = modelsFilePath(runtime.dshHome);
  const roleFile = readRoleFile(rolePath);
  if (roleFile.status === "unreadable") {
    throw new DelegationError(
      `the pstack role file at ${rolePath} exists but cannot be read (${roleFile.reason}). This is a broken configuration, not "no configuration": fix its permissions or delete the file, which makes every role inherit the parent route.`,
    );
  }
  const diagnostics: string[] = [];
  if (roleFile.status === "loaded") {
    for (const issue of roleFile.issues) {
      diagnostics.push(
        `${rolePath}${issue.line === undefined ? "" : `:${issue.line}`}: ${issue.message}`,
      );
    }
  }

  let selection: RouteSelection | undefined;
  let roleSpec: RoleSpec | undefined;
  if (args.role !== undefined) {
    roleSpec = requireRole(args.role);
    const entry = roleFile.status === "loaded" ? roleFile.roles.get(roleSpec.key) : undefined;
    selection = selectRoleRoutes(roleSpec, entry, args.roleIndex);
  }

  const routes: readonly ChildRoute[] = selection?.routes ?? [{ kind: "inherit" }];
  const roleName = roleSpec?.key ?? "(none)";

  if (selection !== undefined) {
    if (!selection.configured) {
      diagnostics.push(
        `role "${selection.role.key}" has no line in ${rolePath}, so it inherits the parent route. Add a line to route it explicitly.`,
      );
    }
    if (selection.mode === "selected") {
      diagnostics.push(
        `role "${selection.role.key}" holds ${selection.total} entries and is not an automatic panel; entry ${(selection.roleIndex ?? 0) + 1} was selected. Pass \`roleIndex\` to choose another.`,
      );
    }
    if (selection.role.key === "swarm workers") {
      diagnostics.push(
        'role "swarm workers" is a list, not a panel: its first entry is the default route for every worker, and `roleIndex` gives one race arm another entry. Each worker still needs its own pstack_subagent call, because this tool cannot compare separate calls.',
      );
    }
  }

  assertAllowedModels(routes, config, roleName);

  const injected: InjectedPath[] =
    args.agent === "poteto-agent"
      ? [{ label: "`poteto-mode` SKILL.md", path: POTETO_MODE_SKILL_PATH }]
      : [];
  const prompt = composeChildPrompt({
    ...(preamble === undefined ? {} : { preamble }),
    injectedPaths: injected,
    task: args.prompt,
  });

  // The Host setting is applied at start time; the plan records the row's own cap.
  const depth = resolveDelegationDepth(config.maxDepth, args.maxDepth, undefined);

  const total = routes.length;
  const children: ChildPlan[] = routes.map((route, index) => {
    const agentOptions = agentOptionsFor(route, args.reasoningEffort);
    const effort = effectiveEffort(route, args.reasoningEffort);
    return {
      index,
      total,
      label:
        total > 1 ? `${args.description} [${roleName} ${index + 1}/${total}]` : args.description,
      agent: args.agent,
      role: roleName,
      route,
      routeLabel: plannedRouteLabel(route, args.reasoningEffort),
      ...(effort === undefined ? {} : { effort }),
      ...(agentOptions === undefined ? {} : { agentOptions }),
      ...(args.agentPreset === undefined ? {} : { agentPreset: args.agentPreset }),
      ...(args.cwd === undefined ? {} : { cwd: args.cwd }),
      ...(depth === undefined ? {} : { maxDepth: depth }),
    };
  });

  if (args.reasoningEffort !== undefined) {
    const overwritten = routes.filter(
      (route) => route.kind === "route" && route.effort !== undefined && route.effort !== args.reasoningEffort,
    );
    if (overwritten.length > 0) {
      diagnostics.push(
        `reasoningEffort "${args.reasoningEffort}" overrides the effort this call's role line names (${overwritten
          .map((route) => routeLabel(route))
          .join(", ")}). The role line is a starting baseline, so this is allowed; pass no reasoningEffort to keep it.`,
      );
    }
  }

  addPanelDiagnostics(children, roleName, selection, rolePath, diagnostics);

  return {
    agent: args.agent,
    prompt,
    provider: config.provider,
    role: roleName,
    mode: selection?.mode ?? "single",
    ...(selection?.roleIndex === undefined ? {} : { roleIndex: selection.roleIndex }),
    roleTotal: selection?.total ?? 1,
    ...(args.reasoningEffort === undefined ? {} : { reasoningEffort: args.reasoningEffort }),
    children,
    diagnostics,
  };
}

function assertAllowedModels(
  routes: readonly ChildRoute[],
  config: PstackSubagentConfig,
  roleName: string,
): void {
  if (config.allowedModels.length === 0) return;
  const unauthorized = routes.filter(
    (route) =>
      route.kind === "route" &&
      !config.allowedModels.some(
        (allowed) => allowed.provider === route.provider && allowed.model === route.model,
      ),
  );
  if (unauthorized.length === 0) return;

  const allowed = config.allowedModels
    .map((route) => `${route.provider}/${route.model}`)
    .join(", ");
  throw new DelegationError(
    `role ${roleName} resolves to ${unauthorized.map(routeLabel).join(", ")}, which this row's allowedModels does not authorize. Authorized routes: ${allowed}. This is pstack's own row limit and is unrelated to the native session allowedModels policy.`,
  );
}

function addPanelDiagnostics(
  children: readonly ChildPlan[],
  roleName: string,
  selection: RouteSelection | undefined,
  rolePath: string,
  diagnostics: string[],
): void {
  if (selection === undefined || selection.mode !== "panel") return;

  if (children.length === 1) {
    diagnostics.push(
      `panel "${roleName}" has one configured entry, so this call started one child and claims no model diversity. Add entries to ${rolePath} for a real panel.`,
    );
    return;
  }

  const distinct = new Set(children.map((child) => child.routeLabel));
  if (distinct.size > 1) return;
  diagnostics.push(
    `all ${children.length} entries of panel "${roleName}" resolve to the same route (${[...distinct][0]}), so these children are not a cross-model review. Configure distinct routes in ${rolePath} for a real panel.`,
  );
}

// ---------------------------------------------------------------------------
// Host calls
// ---------------------------------------------------------------------------

/**
 * Validate every route, and every requested effort, before anything starts.
 *
 * `resolveCallConfig` rejects an unsupported effort and any route the owning
 * adapter does not serve. An inherit-parent entry has no provider/model of its own,
 * so its effort is validated against the parent's live route instead. This does not
 * prove credentials, quota, or a successful model call; only a real child request
 * does.
 *
 * Every entry is checked before the first child starts. A panel whose second entry
 * cannot take the effort therefore starts none of them, which is the only outcome
 * that leaves no half-applied override behind.
 */
async function preflightRoutes(
  llm: LlmHost,
  parent: Agent,
  children: readonly ChildPlan[],
  roleName: string,
  effortOverride: string | undefined,
  signal: AbortSignal,
): Promise<void> {
  for (const child of children) {
    if (child.agentOptions === undefined) continue;

    if (child.route.kind === "inherit") {
      // Only reachable with an override: an inherit route with no effort carries no
      // agentOptions at all and is skipped above.
      const effort = effortOverride as string;
      try {
        await validateEffortFor(llm, undefined, effort, parent, signal);
      } catch (error) {
        throw new DelegationError(
          `role ${roleName} inherits the parent route, and reasoningEffort "${effort}" failed preflight there: ${describeError(error)} Omit \`reasoningEffort\`, or name a role whose line holds an exact route.`,
        );
      }
      continue;
    }

    const route = child.route;
    const callConfig = {
      provider: route.provider,
      model: route.model,
      ...(child.effort === undefined ? {} : { reasoningEffort: child.effort }),
    };
    try {
      await llm.resolveCallConfig(callConfig, signal);
    } catch (error) {
      throw new DelegationError(
        `role ${roleName} resolves to ${child.routeLabel}, which failed route preflight: ${describeError(error)}. ${await effortHint(llm, route, child.effort, signal)}`,
      );
    }
  }
}

async function effortHint(
  llm: LlmHost,
  route: Extract<ChildRoute, { kind: "route" }>,
  effort: string | undefined,
  signal: AbortSignal,
): Promise<string> {
  if (effort !== undefined) {
    try {
      const info = await llm.resolveModelInfo(route.provider, route.model, signal);
      const efforts = info.reasoning?.efforts.map((entry) => entry.id) ?? [];
      if (efforts.length > 0) {
        return `Model ${route.provider}/${route.model} supports these efforts: ${efforts.join(", ")}.`;
      }
      return `Model ${route.provider}/${route.model} advertises no reasoning efforts.`;
    } catch {
      return `Fix the route or the effort in ${PSTACK_MODELS_FILENAME}; the configured provider/model pair may not be served by this deployment.`;
    }
  }
  return `Check the route in ${PSTACK_MODELS_FILENAME} against the providers this deployment registers.`;
}

/** Check the backend can enforce what this call asks for. */
export function assertProviderCapabilities(
  capabilities: SubagentCapabilities,
  providerName: string,
  asks: { readonly agentOptions: boolean; readonly agentPreset: boolean; readonly maxDepth: boolean },
): void {
  const missing: string[] = [];
  if (asks.agentOptions && !capabilities.agentOptions) missing.push("agentOptions");
  if (asks.agentPreset && !capabilities.agentPreset) missing.push("agentPreset");
  if (asks.maxDepth && !capabilities.depthLimit) missing.push("maxDepth");
  if (missing.length === 0) return;
  throw new DelegationError(
    `subagent provider "${providerName}" does not support ${missing.join(", ")}, so this call cannot be honored. Change the route to \`inherit-parent\`, drop the unsupported argument, or configure a backend that supports it; this tool never silently ignores it.`,
  );
}

/**
 * Start the planned children.
 *
 * Everything that can be rejected has already been rejected. A failure at entry N
 * keeps children 1..N-1 running and reports their ids, because the runtime owns
 * those activations and this tool cannot roll them back.
 */
export async function startPlannedChildren(
  parent: Agent,
  plan: DelegationPlan,
  runtime: SubagentRuntime,
  config: PstackSubagentConfig,
  signal: AbortSignal,
): Promise<DelegationResult> {
  const provider = runtime.subagents.getProvider(plan.provider);
  if (provider === undefined) {
    const available = runtime.subagents.list();
    throw new DelegationError(
      `subagent provider "${plan.provider}" is not registered; registered providers: ${available.length === 0 ? "(none)" : available.join(", ")}. This pstack-subagent row delegates to "${plan.provider}"; compose that backend or change the row's provider.`,
    );
  }

  const hostLimit = runtime.subagents.resolveMaxDepth(config.maxDepth);
  const effectiveDepth = resolveDelegationDepth(
    config.maxDepth,
    plan.children[0]?.maxDepth,
    hostLimit,
  );

  assertProviderCapabilities(provider.capabilities, plan.provider, {
    agentOptions: plan.children.some((child) => child.agentOptions !== undefined),
    agentPreset: plan.children.some((child) => child.agentPreset !== undefined),
    maxDepth: effectiveDepth !== undefined,
  });
  const children = plan.children.map((child) => ({
    ...child,
    ...(effectiveDepth === undefined ? {} : { maxDepth: effectiveDepth }),
  }));

  await preflightRoutes(runtime.llm, parent, children, plan.role, plan.reasoningEffort, signal);
  if (runtime.subagents.getProvider(plan.provider) !== provider) {
    throw new DelegationError(
      `subagent provider "${plan.provider}" changed while the child routes were being resolved; retry the delegation`,
    );
  }

  const started: ChildRecord[] = [];
  const diagnostics = [...plan.diagnostics];
  for (const child of children) {
    signal.throwIfAborted();
    try {
      const activation = await runtime.subagents.startActivation({
        provider: plan.provider,
        label: child.label,
        request: {
          prompt: [{ type: "text", text: plan.prompt }] satisfies TextBlock[],
          parent,
          ...(child.cwd === undefined ? {} : { cwd: child.cwd }),
          ...(child.agentPreset === undefined ? {} : { agentPreset: child.agentPreset }),
          ...(child.agentOptions === undefined ? {} : { agentOptions: child.agentOptions }),
          ...(child.maxDepth === undefined ? {} : { maxDepth: child.maxDepth }),
        },
        signal,
        delivery: "parent",
      });

      // The child can raise or lower its own effort from here on. Registration is on
      // the child's own scope, which disposes it with the child, so this call site
      // keeps no handle: a tool call that returns is not the owner of a child that
      // keeps running.
      //
      // A missing handle is not a failed delegation. The child then runs at the
      // effort the request carried and cannot change it, which is what a backend
      // without a live local Agent offers; saying so is better than implying a control
      // that is not there.
      const target =
        runtime.agents === undefined ? undefined : runtime.agents.get(activation.childId);
      if (target === undefined) {
        diagnostics.push(
          `child ${activation.childId} has no live local Agent handle, so it cannot change its own reasoning effort with \`${SET_EFFORT_TOOL}\`. It runs at ${child.effort === undefined ? "the adapter default" : `"${child.effort}"`} for its whole life.`,
        );
      } else {
        installEffortControl(target, runtime.llm, child.effort);
      }

      started.push({
        childId: activation.childId,
        label: child.label,
        agent: child.agent,
        role: child.role,
        route: child.routeLabel,
        ...(child.effort === undefined ? {} : { effort: child.effort }),
        ...(child.maxDepth === undefined ? {} : { maxDepth: child.maxDepth }),
      });
    } catch (error) {
      if (started.length === 0) {
        throw new DelegationError(
          `starting the ${plan.role === "(none)" ? "child" : `"${plan.role}" child`} "${child.label}" (${child.routeLabel}) failed: ${describeError(error)}`,
        );
      }
      throw new PartialDelegationError(
        `starting entry ${child.index + 1} of ${child.total} for role "${plan.role}" (${child.label}, ${child.routeLabel}) failed: ${describeError(error)}. The ${started.length} already started: ${started
          .map((record) => `${record.childId} (${record.label})`)
          .join(", ")}. Those children are still running and are not rolled back; do not start them again, and use list_agents or send_message to reach them.`,
        started,
      );
    }
  }

  return {
    kind: started.length === 1 ? "activation" : "activations",
    children: started,
    diagnostics,
  };
}

/** Full delegation: plan, validate, start. */
export async function delegate(
  parent: Agent,
  args: DelegationArgs,
  runtime: SubagentRuntime,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
  signal: AbortSignal = new AbortController().signal,
): Promise<DelegationResult> {
  const plan = planDelegation(args, runtime, config);
  return startPlannedChildren(parent, plan, runtime, config, signal);
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  "Delegate self-contained work to one or more fresh child agents.",
  "",
  "Returns the id of every child it started plus the route each one resolved. The children run",
  "in the background: their results arrive later as completion notices in this conversation.",
  "Never wait or poll for them, and keep working on something useful meanwhile.",
  "",
  "`agent` picks the brief: `poteto-agent` (default) injects the poteto subagent preamble and",
  "the absolute path of the poteto-mode instructions; `comment-sicko` injects the comment",
  "reviewer persona and must be briefed read-only; `general` is a plain child with no preamble.",
  "",
  "`role` selects a configured pstack role and therefore the child's model route and reasoning",
  "effort. The role names and the meaning of each are in the pstack role manifest, not here.",
  "Omit `role` to inherit the parent route. Panel roles start one child per configured entry.",
  "",
  "`reasoningEffort` raises or lowers the effort for this delegation alone. The role line is a",
  "starting baseline, not a verdict: start from it, raise it for hard work and lower it for",
  "routine work. The value must be one the target model advertises, and this package does not",
  "assume a ladder, so read the effort list the role's model reports rather than guessing. An",
  "unsupported value fails the call before any child starts, including every entry of a panel.",
  "",
  "A running child can also change its own effort with `set_reasoning_effort`, which applies",
  "from its next step. You do not have to predict the level up front.",
  "",
  "Every prompt is a fresh child that does not see this conversation, so include everything it",
  "needs. A child's own summary is not evidence: review its diff or artifacts yourself.",
].join("\n");

function buildParameters(config: PstackSubagentConfig): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    description: {
      type: "string",
      description: "A short 3-5 word label for the child, shown in list_agents and its notices.",
    },
    prompt: {
      type: "string",
      description:
        "The complete, self-contained brief. The child does not see this conversation, so include the task, every prior directive, and the paths or branches it needs.",
    },
    agent: {
      type: "string",
      enum: [...AGENT_KINDS],
      description:
        'Child brief type: "poteto-agent" (default) for pstack implementation delegates, "comment-sicko" for the read-only comment reviewer, "general" for a plain child with no preamble.',
    },
    role: {
      type: "string",
      description:
        "A pstack role key, matched exactly. It selects the child's model route and effort. Omit it to inherit the parent route.",
    },
    cwd: {
      type: "string",
      description:
        "The child's initial working directory. Relative paths resolve against this session's directory. Omitted inherits it.",
    },
    maxDepth: {
      type: "integer",
      description:
        "How many further delegation levels the child may use; 0 or greater, and negative values are rejected. It can only lower this row's configured cap, never raise it.",
    },
    roleIndex: {
      type: "integer",
      description:
        "Selects one entry of a list-valued role that is not an automatic panel; 0 or greater, and negative values are rejected. Requires `role`.",
    },
    reasoningEffort: {
      type: "string",
      description: [
        "Reasoning effort for every child this call starts, overriding the role line's value for this delegation.",
        "Start from the role's level, raise it for hard work, lower it for routine work.",
        "The value must be one the target model advertises: this package assumes no ladder and rejects an unknown token with that model's real effort list.",
        "It is validated for every panel entry before any child starts, so one incompatible entry fails the whole call instead of half-starting it.",
        "Omit it to use the role line's effort.",
      ].join(" "),
    },
  };

  if (config.allowedAgentPresets.length > 0) {
    properties["agentPreset"] = {
      type: "string",
      enum: [...config.allowedAgentPresets],
      description: "An independent child preset from this row's allowlist.",
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: ["description", "prompt"],
  };
}

export const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: ["activation", "activations"],
      description: "How many children this call started.",
    },
    children: {
      type: "array",
      description: "One record per started child, in start order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          childId: { type: "string", description: "The child session id." },
          label: { type: "string", description: "The label this call gave the child." },
          agent: { type: "string", description: "The child brief type." },
          role: { type: "string", description: "The role key, or `(none)`." },
          route: {
            type: "string",
            description: "`inherit-parent` or `<provider>/<model> [effort]`.",
          },
          effort: {
            type: "string",
            description:
              "The reasoning effort this child runs at, when one applies. Equal to the call's `reasoningEffort` when that was passed.",
          },
          maxDepth: {
            type: "integer",
            description: "The delegation-depth cap the child received.",
          },
        },
        required: ["childId", "label", "agent", "role", "route"],
      },
    },
    diagnostics: {
      type: "array",
      description:
        "Configuration notes, including a panel whose entries share one route. Empty when nothing needs reporting.",
      items: { type: "string" },
    },
  },
  required: ["kind", "children", "diagnostics"],
};

/** Render one delegation result for the model. */
export function renderDelegationResult(result: DelegationResult): string {
  const lines = [
    result.kind === "activation"
      ? `started 1 child: ${result.children[0]?.childId ?? "(none)"}`
      : `started ${result.children.length} children:`,
    ...result.children.map(
      (child) =>
        `- ${child.childId} (${child.label}) agent=${child.agent} role=${child.role} route=${child.route}${child.effort === undefined ? "" : ` effort=${child.effort}`}${child.maxDepth === undefined ? "" : ` maxDepth=${child.maxDepth}`}`,
    ),
    "Results arrive as completion notices; do not poll for them. Each child can change its own",
    "effort from its next step with `set_reasoning_effort`; you do not need to predict it up front.",
  ];
  if (result.diagnostics.length > 0) {
    lines.push(
      "",
      "Diagnostics:",
      ...result.diagnostics.map((diagnostic) => `- ${diagnostic}`),
    );
  }
  return lines.join("\n");
}

/** Build the model-facing tool for one row. */
export function createPstackSubagentTool(
  runtime: SubagentRuntime,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: buildParameters(config),
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [
        { type: "text", text: renderDelegationResult(value as DelegationResult) },
      ],
    },
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec: ToolRunContext) {
      const parent = exec.agent;
      if (parent === undefined) {
        throw new DelegationError(
          "pstack_subagent needs a calling Agent, and exec.agent was undefined. This tool runs inside a conversation; it cannot start a child from a context that has no parent Agent.",
        );
      }
      const args = parseDelegationArgs(rawArgs, config);
      const result = await delegate(parent, args, runtime, config, exec.signal);
      return result;
    },
  };
}

/**
 * The slices of the Cordis context this row uses.
 *
 * `agents` is optional in both directions: it is absent from `inject` and read per
 * call below, so a profile that mounts no agent registry still registers this tool.
 * See the `inject` comment for why a hard dependency is the wrong shape here.
 */
export interface PstackSubagentHost {
  readonly tools: ToolsHost;
  readonly subagents: SubagentsHost;
  readonly llm: LlmHost;
}

/** Build the runtime a real Host call reads. */
export function hostRuntime(
  ctx: PstackSubagentHost,
  getAgentRegistry: () => AgentsHost | undefined = () => undefined,
): SubagentRuntime {
  return {
    subagents: ctx.subagents,
    llm: ctx.llm,
    // Resolved per delegation, not snapshotted: `agents` may mount after this row.
    get agents() {
      return getAgentRegistry();
    },
    dshHome: resolveDshHome(),
    assetsRoot: ASSETS_ROOT,
  };
}

/**
 * Register `pstack_subagent` for this row.
 *
 * @param ctx - context providing the tool registry, the subagent registry, the LLM
 *   adapters, and optionally `ctx.get` for the agent registry.
 * @param config - validated row config.
 */
export function apply(
  ctx: PstackSubagentHost & { get?: (name: string) => AgentsHost | undefined },
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): void {
  const runtime = hostRuntime(ctx, () => ctx.get?.("agents"));
  const tool = createPstackSubagentTool(runtime, config);
  ctx.tools.register(tool);
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const suffix = typeof code === "string" ? ` (${code})` : "";
    return `${error.message}${suffix}`;
  }
  return String(error);
}
