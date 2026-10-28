/**
 * `pstack_subagent`: pstack's delegation entry point.
 *
 * One call plans one or more fresh children, validates every route and effort before the
 * first child starts, then starts them through `ctx.subagents.startActivation` with
 * parent delivery. Results arrive as completion notices; this module never polls.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
  SET_EFFORT_TOOL,
  agentOptionsFor,
  effectiveEffort,
  installEffortControl,
  validateEffortFor,
} from "./internal/effort.ts";
import type {
  Agent,
  AgentOptions,
  AgentsHost,
  JsonSchemaNode,
  LlmHost,
  ReasoningEffortId,
  SubagentCapabilities,
  SubagentsHost,
  TextBlock,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
  WorkingDirectoryHost,
} from "./internal/host-contract.ts";
import {
  modelsFilePath,
  readRoleConfiguration,
  requireRole,
  resolveDshHome,
  selectRoleRoutes,
  type Route,
  type RouteSelection,
} from "./internal/role-config.ts";
import type { RoleSpec } from "./internal/role-manifest.ts";
import { POTETO_MODE_SKILL_PATH, PORT_ROOT } from "./internal/paths.ts";
import { parseFrontmatter } from "./internal/frontmatter.ts";

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack-subagent";

/**
 * Delegation needs the tool registry, the subagent registry, the LLM adapters, and the
 * session directory. `agents` is not here: it is optional and read per call, so a
 * profile without it still delegates and the child simply keeps its starting effort.
 */
export const inject = ["tools", "subagents", "llm", "workingDirectory"];

/** Model-facing tool name. */
export const TOOL_NAME = "pstack_subagent";

/** Backend used when the row does not name one. */
export const DEFAULT_SUBAGENT_PROVIDER = "spawn";

/** The child kinds this tool knows how to brief. */
export const AGENT_KINDS = ["poteto-agent", "comment-sicko", "general"] as const;

export type AgentKind = (typeof AGENT_KINDS)[number];

/** Row configuration. */
export interface PstackSubagentConfig {
  readonly provider: string;
  readonly maxDepth?: number;
}

const DEFAULT_CONFIG: PstackSubagentConfig = { provider: DEFAULT_SUBAGENT_PROVIDER };

/** What a call asked for, after every required argument has been validated. */
export interface DelegationArgs {
  readonly description: string;
  readonly prompt: string;
  readonly agent: AgentKind;
  readonly role: string | null;
  readonly cwd: string | null;
  readonly maxDepth: number;
  readonly roleIndex: number | null;
  readonly reasoningEffort: string | null;
}

/** One child this call started. */
export interface ChildRecord {
  readonly childId: string;
  readonly label: string;
  readonly agent: string;
  readonly role: string;
  readonly route: string;
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
  /** Optional: absent means the child keeps the effort it was started with. */
  readonly agents?: AgentsHost;
  readonly workingDirectory: WorkingDirectoryHost;
  readonly dshHome: string;
  readonly pstackRoot: string;
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

/** Minimal Standard Schema so an omitted `config` is valid and a typo fails at load. */
export const Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-pstack",
    validate(value: unknown): StandardSchemaResult {
      if (value === undefined || value === null) return { value: DEFAULT_CONFIG };
      if (typeof value !== "object" || Array.isArray(value)) return { issues: [{ message: "config must be a mapping" }] };

      const record = value as Record<string, unknown>;
      const issues: StandardSchemaIssue[] = [];
      for (const key of Object.keys(record)) {
        if (key !== "provider" && key !== "maxDepth") issues.push({ message: `unknown field "${key}"`, path: [key] });
      }

      const provider = record["provider"];
      if (provider !== undefined && !isNonEmptyString(provider)) {
        issues.push({ message: "provider must be a non-empty string", path: ["provider"] });
      }
      const maxDepth = record["maxDepth"];
      if (maxDepth !== undefined && !isNonNegativeSafeInteger(maxDepth)) {
        issues.push({ message: "maxDepth must be a non-negative safe integer", path: ["maxDepth"] });
      }
      if (issues.length > 0) return { issues };

      return {
        value: {
          provider: isNonEmptyString(provider) ? provider : DEFAULT_SUBAGENT_PROVIDER,
          ...(isNonNegativeSafeInteger(maxDepth) ? { maxDepth } : {}),
        },
      };
    },
  },
};

// ---------------------------------------------------------------------------
// Preamble and prompt
// ---------------------------------------------------------------------------

/**
 * Read one agent preamble from the package assets. A missing or empty preamble blocks
 * that agent type; it never degrades into a plain child wearing the name.
 */
export function loadAgentPreamble(agent: AgentKind, pstackRoot: string): string | undefined {
  if (agent === "general") return undefined;
  const absolute = join(pstackRoot, "agents", `${agent}.md`);
  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    const detail = typeof code === "string" ? code : String(error);
    throw new PreambleError(
      `the ${agent} preamble cannot be read at ${absolute} (${detail}). Pass agent: "general" for a plain child with no preamble, or reinstall dsh-pstack.`,
    );
  }
  const body = parseFrontmatter(text).body.trim();
  if (body === "") {
    throw new PreambleError(`the ${agent} preamble at ${absolute} is empty. Repair the packaged asset or pass agent: "general".`);
  }
  return body;
}

/** Compose the self-contained prompt one child receives. */
export function composeChildPrompt(input: {
  readonly preamble?: string;
  readonly injectedPaths?: readonly { readonly label: string; readonly path: string }[];
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

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/** Validate every required model-facing argument. Null declines an optional setting. */
export function parseDelegationArgs(raw: unknown): DelegationArgs {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new DelegationError("arguments must be an object");
  const record = raw as Record<string, unknown>;

  const known = ["description", "prompt", "agent", "role", "roleIndex", "reasoningEffort", "cwd", "maxDepth"] as const;
  for (const key of known) {
    if (!Object.hasOwn(record, key)) throw new DelegationError(`missing required argument "${key}"; every argument must be passed explicitly`);
  }
  for (const key of Object.keys(record)) {
    if (!(known as readonly string[]).includes(key)) throw new DelegationError(`unknown argument "${key}"; accepted arguments are ${known.join(", ")}`);
  }

  const description = record["description"];
  if (!isNonEmptyString(description)) throw new DelegationError("description must be a non-empty string: it becomes the child label");
  const prompt = record["prompt"];
  if (!isNonEmptyString(prompt)) throw new DelegationError("prompt must be a non-empty string");

  const agent = record["agent"];
  if (typeof agent !== "string" || !(AGENT_KINDS as readonly string[]).includes(agent)) {
    throw new DelegationError(
      `agent must be one of ${AGENT_KINDS.join(", ")}; choose explicitly, and never pass a DSH agent preset id.`,
    );
  }

  const role = record["role"];
  if (role !== null && !isNonEmptyString(role)) throw new DelegationError("role must be a non-empty string or null");

  const cwd = record["cwd"];
  if (cwd !== null && !isNonEmptyString(cwd)) throw new DelegationError("cwd must be a non-empty string or null");

  const maxDepth = record["maxDepth"];
  if (!isNonNegativeSafeInteger(maxDepth)) throw new DelegationError("maxDepth must be a non-negative safe integer");

  const roleIndex = record["roleIndex"];
  if (roleIndex !== null && !isNonNegativeSafeInteger(roleIndex)) throw new DelegationError("roleIndex must be a non-negative safe integer or null");
  if (roleIndex !== null && role === null) throw new DelegationError("roleIndex requires a non-null role");

  const requestedEffort = record["reasoningEffort"];
  if (requestedEffort !== null && !isNonEmptyString(requestedEffort)) {
    throw new DelegationError("reasoningEffort must be a non-empty string or null");
  }
  if (typeof requestedEffort === "string" && /\s/.test(requestedEffort.trim())) {
    throw new DelegationError(`reasoningEffort ${JSON.stringify(requestedEffort)} contains whitespace. An effort is one token, exactly as the model advertises it.`);
  }

  return {
    description,
    prompt,
    agent: agent as AgentKind,
    role,
    cwd,
    maxDepth,
    roleIndex,
    reasoningEffort: requestedEffort?.trim() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** One planned child, before any Host call. */
export interface ChildPlan {
  readonly index: number;
  readonly total: number;
  readonly label: string;
  readonly agent: AgentKind;
  readonly role: string;
  readonly route: Route;
  readonly routeLabel: string;
  readonly effort?: string;
  readonly agentOptions?: AgentOptions;
  readonly cwd?: string;
  readonly maxDepth?: number;
}

export interface DelegationPlan {
  readonly agent: AgentKind;
  readonly prompt: string;
  readonly provider: string;
  readonly role: string;
  readonly mode: RouteSelection["mode"];
  readonly roleIndex?: number;
  readonly roleTotal: number;
  readonly reasoningEffort?: string;
  readonly children: readonly ChildPlan[];
  readonly diagnostics: readonly string[];
}

/** Route text as reported to the model. */
export function routeLabel(route: Route, effortOverride?: string): string {
  const effort = effectiveEffort(route, effortOverride);
  const base = route.kind === "inherit" ? "inherit-parent" : `${route.provider}/${route.model}`;
  return effort === undefined ? base : `${base} [${effort}]`;
}

/** Take the smallest of the requested depth, this row's cap, and the Host setting. */
export function resolveDelegationDepth(
  configured: number | undefined,
  requested: number | undefined,
  hostLimit: number | undefined,
): number | undefined {
  if (requested !== undefined && !isNonNegativeSafeInteger(requested)) throw new DelegationError("maxDepth must be a non-negative safe integer");
  if (configured !== undefined && requested !== undefined && requested > configured) {
    throw new DelegationError(
      `maxDepth ${requested} exceeds this row's configured cap of ${configured}. Lower the request or raise \`pstack-subagent\` config.maxDepth.`,
    );
  }
  const candidates = [configured, requested, hostLimit].filter((value): value is number => value !== undefined);
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}

/** Resolve the role file, routes, prompt, and depth into one plan. Pure of service calls. */
export function planDelegation(
  args: DelegationArgs,
  runtime: SubagentRuntime,
  config: PstackSubagentConfig = DEFAULT_CONFIG,
): DelegationPlan {
  const preamble = loadAgentPreamble(args.agent, runtime.pstackRoot);

  const rolePath = modelsFilePath(runtime.dshHome);
  const roleFile = readRoleConfiguration(rolePath);
  if (roleFile.status === "unreadable") {
    throw new DelegationError(
      `the pstack role file at ${rolePath} exists but cannot be read (${roleFile.reason}). Fix its permissions or delete it, which makes every role inherit the parent route.`,
    );
  }
  const diagnostics: string[] = [];
  if (roleFile.status === "loaded") {
    for (const issue of roleFile.issues) diagnostics.push(`${rolePath}${issue.line === undefined ? "" : `:${issue.line}`}: ${issue.message}`);
  }

  let selection: RouteSelection | undefined;
  let roleSpec: RoleSpec | undefined;
  if (args.role !== null) {
    roleSpec = requireRole(args.role);
    const entry = roleFile.status === "loaded" ? roleFile.roles.get(roleSpec.key) : undefined;
    selection = selectRoleRoutes(roleSpec, entry, args.roleIndex);
  }

  const routes: readonly Route[] = selection?.routes ?? [{ kind: "inherit" }];
  const roleName = roleSpec?.key ?? "(none)";

  if (selection !== undefined) {
    if (!selection.configured) {
      diagnostics.push(`role "${selection.role.key}" has no line in ${rolePath}, so it inherits the parent route. Add a line to route it explicitly.`);
    }
    if (selection.mode === "selected") {
      diagnostics.push(
        `role "${selection.role.key}" holds ${selection.total} entries and is not an automatic panel; entry ${(selection.roleIndex ?? 0) + 1} was selected. Pass \`roleIndex\` to choose another.`,
      );
    }
    if (selection.role.key === "swarm workers") {
      diagnostics.push(
        'role "swarm workers" is a list, not a panel: its first entry is the default route for every worker, and `roleIndex` gives one race arm another entry. Each worker still needs its own pstack_subagent call.',
      );
    }
  }

  const injected =
    args.agent === "poteto-agent" ? [{ label: "`poteto-mode` SKILL.md", path: POTETO_MODE_SKILL_PATH }] : [];
  const prompt = composeChildPrompt({ ...(preamble === undefined ? {} : { preamble }), injectedPaths: injected, task: args.prompt });

  const depth = resolveDelegationDepth(config.maxDepth, args.maxDepth, undefined);
  const total = routes.length;
  const children: ChildPlan[] = routes.map((route, index) => {
    const agentOptions = agentOptionsFor(route, args.reasoningEffort);
    const effort = effectiveEffort(route, args.reasoningEffort);
    return {
      index,
      total,
      label: total > 1 ? `${args.description} [${roleName} ${index + 1}/${total}]` : args.description,
      agent: args.agent,
      role: roleName,
      route,
      routeLabel: routeLabel(route, args.reasoningEffort),
      ...(effort === undefined ? {} : { effort }),
      ...(agentOptions === undefined ? {} : { agentOptions }),
      ...(args.cwd === null ? {} : { cwd: args.cwd }),
      ...(depth === undefined ? {} : { maxDepth: depth }),
    };
  });

  if (args.reasoningEffort !== null) {
    const overwritten = routes.filter((route) => route.kind === "route" && route.effort !== undefined && route.effort !== args.reasoningEffort);
    if (overwritten.length > 0) {
      diagnostics.push(
        `reasoningEffort "${args.reasoningEffort}" overrides the effort this call's role line names (${overwritten.map((route) => routeLabel(route)).join(", ")}). The role line is a starting level; pass no reasoningEffort to keep it.`,
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
    ...(args.reasoningEffort === null ? {} : { reasoningEffort: args.reasoningEffort }),
    children,
    diagnostics,
  };
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
    diagnostics.push(`panel "${roleName}" has one configured entry, so this call started one child and claims no model diversity. Add entries to ${rolePath} for a real panel.`);
    return;
  }
  const distinct = new Set(children.map((child) => child.routeLabel));
  if (distinct.size > 1) return;
  diagnostics.push(`all ${children.length} entries of panel "${roleName}" resolve to the same route (${[...distinct][0]}), so these children are not a cross-model review.`);
}

// ---------------------------------------------------------------------------
// Host calls
// ---------------------------------------------------------------------------

/** Check the backend can enforce what this call asks for. */
export function assertProviderCapabilities(
  capabilities: SubagentCapabilities,
  providerName: string,
  asks: { readonly agentOptions: boolean; readonly maxDepth: boolean },
): void {
  const missing: string[] = [];
  if (asks.agentOptions && !capabilities.agentOptions) missing.push("agentOptions");
  if (asks.maxDepth && !capabilities.depthLimit) missing.push("maxDepth");
  if (missing.length === 0) return;
  throw new DelegationError(
    `subagent provider "${providerName}" does not support ${missing.join(", ")}. Change the route to \`inherit-parent\`, drop the unsupported argument, or configure a backend that supports it.`,
  );
}

/**
 * Validate every route and effort before anything starts. An inherit-parent entry with
 * no effort carries no agentOptions and is skipped; an override on an inherit route is
 * validated against the parent's live route.
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
      const effort = effortOverride as string;
      try {
        await validateEffortFor(llm, undefined, effort, parent, signal);
      } catch (error) {
        throw new DelegationError(
          `role ${roleName} inherits the parent route, and reasoningEffort "${effort}" failed preflight there: ${describeError(error)} Pass null for reasoningEffort, or name a role whose line holds an exact route.`,
        );
      }
      continue;
    }

    const route = child.route;
    try {
      await llm.resolveCallConfig(
        { provider: route.provider, model: route.model, ...(child.effort === undefined ? {} : { reasoningEffort: child.effort as ReasoningEffortId }) },
        signal,
      );
    } catch (error) {
      throw new DelegationError(
        `role ${roleName} resolves to ${child.routeLabel}, which failed route preflight: ${describeError(error)}. Check the route in ${modelsFilePath("$DSH_HOME")} against the providers this deployment serves.`,
      );
    }
  }
}

/**
 * Resolve and validate one child's `cwd`.
 *
 * A child may run inside the session directory or inside an explicitly separate Git
 * worktree. Anything else is refused: this tool does not create isolation, so it will
 * not promise one.
 */
export function resolveChildCwd(requested: string | undefined, sessionRoot: string): string | undefined {
  if (requested === undefined) return undefined;
  const resolved = isAbsolute(requested) ? resolve(requested) : resolve(sessionRoot, requested);

  let isDirectory = false;
  try {
    isDirectory = statSync(resolved).isDirectory();
  } catch {
    isDirectory = false;
  }
  if (!isDirectory) throw new DelegationError(`cwd ${resolved} does not exist or is not a directory`);

  if (isWithin(sessionRoot, resolved) || isGitWorktree(resolved)) return resolved;
  throw new DelegationError(
    `cwd ${resolved} is outside this session's directory (${sessionRoot}) and is not a separate Git worktree. Pass a path inside the session directory, or create a worktree first and pass its checkout.`,
  );
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isGitWorktree(directory: string): boolean {
  return existsSync(join(directory, ".git"));
}

/**
 * Start the planned children. Everything rejectable has already been rejected; a
 * failure at entry N keeps children 1..N-1 running and reports their ids.
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
      `subagent provider "${plan.provider}" is not registered; registered providers: ${available.length === 0 ? "(none)" : available.join(", ")}.`,
    );
  }

  const hostLimit = runtime.subagents.resolveMaxDepth(config.maxDepth);
  const effectiveDepth = resolveDelegationDepth(config.maxDepth, plan.children[0]?.maxDepth, hostLimit);

  assertProviderCapabilities(provider.capabilities, plan.provider, {
    agentOptions: plan.children.some((child) => child.agentOptions !== undefined),
    maxDepth: effectiveDepth !== undefined,
  });

  const sessionRoot = await runtime.workingDirectory.ensure(parent, signal);
  const children = plan.children.map((child) => ({
    ...child,
    ...(effectiveDepth === undefined ? {} : { maxDepth: effectiveDepth }),
    cwd: resolveChildCwd(child.cwd, sessionRoot),
  }));

  await preflightRoutes(runtime.llm, parent, children, plan.role, plan.reasoningEffort, signal);
  if (runtime.subagents.getProvider(plan.provider) !== provider) {
    throw new DelegationError(`subagent provider "${plan.provider}" changed while the child routes were being resolved; retry the delegation`);
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
          ...(child.agentOptions === undefined ? {} : { agentOptions: child.agentOptions }),
          ...(child.maxDepth === undefined ? {} : { maxDepth: child.maxDepth }),
        },
        signal,
        delivery: "parent",
      });

      // The child can change its own effort from here on. Registration is on the child's
      // own scope, which disposes it with the child, so this call keeps no handle.
      const target = runtime.agents === undefined ? undefined : runtime.agents.get(activation.childId);
      if (target === undefined) {
        diagnostics.push(
          `child ${activation.childId} has no live local Agent handle, so it cannot change its own reasoning effort with \`${SET_EFFORT_TOOL}\`. It runs at ${child.effort === undefined ? "the adapter default" : `"${child.effort}"`} for its whole life.`,
        );
      } else {
        installEffortControl(target, runtime.llm, child.effort as ReasoningEffortId | undefined);
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
          .join(", ")}. Those children are still running and are not rolled back.`,
        started,
      );
    }
  }

  return { kind: started.length === 1 ? "activation" : "activations", children: started, diagnostics };
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
  "Every argument is required. Pass null for role, roleIndex, reasoningEffort, or cwd when that",
  "setting is not used. Choose agent explicitly. maxDepth is a non-negative integer. No argument",
  "has an implicit default.",
  "",
  "Returns the id of every child it started plus the route each one resolved. The children run",
  "in the background: their results arrive later as completion notices in this conversation.",
  "Never wait or poll for them, and keep working on something useful meanwhile.",
  "",
  "`agent` picks the brief: `poteto-agent` injects the poteto subagent preamble and the absolute",
  "path of the poteto-mode instructions; `comment-sicko` injects the comment reviewer persona",
  "and must be briefed read-only; `general` is a plain child with no preamble.",
  "",
  "`role` selects a configured pstack role and therefore the child's model route and reasoning",
  "effort. The role names come from the pstack role manifest, not this schema. Null inherits the",
  "parent route. Automatic panel roles start one child per configured entry.",
  "",
  "`reasoningEffort` raises or lowers the effort for this delegation alone, using a token the",
  "target model advertises. An unsupported value fails the call before any child starts,",
  "including every entry of a panel. Null keeps the role line's starting effort. A running child",
  "can change its own effort with `set_reasoning_effort`, which applies from its next step.",
  "",
  "Every prompt is a fresh child that does not see this conversation, so include everything it",
  "needs. A child's own summary is not evidence: review its diff or artifacts yourself.",
].join("\n");

function buildParameters(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      description: { type: "string", description: "A short 3-5 word label for the child, shown in list_agents and its notices." },
      prompt: {
        type: "string",
        description: "The complete, self-contained brief. The child does not see this conversation, so include the task, every prior directive, and the paths or branches it needs.",
      },
      agent: {
        type: "string",
        enum: [...AGENT_KINDS],
        description: 'Required child brief type: "poteto-agent" for pstack implementation delegates, "comment-sicko" for the read-only comment reviewer, or "general" for a plain child with no preamble.',
      },
      role: {
        type: ["string", "null"],
        description: "Required pstack role key, matched exactly. It selects the child's model route and effort. Null inherits the parent route.",
      },
      cwd: {
        type: ["string", "null"],
        description: "Required initial working directory, inside this session's directory or a separate Git worktree. Relative paths resolve against this session's directory. Null inherits the session directory.",
      },
      maxDepth: { type: "integer", description: "Required non-negative delegation-depth limit. It can only lower this row's configured cap." },
      roleIndex: {
        type: ["integer", "null"],
        description: "Required entry index for a list-valued role that is not an automatic panel, 0 or greater. Requires a non-null role. Null selects the first entry.",
      },
      reasoningEffort: {
        type: ["string", "null"],
        description: "Required reasoning-effort override for every child this call starts. Use one token the target model advertises, or null to keep the role line's starting effort. An unknown token fails the whole call before any child starts.",
      },
    },
    required: ["description", "prompt", "agent", "role", "roleIndex", "reasoningEffort", "cwd", "maxDepth"],
  };
}

const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["activation", "activations"], description: "How many children this call started." },
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
          route: { type: "string", description: "`inherit-parent` or `<provider>/<model> [effort]`." },
          effort: { type: "string", description: "The reasoning effort this child runs at, when one applies." },
          maxDepth: { type: "integer", description: "The delegation-depth cap the child received." },
        },
        required: ["childId", "label", "agent", "role", "route"],
      },
    },
    diagnostics: { type: "array", description: "Configuration notes, including a panel whose entries share one route.", items: { type: "string" } },
  },
  required: ["kind", "children", "diagnostics"],
};

/** Render one delegation result for the model. */
export function renderDelegationResult(result: DelegationResult): string {
  const lines = [
    result.kind === "activation" ? `started 1 child: ${result.children[0]?.childId ?? "(none)"}` : `started ${result.children.length} children:`,
    ...result.children.map(
      (child) =>
        `- ${child.childId} (${child.label}) agent=${child.agent} role=${child.role} route=${child.route}${child.effort === undefined ? "" : ` effort=${child.effort}`}${child.maxDepth === undefined ? "" : ` maxDepth=${child.maxDepth}`}`,
    ),
    "Results arrive as completion notices; do not poll for them. Each child can change its own",
    "effort from its next step with `set_reasoning_effort`.",
  ];
  if (result.diagnostics.length > 0) lines.push("", "Diagnostics:", ...result.diagnostics.map((diagnostic) => `- ${diagnostic}`));
  return lines.join("\n");
}

/** Build the model-facing tool for one row. */
export function createPstackSubagentTool(runtime: SubagentRuntime, config: PstackSubagentConfig = DEFAULT_CONFIG): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: buildParameters(),
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderDelegationResult(value as unknown as DelegationResult) }],
    },
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec: ToolRunContext) {
      const parent = exec.agent;
      if (parent === undefined) {
        throw new DelegationError("pstack_subagent needs a calling Agent, and exec.agent was undefined.");
      }
      const args = parseDelegationArgs(rawArgs);
      return await delegate(parent, args, runtime, config, exec.signal);
    },
  };
}

/** The slices of the Cordis context this row uses. */
export interface PstackSubagentHost {
  readonly tools: ToolsHost;
  readonly subagents: SubagentsHost;
  readonly llm: LlmHost;
  readonly workingDirectory: WorkingDirectoryHost;
}

/** Build the runtime a real Host call reads. */
export function hostRuntime(ctx: PstackSubagentHost, getAgentRegistry: () => AgentsHost | undefined = () => undefined): SubagentRuntime {
  return {
    subagents: ctx.subagents,
    llm: ctx.llm,
    workingDirectory: ctx.workingDirectory,
    get agents() {
      return getAgentRegistry();
    },
    dshHome: resolveDshHome(),
    pstackRoot: PORT_ROOT,
  };
}

/** Register `pstack_subagent` for this row. */
export function apply(ctx: PstackSubagentHost & { get?: (name: string) => AgentsHost | undefined }, config: PstackSubagentConfig = DEFAULT_CONFIG): void {
  const runtime = hostRuntime(ctx, () => ctx.get?.("agents"));
  ctx.tools.register(createPstackSubagentTool(runtime, config));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const suffix = typeof code === "string" ? ` (${code})` : "";
    return `${error.message}${suffix}`;
  }
  return String(error);
}
