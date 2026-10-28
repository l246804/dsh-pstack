/**
 * The slices of the DSH 0.2.1-rc.3 host this plugin binds to.
 *
 * Every import below is `import type`, which `verbatimModuleSyntax` erases at build
 * time, so the bundle carries no runtime import of `@deepseek-ai/*`. That is what keeps
 * a linked workspace install working: the profile links this checkout and resolves no
 * peer dependency at runtime.
 *
 * Each service is a real class with private state, so a fake cannot satisfy it. The
 * `*Host` aliases are `Pick<>` slices of the published class, which keeps the exact
 * host signature for the methods used while leaving private state out of scope.
 */

import type { Agent, AgentOptions, AgentRegistry } from "@deepseek-ai/dsh-agent";
import type { JobId, JobRegistry, JobSpec, JobView } from "@deepseek-ai/dsh-jobs";
import type {
  ContentBlock,
  LlmCallConfig,
  LlmModelInfo,
  LlmModelReasoningInfo,
  LlmProviderInfo,
  LlmReasoningEffortInfo,
  LlmResolvedModelInfo,
  LlmRuntime,
  ReasoningEffortId,
  TextBlock,
} from "@deepseek-ai/dsh-llm";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type {
  SkillCandidate,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
  SkillProviderObservation,
  SkillResourceBase,
  SkillSource,
  SkillSummary,
} from "@deepseek-ai/dsh-skill";
import type {
  SubagentActivation,
  SubagentActivationSpec,
  SubagentCapabilities,
  SubagentProvider,
  SubagentRuntime,
  SubagentStartRequest,
} from "@deepseek-ai/dsh-subagent";
import type { PromptContext, SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import type {
  JsonSchemaNode,
  ToolDefinition,
  ToolOutputDefinition,
  ToolRunContext,
  ToolRuntime,
} from "@deepseek-ai/dsh-tools";
import type { WorkingDirectoryService } from "@deepseek-ai/dsh-working-directory";

export type { Agent, AgentOptions };

/** The slice of `ctx.agents` used to reach a child this tool has just started. */
export type AgentsHost = Pick<AgentRegistry, "get">;

export type {
  ContentBlock,
  LlmCallConfig,
  LlmModelInfo,
  LlmModelReasoningInfo,
  LlmProviderInfo,
  LlmReasoningEffortInfo,
  LlmResolvedModelInfo,
  ReasoningEffortId,
  TextBlock,
};

/** The slice of `ctx.llm` used to resolve routes and advertised efforts. */
export type LlmHost = Pick<
  LlmRuntime,
  "listProviders" | "listModels" | "resolveModelInfo" | "resolveCallConfig"
>;

export type {
  JobId,
  JobSpec,
  JobView,
  SessionId,
  SubagentActivation,
  SubagentActivationSpec,
  SubagentCapabilities,
  SubagentProvider,
  SubagentStartRequest,
};

/** The slice of `ctx.subagents` this plugin drives. */
export type SubagentsHost = Pick<
  SubagentRuntime,
  "list" | "getProvider" | "resolveMaxDepth" | "startActivation"
>;

export type {
  JsonSchemaNode,
  ToolDefinition,
  ToolOutputDefinition,
  ToolRunContext,
};

/** The slice of `ctx.tools` this plugin registers against. */
export type ToolsHost = Pick<ToolRuntime, "register" | "get" | "schemas">;

/** The slice of `ctx.jobs` a background script run needs. */
export type JobsHost = Pick<JobRegistry, "start" | "get">;

/** The slice of `ctx.workingDirectory` a run needs to find the session directory. */
export type WorkingDirectoryHost = Pick<WorkingDirectoryService, "ensure">;

/** The slice of `ctx.systemPrompt` this plugin registers against. */
export type SystemPromptHost = Pick<SystemPrompt, "context">;

export type { PromptContext };

export type {
  SkillCandidate,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillLookupOptions,
  SkillProvider,
  SkillProviderControl,
  SkillProviderObservation,
  SkillResourceBase,
  SkillSource,
  SkillSummary,
};
