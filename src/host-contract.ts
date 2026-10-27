/**
 * Structural copies of the `@deepseek-ai/*` 0.2.1-rc.3 declarations this plugin
 * binds to.
 *
 * Runtime modules import nothing from the host packages. A profile install of a
 * workspace directory is a link into this checkout, and the profile's
 * `pnpm-workspace.yaml` sets `autoInstallPeers: false`, so a runtime import of a
 * host package resolves nothing. Restating the contract here keeps that promise
 * and keeps `pnpm typecheck` independent of a machine-local DSH install.
 *
 * This is the only file that restates a host contract for delegation. When DSH
 * changes, re-inspect and update here, then run the delegation tests and the real
 * profile acceptance. Do not grow a second copy in another module.
 *
 * Contract sources (Host Inspect, 0.2.1-rc.3):
 * - `Service.listService({ service: "subagents" })`
 * - `Service.listService({ service: "llm" })`
 * - `Service.listService({ service: "tools" })`
 * - `Service.listService({ service: "agents" })` — `Agent`, `AgentsHost`,
 *   `AgentScope`, and the `agent/request` waterfall below
 * - `Service.listService({ service: "sessionQuery" })`
 *
 * `Agent` is deliberately not minimal. Its `options`, `session.requestHeader()`,
 * and `ctx` are the three seams a child-scoped reasoning-effort control needs, and
 * an `Agent` that stops at `{ id }` cannot express the capability at all. The cost
 * of the wider copy is that every test now has to build a fuller fake; the cost of
 * the narrower one was a documented capability with nowhere to live.
 *
 * Deliberate simplifications, none observable at runtime:
 * - Branded ids (`SessionId`, `MessageId`, `ReasoningEffortId`,
 *   `SessionSeq`, `SessionPersistenceRevision`) are plain `string`/`number`;
 *   the brand is erased and only carried for documentation.
 * - `ContentBlock` names the text variant this plugin emits and leaves the other
 *   variants opaque, because the prompt this tool builds is text only.
 * - `SessionEvent.data` stays `unknown`. Restricted history forwards raw event
 *   payloads unchanged, so naming every event variant here would be a second,
 *   drifting copy of the log format with no reader.
 */

// ---------------------------------------------------------------------------
// agents
// ---------------------------------------------------------------------------

/**
 * The request header in force after the log's last header event.
 *
 * Only `config` is named, because only `config` is read. `config` is the call
 * configuration the machine would use, i.e. the live route after a model switch,
 * where `Agent.options` describes the creation-time route instead.
 */
export interface RequestEpochHeader {
  readonly config: LlmCallConfig;
}

/** The slice of `Agent.session` used to resolve a live route. */
export interface AgentSession {
  /** The header in force after the log's last header event; undefined before the first request. */
  requestHeader(): RequestEpochHeader | undefined;
}

/** One `agent/request` waterfall listener. */
export type AgentRequestListener = (
  payload: { readonly agent: Agent; readonly turn: number; readonly step: number },
  next: () => Promise<LlmCallConfig>,
) => Promise<LlmCallConfig>;

/**
 * The slice of an agent-scoped context a child-scoped contribution needs.
 *
 * Everything registered here is agent-local: it unwinds on disposal and rejects
 * registration afterward. That is what makes one child's reasoning-effort control
 * invisible to its siblings, and why two concurrent delegations cannot affect each
 * other.
 */
export interface AgentScope {
  /**
   * Contribute to the agent-scoped `agent/request` waterfall.
   *
   * Dispatch is scope-filtered, so a listener registered on this child's own
   * context receives only that child's requests. `next()` yields the configuration
   * the machine would use (agent options on the first request, the logged header
   * afterwards); returning a replacement switches it. A request already in flight
   * is never rewritten.
   *
   * @returns the disposer, which unwinds with the scope.
   */
  on(event: "agent/request", listener: AgentRequestListener): () => void;
  /** The tool registry, scoped to this agent. */
  readonly tools: ToolsHost;
}

/** The live Agent the tool executes under. */
export interface Agent {
  readonly id: string;
  /** The provider route and model this agent's requests use at creation time. */
  readonly options: AgentOptions;
  /** The live session this agent drives. */
  readonly session: AgentSession;
  /** Agent-scoped context; contributions are agent-local and unwind on disposal. */
  readonly ctx: AgentScope;
}

/**
 * The slice of `ctx.agents` this tool uses to reach a child it has just started.
 *
 * `startActivation` returns the child id and not the child handle, and this tool
 * needs the handle to contribute to the child's own scope.
 */
export interface AgentsHost {
  /** The live agent with this shared agent/session id, or undefined when none is live. */
  get(id: string): Agent | undefined;
}

/** Adapter-owned child model controls. Omitted fields inherit the parent route. */
export interface AgentOptions {
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// llm
// ---------------------------------------------------------------------------

/** One provider/model route plus optional request controls. */
export interface LlmCallConfig {
  provider: string;
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

export interface LlmProviderInfo {
  readonly id: string;
  readonly name: string;
}

export interface LlmReasoningEffortInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface LlmModelReasoningInfo {
  readonly efforts: readonly LlmReasoningEffortInfo[];
  readonly defaultEffort?: string;
}

export interface LlmModelContext {
  readonly contextWindow: number;
}

/** Detached metadata for one exact route, as the owning adapter reports it. */
export interface LlmResolvedModelInfo {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly context?: LlmModelContext;
  readonly reasoning?: LlmModelReasoningInfo;
}

/** The slice of `ctx.llm` used to validate a child route before starting it. */
export interface LlmHost {
  listProviders(): readonly LlmProviderInfo[];
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
  /**
   * Validate a call config against the exact model capability and materialize
   * adapter defaults. An unsupported explicit effort rejects before any provider
   * I/O; nothing is clamped or aliased.
   */
  resolveCallConfig(config: LlmCallConfig, signal?: AbortSignal): Promise<LlmCallConfig>;
}

// ---------------------------------------------------------------------------
// subagents
// ---------------------------------------------------------------------------

/** A text content block, the only prompt variant this tool sends. */
export interface TextBlock {
  readonly type: "text";
  readonly text: string;
}

/** Prompt content; the non-text variants stay opaque here. */
export type ContentBlock = TextBlock | { readonly type: string; readonly [field: string]: unknown };

/** What one registered backend can enforce, checked before a child starts. */
export interface SubagentCapabilities {
  readonly agentOptions: boolean;
  readonly agentPreset: boolean;
  readonly outputSchema: boolean;
  readonly depthLimit: boolean;
}

/** The registered backend behind a provider name. */
export interface SubagentProvider {
  readonly name: string;
  readonly capabilities: SubagentCapabilities;
  readonly inheritsParentContext: boolean;
  readonly agentRouteDefaults?: Readonly<{ provider: string; model: string }>;
}

/** One child start request, after the activation wrapper supplies label and signal. */
export interface SubagentStartRequest {
  readonly cwd?: string;
  readonly agentPreset?: string;
  readonly label?: string;
  readonly prompt: ContentBlock[];
  readonly parent: Agent;
  readonly signal: AbortSignal;
  readonly agentOptions?: AgentOptions;
  readonly outputSchema?: unknown;
  readonly maxDepth?: number;
}

export interface SubagentActivationSpec {
  readonly provider: string;
  readonly label: string;
  readonly childId?: string;
  readonly request: Omit<SubagentStartRequest, "label" | "signal">;
  readonly signal: AbortSignal;
  readonly delivery: "parent" | "caller";
}

export interface SubagentActivation {
  readonly childId: string;
  readonly messageId?: string;
}

/** The slice of `ctx.subagents` this tool drives. */
export interface SubagentsHost {
  /** Registered provider names in insertion order. */
  list(): string[];
  getProvider(name: string): SubagentProvider | undefined;
  /**
   * Resolve this tool's depth policy. A numeric `configured` is returned as-is and
   * an omitted one reads the Host setting, so the caller owns taking the minimum
   * against its own cap.
   */
  resolveMaxDepth(configured?: number | "provider-managed"): number | undefined;
  startActivation(spec: SubagentActivationSpec): Promise<SubagentActivation>;
}

/**
 * One durable direct-child catalog row.
 *
 * `mode` is the authorization discriminator: only `continuable` children are
 * reviewable. `one-shot` children cannot be resumed, `external` children live in
 * another backend, and `unknown` modes carry no review guarantee.
 */
export type SubagentCatalogEntry = { readonly id: string; readonly createdAt: number } & (
  | { readonly mode: "one-shot"; readonly label?: string }
  | { readonly mode: "external"; readonly label?: string }
  | { readonly mode: "continuable"; readonly label: string }
  | { readonly mode: "unknown"; readonly label?: string }
);

/**
 * The slice of `ctx.subagents` restricted history reads for authorization.
 *
 * `listChildren` takes a parent session id, not a caller identity, so its result
 * is a naming source and never an authorization boundary on its own. Restricted
 * history pairs it with the observed `header.parentSession`.
 */
export interface SubagentCatalogHost {
  listChildren(
    parentSessionId: string,
    signal?: AbortSignal,
  ): Promise<readonly SubagentCatalogEntry[]>;
}

// ---------------------------------------------------------------------------
// sessionQuery
// ---------------------------------------------------------------------------

/** The last committed log position, or `-1` when the log is empty. */
export type SessionSeqCursor = number;

/**
 * One raw log event.
 *
 * Only the envelope is named. `data` is forwarded unchanged so an auditor reads
 * the log rather than a projection: this is the reason the tool never returns
 * `deriveMessages()` output in its place.
 */
export interface SessionEvent {
  readonly type: string;
  readonly seq: number;
  readonly time: number;
  readonly data: unknown;
  readonly ignorable?: true;
  readonly surfaceOp?:
    | "append"
    | { readonly op: "replace"; readonly startSeq: number; readonly endSeq: number };
  readonly sourceEventSeqs?: readonly number[];
}

/** Immutable per-session identity plus its durable delegation position. */
export interface SessionHeader {
  readonly version: number;
  readonly id: string;
  readonly createdAt: number;
  readonly cwd?: string;
  readonly parentSession?: string;
  readonly isSeeded: boolean;
  readonly origin?: "subagent";
  readonly delegationDepth?: number;
  readonly agentPreset?: string;
}

/**
 * One caller-owned observation lease.
 *
 * A `live` lease fixes the log position when it is built, so `events` never
 * grows after construction. A `prepared` lease is a detached copy read from
 * persistence; rc.3 appends synthetic interrupted-turn closers to it and marks
 * neither them nor the persisted boundary. `revision` is present only for
 * `prepared`. Both shapes must be released with `[Symbol.dispose]()`.
 */
export interface SessionObservation {
  readonly source: "live" | "prepared";
  readonly header: SessionHeader;
  readonly inheritedEventCount: number;
  readonly events: readonly SessionEvent[];
  /** Last seq this snapshot covers; `-1` when the log was empty. */
  readonly cursor: SessionSeqCursor;
  /** Persistence revision of a prepared snapshot. Live snapshots omit it. */
  readonly revision?: string;
  retain(): SessionObservation;
  [Symbol.dispose](): void;
}

export interface SessionObservationOptions {
  readonly signal?: AbortSignal;
  readonly projectionMode?: "all" | "none";
}

export interface SessionRecord {
  readonly header: SessionHeader;
  readonly live: boolean;
  readonly persisted: boolean;
  readonly formatStatus?: "current" | "migration-required";
}

/** Provider-independent session metadata predicate, ANDed with its siblings. */
export type SessionResultFilter =
  | { readonly kind: "id"; readonly values: readonly string[] }
  | { readonly kind: "cwd"; readonly values: readonly (string | null)[] }
  | { readonly kind: "created-at"; readonly from?: number; readonly to?: number }
  | { readonly kind: "parent"; readonly values: readonly (string | null)[] }
  | { readonly kind: "availability"; readonly values: readonly ("live" | "persisted")[] };

/**
 * The slice of `ctx.sessionQuery` restricted history reads.
 *
 * `observeSession` is the only raw-event reader used: `listEvents` returns a
 * summary and `readSession` re-reads a detached copy, so neither can page one
 * fixed snapshot. `filterSessions` answers the caller's workspace without
 * materializing its log.
 */
export interface SessionQueryHost {
  observeSession(sessionId: string, options?: SessionObservationOptions): Promise<SessionObservation>;
  filterSessions(
    filters: readonly SessionResultFilter[],
    signal?: AbortSignal,
  ): Promise<readonly SessionRecord[]>;
}

// ---------------------------------------------------------------------------
// tools
// ---------------------------------------------------------------------------

export type JsonSchemaType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null";

/**
 * The JSON Schema subset the Host actually enforces.
 *
 * Exactly `type`/`oneOf`/`properties`/`required`/`additionalProperties`/`items`/
 * `enum`/`const` plus the annotation keys. Nothing else is accepted by
 * `assertSupportedJsonSchema`, and the subset is deliberately narrow here too:
 * `minimum` used to be listed, three tools declared numeric bounds with it, and the
 * Host rejected the whole schema — so `jsonSchemaToTs` and `jsonSchemaToPy` fell back
 * to `"unknown"` and the declared bounds were never enforced. Omitting it from this
 * type makes the same mistake a compile error. Bounds live in each tool's own
 * argument validation and in its `description`.
 */
export interface JsonSchemaNode {
  type?: JsonSchemaType;
  oneOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
  enum?: readonly (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  description?: string;
  title?: string;
  default?: unknown;
}

/** How one tool's result is projected for the model. */
export interface ToolOutputDefinition {
  readonly schema: JsonSchemaNode;
  render(args: unknown, value: unknown): ContentBlock[];
}

/** The typed same-process call input the registry supplies to `execute`. */
export interface ToolExecutionInput {
  readonly name: string;
  /** Corpus id of this exact call, as written to the `tool/call` event. */
  readonly callId: string;
  readonly arguments: unknown;
  readonly agent?: Agent;
  readonly signal: AbortSignal;
}

/** `exec` inside a tool body. */
export interface ToolRunContext extends ToolExecutionInput {
  deferContext(context: unknown): void;
  concludeTurn(): void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  readonly output: ToolOutputDefinition;
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>;
  isConcurrencySafe?(args: unknown): boolean;
  /**
   * Cooperative tool-call timeout budget in milliseconds; omitted means no deadline.
   *
   * Enforced by `@deepseek-ai/dsh-tool-call-timeout-policy`, which wraps
   * `tools/execute`: it replaces `exec.signal` with a deadline-combined signal for the
   * duration of the call, and converts the outcome to a timeout when its own timer won.
   *
   * The budget covers **only the tool call**, not work the call starts. The wrapper
   * disposes its timer as soon as `execute` settles, so a background job started by the
   * call keeps running past the budget — the deadline cannot be used to bound a long
   * task, and it does not break one either.
   *
   * Never sent to the model: `schemas()` whitelists name/description/parameters only.
   *
   * Declaring it asserts that the tool forwards `exec.signal` into an implementation
   * that can reach quiescence when that signal aborts. `pstack_script` does: the
   * foreground run hands the signal to `spawn`, so an abort kills the child.
   *
   * Source: `dsh-tools/lib/types/index.d.ts` (`ToolDefinition.timeoutMs`) in the
   * installed 0.2.1-rc.3 tree; the npm copy of that file is byte-identical.
   */
  timeoutMs?: number;
}

/** The slice of `ctx.tools` this tool needs. */
export interface ToolsHost {
  register(definition: ToolDefinition): () => void;
}

// ---------------------------------------------------------------------------
// workingDirectory
// ---------------------------------------------------------------------------

/**
 * The slice of `ctx.workingDirectory` a script run needs.
 *
 * `ensure` is the same seam `dsh-tool-bash` uses before it spawns anything
 * (`dsh-tool-bash/lib/index.js:663`): it returns the Session's current directory,
 * creating or restoring it as the Host requires. Reading `process.cwd()` instead
 * would run the script in the Host process's directory — wrong for every Session
 * whose workspace is a checkout or a worktree.
 */
export interface WorkingDirectoryHost {
  /** The Session's current directory, validated/created as the Host requires. */
  ensure(agent: Agent, signal?: AbortSignal): Promise<string>;
}

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

/**
 * A registry-issued job id, branded by the Host.
 *
 * Kept as a plain `string` here, like the other branded ids in this file: the brand
 * is erased and only documents that the value is opaque and must not be parsed.
 */
export type JobId = string;

/**
 * A session id, branded by the Host.
 *
 * Plain `string` for the same reason. A job's `owner` is a session id, so the jobs
 * slice below reuses the name rather than introducing a second spelling.
 */
export type SessionId = string;

/** The tool call a job was started for. */
export interface JobToolCall {
  readonly callId: string;
  readonly rootCallId: string;
}

/** One job's lifecycle state. */
export type JobStatus = "running" | "stopping" | "completed" | "killed" | "failed";

/** One output channel a producer may append to. */
export type JobChannel = "stdout" | "stderr" | "log";

/** A live handle on a started job. */
export interface JobHandle {
  readonly id: JobId;
  append(text: string, options?: { readonly channel?: JobChannel }): void;
  updateProgress(line: string): void;
}

/** What a producer returns so the registry can cancel it and await its outcome. */
export interface JobHooks {
  cancel(reason?: string): void;
  readonly done: Promise<JobOutcome>;
}

/** How a job ended, as its producer reports it. */
export interface JobOutcome {
  readonly status: "completed" | "killed" | "failed";
  readonly detail?: string;
  readonly result?: string;
}

/** The spec handed to `jobs.start`. */
export interface JobSpec {
  readonly kind: "bash";
  readonly label: string;
  readonly owner?: SessionId;
  readonly toolCall?: JobToolCall;
  readonly outputLimitBytes?: number;
  readonly run: (job: JobHandle) => JobHooks;
}

/** A fresh projection of one job. */
export interface JobView {
  readonly id: JobId;
  readonly kind: string;
  readonly label: string;
  readonly owner?: SessionId;
  readonly status: JobStatus;
  readonly progress?: string;
  readonly detail?: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly output: {
    readonly total: number;
    readonly earliest: number;
    readonly spillPaths?: readonly string[];
  };
}

/**
 * The slice of `ctx.jobs` a background script run needs.
 *
 * `jobs` is optional in the composition: a profile without a job controller still
 * gets `pstack_script`, and a `background: true` call is then refused with a reason
 * instead of hanging. That is why the access the row uses is `ctx.get("jobs")` —
 * rc.3's optional-service form — and not `ctx.jobs`.
 *
 * Only `start` and `get` are named. `pstack_script` starts one job and reports its
 * id; reading output, waiting, and killing stay with the Host's own job tools, which
 * already own the model cursor and authorization checks.
 */
export interface JobsHost {
  start(spec: JobSpec): JobId;
  get(id: JobId, caller?: SessionId): JobView;
}

// ---------------------------------------------------------------------------
// system prompt
// ---------------------------------------------------------------------------

/**
 * One dynamic context contribution, as registered by `SystemPrompt.context`.
 *
 * Names and orders are strings and numbers so this copy does not depend on the
 * host's `PromptContextOrderName` union: a name the host does not know is not an
 * error here, the registry simply keeps its own ordering for it.
 */
export interface PromptContextContribution {
  readonly name: string;
  readonly order: number;
  readonly text: string | ((context: PromptAssembleContext) => string);
  readonly required?: boolean;
}

/** The per-assembly context the host passes to a context provider. */
export interface PromptAssembleContext {
  readonly signal?: AbortSignal;
}

/**
 * The slice of `ctx.systemPrompt` this plugin registers against.
 *
 * Upstream's plays assume a per-agent store path the host states in the system
 * prompt. This host has no store, but it does expose dynamic context that is
 * materialized as a durable user-role snapshot, which is the closest thing to
 * "the model is told where its working files go without being asked". Only
 * `context` is named: this plugin contributes one line of placement guidance and
 * never assembles or rewrites the prompt itself.
 */
export interface SystemPromptHost {
  context(context: PromptContextContribution): () => void;
}
