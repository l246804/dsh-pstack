/** Host lifecycle and Remote methods for repairing legacy session logs. */
import { Service } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-agent";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-session-persistence";
import type {} from "@deepseek-ai/dsh-typert-registry";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { describeError } from "../lib/errors.ts";
import { POTETO_MAINTENANCE_SERVICE } from "./maintenance-remote.ts";
import type { PotetoModeTable } from "./storage.ts";
import {
  clearRepairQueue,
  enqueueRepair,
  executeRepairQueue,
  queuedSessionIds,
  readRepairQueue,
  scanLegacySessions as scanLegacySessionRefs,
  writeRepairQueue,
  type StoredSessionRef,
} from "./maintenance.ts";
import type { MaintenanceScanResult, RepairOutcome } from "./maintenance-types.ts";

interface MaintenanceConfig {
  readonly table: PotetoModeTable;
}

/** Mounted by the switch service after storage opens, disposed with that service. */
export class PotetoMaintenanceService extends TypertRemoteService {
  static inject = ["agents", "sessionPersistence", "typert"];
  private repairOutcome: RepairOutcome | undefined;
  private readonly modeTable: PotetoModeTable;

  constructor(ctx: Context, config: MaintenanceConfig) {
    super(ctx, POTETO_MAINTENANCE_SERVICE);
    this.modeTable = config.table;
  }

  protected async [Service.init](): Promise<void> {
    this.repairOutcome = await this.processRepairQueue();
  }

  /** Scan stored logs for Sessions that still carry the retired poteto/mode event. */
  async scanLegacySessions(): Promise<MaintenanceScanResult> {
    const stored = await this.storedSessionRefs();
    const sources = stored.filter(
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
    const refs: StoredSessionRef[] = [];
    for (const snapshot of snapshots) {
      const logPath = snapshot.location?.path;
      // Pending sessions and non-file backends need not have a legacy log to repair.
      if (logPath === undefined) continue;
      refs.push({
        sessionId: String(snapshot.header.id),
        workspace: snapshot.header.cwd,
        logPath,
      });
    }
    return refs;
  }

  private async processRepairQueue(): Promise<RepairOutcome | undefined> {
    let queue;
    try {
      queue = readRepairQueue();
    } catch (error) {
      clearRepairQueue();
      return { repaired: 0, failed: [{ sessionId: "", message: describeError(error) }] };
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
        failed: ids.map((sessionId) => ({ sessionId, message: describeError(error) })),
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
        failed: [...outcome.failed, { sessionId: "", message: describeError(error) }],
      };
    }
    return outcome;
  }
}
