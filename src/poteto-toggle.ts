/** Session-scoped poteto-workflow switch. */

import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-agent-team";
import type { AgentPresetRegistry } from "@deepseek-ai/dsh-agent-preset-registry";
import type { ConfigEditor } from "@deepseek-ai/dsh-config-editor";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-session-persistence";
import { renderSkillContent } from "@deepseek-ai/dsh-skill";
import type { Domain } from "@deepseek-ai/dsh-storage-domain";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type {} from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-system-prompt";
import type {} from "@deepseek-ai/dsh-typert-registry";

import {
  potetoPromptApplies,
  potetoSupportsPreset,
  resolvePotetoEnabled,
  shouldSeedPotetoDefault,
} from "./poteto/preset-gate.ts";
import { createPotetoProjectionDefinition } from "./poteto/projection.ts";
import {
  clearRepairQueue,
  enqueueRepair,
  executeRepairQueue,
  queuedSessionIds,
  readRepairQueue,
  scanLegacySessions as scanLegacySessionRefs,
  writeRepairQueue,
  type StoredSessionRef,
} from "./poteto/maintenance.ts";
import type { MaintenanceScanResult, RepairOutcome } from "./poteto/maintenance-types.ts";
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
const CONTRACT_SECTION_NAME = "pstack:poteto-contract";
const CONTRACT_SECTION_ORDER = 0;
const CONTRACT_TEXT = [
  "Poteto workflow is active.",
  "Before acting, follow the non-negotiables in the poteto-mode skill in this session.",
  "Do not rely on earlier summaries for them.",
].join("\n");
const AGENT_TEAM_ENTRY = "@deepseek-ai/dsh-agent-team";
/** Native delegation tools pstack replaces while the poteto workflow runs. */
const NATIVE_DELEGATION_TOOLS = ["subagent", "subagent_fork"] as const;

function writeDefaultEnabled(enabled: boolean): void {
  writeSettings({ version: 1, potetoDefault: enabled });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Toggle poteto workflow for one Session. */
export class PotetoModeService extends TypertRemoteService {
  static inject = [
    "agents",
    "skills",
    "sessions",
    "sessionPersistence",
    "sessionProjections",
    "storageDomain",
    "systemPrompt",
    "typert",
    "pstackHome",
  ];

  private readonly lifts = new WeakMap<Agent, Array<() => void>>();
  private readonly appliedTools = new WeakMap<Agent, Set<string>>();
  private readonly restricting = new WeakSet<Agent>();
  private readonly seededDefaults = new WeakSet<Agent>();
  private defaultEnabled = false;
  private sectionText = "";
  private domain!: Domain<typeof potetoDomainSpec>;
  private modeTable!: PotetoModeTable;
  private repairOutcome: RepairOutcome | undefined;

  constructor(ctx: Context) {
    super(ctx, POTETO_SERVICE);
  }

  protected async [Service.init](): Promise<void> {
    const settings = readSettings();
    this.defaultEnabled = settings.potetoDefault;
    this.domain = await this.ctx.storageDomain.open(potetoDomainSpec);
    this.modeTable = this.domain.table("poteto_modes");
    this.ctx.effect(() => () => this.domain.close(), "pstack.poteto-toggle.domain");
    this.repairOutcome = await this.processRepairQueue();
    await this.ctx.sessionProjections.register(
      createPotetoProjectionDefinition((header) =>
        resolvePotetoEnabled({
          agentPreset: header.agentPreset,
          selected: readPotetoMode(this.modeTable, header.id),
          byDefault: this.defaultEnabled,
        }),
      ),
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
          name: CONTRACT_SECTION_NAME,
          order: CONTRACT_SECTION_ORDER,
          interpolate: false,
          text: ({ agent }) =>
            agent !== undefined && this.promptAppliesTo(agent) ? CONTRACT_TEXT : "",
        }),
      "pstack.poteto-toggle.contract()",
    );

    this.ctx.effect(
      () =>
        this.ctx.systemPrompt.section({
          name: SECTION_NAME,
          order: SECTION_ORDER,
          interpolate: false,
          text: ({ agent }) =>
            agent !== undefined && this.promptAppliesTo(agent) ? this.sectionText : "",
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
          async ({ agent }, next) => {
            const decision = await next();
            if (decision.kind === "reject") return decision;
            if (this.isEnabledFor(agent)) this.ensureNativeToolsRestricted(agent);
            return decision;
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

  /** Whether the poteto system-prompt sections apply to this Agent. A subagent uses its own preset. */
  private promptAppliesTo(agent: Agent): boolean {
    return potetoPromptApplies({
      enabled: this.isEnabledFor(agent),
      origin: agent.session.header.origin,
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

  /** Scan stored logs for Sessions that still carry the retired poteto/mode event. */
  async scanLegacySessions(): Promise<MaintenanceScanResult> {
    const sources = (await this.storedSessionRefs()).filter(
      (source) => this.ctx.agents.get(source.sessionId as SessionId) === undefined,
    );
    const result = scanLegacySessionRefs(sources);
    let queued: ReadonlySet<string>;
    try {
      queued = queuedSessionIds();
    } catch {
      queued = new Set();
    }
    return {
      sessions: result.sessions.filter((session) => !queued.has(session.sessionId)),
      failures: result.failures,
    };
  }

  /** Queue selected Session ids for repair on the next DSH start. */
  queueLegacyRepair(sessionIds: readonly string[]): { queued: number } {
    for (const sessionId of sessionIds) {
      if (this.ctx.agents.get(sessionId as SessionId) !== undefined) {
        throw new Error(`session ${sessionId} is live`);
      }
    }
    return { queued: enqueueRepair(sessionIds) };
  }

  /** Return the one-shot result produced by the last restart. */
  consumeLegacyRepairResult(): RepairOutcome | null {
    const result = this.repairOutcome;
    this.repairOutcome = undefined;
    return result ?? null;
  }

  private async storedSessionRefs(): Promise<StoredSessionRef[]> {
    const snapshots = await this.ctx.sessionPersistence.list();
    return snapshots.flatMap((snapshot) => {
      const logPath = snapshot.location?.path;
      if (logPath === undefined) return [];
      return [
        {
          sessionId: String(snapshot.header.id),
          workspace: snapshot.header.cwd,
          logPath,
        },
      ];
    });
  }

  private async processRepairQueue(): Promise<RepairOutcome | undefined> {
    let queue;
    try {
      queue = readRepairQueue();
    } catch (error) {
      clearRepairQueue();
      return { repaired: 0, failed: [{ sessionId: "", message: messageOf(error) }] };
    }
    if (queue === undefined) return undefined;

    const ids = [...new Set(queue.sessionIds)];
    let sources: StoredSessionRef[];
    try {
      sources = await this.storedSessionRefs();
    } catch (error) {
      clearRepairQueue();
      return {
        repaired: 0,
        failed: ids.map((sessionId) => ({ sessionId, message: messageOf(error) })),
      };
    }

    const outcome = await executeRepairQueue(queue, sources, {
      table: this.modeTable,
      openRead: async (sessionId) => {
        const handle = await this.ctx.sessionPersistence.open(sessionId as SessionId, "read");
        return {
          read: () => handle.read(0),
          close: () => handle.close(),
        };
      },
      isLive: (sessionId) => this.ctx.agents.get(sessionId as SessionId) !== undefined,
    });
    // Keep sessions that failed for a retryable reason so the user does not have
    // to rescan; drop "not found" ids, which will never repair.
    const retryable = outcome.failed
      .filter((failure) => failure.sessionId !== "" && failure.message !== "session not found")
      .map((failure) => failure.sessionId);
    try {
      if (retryable.length > 0) writeRepairQueue(retryable);
      else clearRepairQueue();
    } catch (error) {
      return {
        repaired: outcome.repaired,
        failed: [...outcome.failed, { sessionId: "", message: messageOf(error) }],
      };
    }
    return outcome;
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
    // Only sessions created before this build can still lack an explicit
    // selection and depend on the live default, so re-apply tool denial for them.
    this.reconcileNativeTools();
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
   * Record the resolved default as an explicit selection for a new Session. The
   * sidecar then holds the creation-time value, so a later change to the global
   * default cannot flip this Session, and the projection paints it on first pass.
   */
  private async seedDefaultMode(agent: Agent): Promise<void> {
    if (this.seededDefaults.has(agent)) return;
    const selected = readPotetoMode(this.modeTable, agent.session.id);
    const seed = shouldSeedPotetoDefault({ agentPreset: this.presetOf(agent), selected });
    if (!seed) return;
    this.seededDefaults.add(agent);
    try {
      await writePotetoMode(this.modeTable, agent.session.id, this.defaultEnabled);
    } catch {
      // Best effort: a failed seed falls back to the live default in isEnabledFor.
      this.seededDefaults.delete(agent);
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
      if (this.isEnabledFor(agent)) this.ensureNativeToolsRestricted(agent);
      else this.clearNativeToolsRestriction(agent);
    }
  }

  private clearNativeToolsRestriction(agent: Agent): void {
    for (const lift of this.lifts.get(agent) ?? []) lift();
    this.lifts.delete(agent);
    this.appliedTools.delete(agent);
  }
}

export default PotetoModeService;
