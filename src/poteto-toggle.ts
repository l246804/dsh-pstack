/** Session-scoped poteto-workflow switch. */

import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-agent-team";
import type { AgentPresetRegistry } from "@deepseek-ai/dsh-agent-preset-registry";
import type { ConfigEditor } from "@deepseek-ai/dsh-config-editor";
import type { SessionId } from "@deepseek-ai/dsh-session";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-agent-instructions";
import { renderSkillContent } from "@deepseek-ai/dsh-skill";
import type { Domain } from "@deepseek-ai/dsh-storage-domain";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-typert-registry";

import {
  potetoSupportsPreset,
  resolvePotetoEnabled,
  shouldSeedPotetoDefault,
} from "./poteto/preset-gate.ts";
import { createPotetoProjectionDefinition } from "./poteto/projection.ts";
import {
  potetoDomainSpec,
  readPotetoMode,
  writePotetoMode,
  type PotetoModeTable,
} from "./poteto/storage.ts";
import { POTETO_SERVICE } from "./poteto/remote.ts";
import { readSettings, writeSettings } from "./poteto/settings.ts";

export const name = "pstack-poteto-toggle";

const SECTION_NAME = "pstack:poteto-workflow";
const SECTION_ORDER = 10;
const AGENT_TEAM_ENTRY = "@deepseek-ai/dsh-agent-team";
const REMINDER =
  "Poteto workflow is active. Follow the poteto-mode skill in the system prompt strictly. Do not skip any required step or rule it names.";
/** Native delegation tools pstack replaces while the poteto workflow runs. */
const NATIVE_DELEGATION_TOOLS = ["subagent", "subagent_fork"] as const;

function writeDefaultEnabled(enabled: boolean): void {
  writeSettings({ version: 1, potetoDefault: enabled });
}

/** Toggle poteto workflow for one Session. */
export class PotetoModeService extends TypertRemoteService {
  static inject = [
    "agents",
    "skills",
    "sessions",
    "sessionProjections",
    "storageDomain",
    "systemPrompt",
    "typert",
  ];

  private readonly lastUserMessage = new WeakMap<Agent, string>();
  private readonly lifts = new WeakMap<Agent, Array<() => void>>();
  private readonly appliedTools = new WeakMap<Agent, Set<string>>();
  private readonly restricting = new WeakSet<Agent>();
  private readonly seededDefaults = new WeakSet<Agent>();
  private defaultEnabled = false;
  private sectionText = "";
  private domain!: Domain<typeof potetoDomainSpec>;
  private modeTable!: PotetoModeTable;

  constructor(ctx: Context) {
    super(ctx, POTETO_SERVICE);
  }

  protected async [Service.init](): Promise<void> {
    const settings = readSettings();
    this.defaultEnabled = settings.potetoDefault;
    this.domain = await this.ctx.storageDomain.open(potetoDomainSpec);
    this.modeTable = this.domain.table("poteto_modes");
    this.ctx.effect(() => () => this.domain.close(), "pstack.poteto-toggle.domain");
    await this.ctx.sessionProjections.register(
      createPotetoProjectionDefinition((sessionId) => readPotetoMode(this.modeTable, sessionId)),
    );
    const skill = await this.ctx.skills.get("poteto-mode", {});
    if (skill === undefined) throw new Error("poteto-mode skill is not available");
    this.sectionText = [
      "Poteto workflow is enabled for this session. Strictly follow the poteto-mode skill below for every user request. Do not skip any required step or rule it names.",
      "",
      renderSkillContent(skill),
    ].join("\n");

    this.ctx.effect(
      () =>
        this.ctx.systemPrompt.section({
          name: SECTION_NAME,
          order: SECTION_ORDER,
          interpolate: false,
          text: ({ agent }) =>
            agent !== undefined && this.isEnabledFor(agent) ? this.sectionText : "",
        }),
      "pstack.poteto-toggle.section()",
    );

    this.ctx.effect(
      () =>
        this.ctx.on("agent/created", async ({ agent }) => {
          if (agent.session.header.origin === "subagent") return undefined;
          await this.seedDefaultMode(agent);
          if (this.isEnabledFor(agent)) this.ensureNativeToolsRestricted(agent);
          return undefined;
        }),
      "pstack.poteto-toggle.agent-created",
    );

    this.ctx.effect(
      () =>
        this.ctx.on(
          "agent/pre-step",
          async ({ agent, messages }, next) => {
            const decision = await next();
            if (decision.kind === "reject") return decision;
            if (!this.isEnabledFor(agent)) return decision;
            this.ensureNativeToolsRestricted(agent);
            const users = messages.filter((message) => message.source.kind === "user");
            const latest = users[users.length - 1];
            if (latest === undefined) return decision;
            if (this.lastUserMessage.get(agent) === latest.id) return decision;
            this.lastUserMessage.set(agent, latest.id);
            const injection = createUserMessage({
              content: [{ type: "text", text: REMINDER }],
              source: { kind: "agent-instructions", form: "instructions", changes: [] },
            });
            return { ...decision, messages: [...decision.messages, injection] };
          },
          { prepend: true },
        ),
      "pstack.poteto-toggle.pre-step",
    );

    this.ctx.effect(
      () =>
        this.ctx.on("tools/change", () => {
          this.reconcileNativeTools();
        }),
      "pstack.poteto-toggle.tools-change",
    );

    // Agents created before this service finished initializing missed agent/created; catch them up.
    this.reconcileNativeTools();
  }

  /** Whether poteto workflow is on for one exact Agent scope. */
  isEnabledFor(agent: Agent): boolean {
    return resolvePotetoEnabled({
      agentPreset: this.presetOf(agent),
      selected: readPotetoMode(this.modeTable, agent.session.id),
      byDefault: this.defaultEnabled,
    });
  }

  /** The preset this Session runs under, reading the durable log record before the creation header. */
  private presetOf(agent: Agent): string | undefined {
    const registry = this.ctx.get("agentPresets") as AgentPresetRegistry | undefined;
    return registry?.presetForSession(agent.session) ?? agent.session.header.agentPreset;
  }

  /** Read the saved switch for one Session id. */
  status(sessionId: string): { enabled: boolean } {
    const agent = this.ctx.agents.get(sessionId as SessionId);
    const selected = readPotetoMode(this.modeTable, sessionId);
    return {
      enabled: agent === undefined ? (selected ?? this.defaultEnabled) : this.isEnabledFor(agent),
    };
  }

  /** Read the global default used by new sessions. */
  getDefault(): { enabled: boolean } {
    return { enabled: this.defaultEnabled };
  }

  /** Save the global default used by new sessions. */
  setDefault(enabled: boolean, signal?: AbortSignal): { enabled: boolean } {
    signal?.throwIfAborted();
    writeDefaultEnabled(enabled);
    this.defaultEnabled = enabled;
    return { enabled };
  }

  /** Read the Agent Teams default used by new sessions. */
  getAgentTeamDefault(): { enabled: boolean } {
    const config = this.agentTeamConfig();
    return { enabled: config?.current["defaultEnabled"] === true };
  }

  /** Save the Agent Teams default used by new sessions. */
  async setAgentTeamDefault(enabled: boolean, signal?: AbortSignal): Promise<{ enabled: boolean }> {
    signal?.throwIfAborted();
    const config = this.agentTeamConfig();
    if (config === undefined) throw new Error("Agent Teams configuration is not available");
    await config.editor.edit(config.entry, (current) => ({ ...current, defaultEnabled: enabled }));
    return { enabled };
  }

  private agentTeamConfig():
    | {
        readonly editor: ConfigEditor;
        readonly entry: ReturnType<ConfigEditor["entries"]>[number];
        readonly current: Record<string, unknown>;
      }
    | undefined {
    const editor = this.ctx.get("configEditor") as ConfigEditor | undefined;
    if (editor === undefined) return undefined;
    const config = editor
      .configuration()
      .find(({ entry }) => entry.options.name === AGENT_TEAM_ENTRY);
    if (config === undefined) return undefined;
    return {
      editor,
      entry: config.entry,
      current: { ...config.inherited, ...config.override },
    };
  }

  /** Save the switch for one Session id. */
  async setEnabled(
    sessionId: string,
    enabled: boolean,
    signal?: AbortSignal,
  ): Promise<{ enabled: boolean }> {
    signal?.throwIfAborted();
    const agent = this.ctx.agents.get(sessionId as SessionId);
    if (agent === undefined) throw new Error(`session ${sessionId} is not live`);
    const preset = this.presetOf(agent);
    if (enabled && preset !== undefined && !potetoSupportsPreset(preset)) {
      throw new Error(`the poteto workflow is not available for the "${preset}" agent preset`);
    }
    if (this.isEnabledFor(agent) !== enabled) {
      await writePotetoMode(this.modeTable, sessionId, enabled);
    }
    if (enabled) this.ensureNativeToolsRestricted(agent);
    else this.clearNativeToolsRestriction(agent);
    return { enabled };
  }

  /**
   * Record an explicit on selection for a Session that would run the workflow
   * from the global default. The sidecar keeps the client snapshot and the
   * running Session on the same saved value after the default is applied.
   */
  private async seedDefaultMode(agent: Agent): Promise<void> {
    if (this.seededDefaults.has(agent)) return;
    const selected = readPotetoMode(this.modeTable, agent.session.id);
    const seed = shouldSeedPotetoDefault({
      agentPreset: this.presetOf(agent),
      selected,
      byDefault: this.defaultEnabled,
    });
    if (!seed) return;
    this.seededDefaults.add(agent);
    try {
      await writePotetoMode(this.modeTable, agent.session.id, true);
    } catch (error) {
      this.seededDefaults.delete(agent);
      throw error;
    }
  }

  /** Deny every native delegation tool currently registered for the Agent, once each. */
  private ensureNativeToolsRestricted(agent: Agent): void {
    if (this.restricting.has(agent)) return;
    const applied = this.appliedTools.get(agent) ?? new Set<string>();
    const missing = NATIVE_DELEGATION_TOOLS.filter(
      (name) => !applied.has(name) && agent.ctx.tools.get(name, agent) !== undefined,
    );
    if (missing.length === 0) {
      this.appliedTools.set(agent, applied);
      return;
    }
    this.restricting.add(agent);
    try {
      const lift = agent.ctx.tools.restrict({ deny: missing });
      const lifts = this.lifts.get(agent) ?? [];
      lifts.push(lift);
      this.lifts.set(agent, lifts);
      for (const name of missing) applied.add(name);
      this.appliedTools.set(agent, applied);
    } catch {
      // A name raced out of the registry between the lookup and the restrict; retry on the next tools/change.
    } finally {
      this.restricting.delete(agent);
    }
  }

  /** Re-apply to every live root Agent, since a tool can register after the Agent was created. */
  private reconcileNativeTools(): void {
    for (const agent of this.ctx.agents.list()) {
      if (agent.session.header.origin === "subagent") continue;
      if (!this.isEnabledFor(agent)) continue;
      this.ensureNativeToolsRestricted(agent);
    }
  }

  private clearNativeToolsRestriction(agent: Agent): void {
    for (const lift of this.lifts.get(agent) ?? []) lift();
    this.lifts.delete(agent);
    this.appliedTools.delete(agent);
  }
}

export default PotetoModeService;
