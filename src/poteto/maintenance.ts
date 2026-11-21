/** One-off maintenance for Sessions written before the storageDomain switch. */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { z } from "zod";

import { writeFileAtomically } from "../lib/atomic-write.ts";
import { resolveDshHome } from "../roles/role-store.ts";
import type {
  LegacySessionInfo,
  MaintenanceFailure,
  MaintenanceScanResult,
  RepairOutcome,
  RepairQueue,
} from "./maintenance-types.ts";
import type { PotetoModeTable } from "./storage.ts";

const RETIRED_EVENT = "poteto/mode";
const REPAIR_QUEUE_FILENAME = "pstack-repair.json";
const ZSTD_CHECKSUM = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };

const repairQueueSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.number(),
    sessionIds: z.array(z.string().min(1)),
  })
  .strict() as z.ZodType<RepairQueue>;

/** One stored Session resolved from the persistence service. */
export interface StoredSessionRef {
  readonly sessionId: string;
  readonly workspace?: string;
  readonly logPath: string;
}

/** Result of rewriting one Session's log and sidecar record. */
export interface LegacyRepairResult {
  readonly changed: boolean;
  readonly enabled?: boolean;
  readonly backupPath?: string;
  readonly previousRecord?: { readonly enabled: boolean };
}

type StoredEvent = Record<string, unknown>;

interface ParsedLog {
  readonly headerLine: string;
  readonly eventLines: readonly string[];
  readonly events: readonly StoredEvent[];
}

function readText(path: string): string {
  const bytes = readFileSync(path);
  if (!path.endsWith(".zstd")) return bytes.toString("utf8");
  return zstdDecompressSync(bytes).toString("utf8");
}

function parseLog(path: string): ParsedLog {
  const text = readText(path);
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const headerLine = lines.shift();
  if (headerLine === undefined) throw new Error("empty session log");
  const eventLines = lines.filter((line) => line.trim() !== "");
  const events = eventLines.map((line, index) => {
    try {
      return JSON.parse(line) as StoredEvent;
    } catch (error) {
      throw new Error(`invalid event at line ${index + 2}: ${String(error)}`);
    }
  });
  return { headerLine, eventLines, events };
}

function isLegacyEvent(event: StoredEvent): boolean {
  return event["type"] === RETIRED_EVENT && event["ignorable"] !== true;
}

function legacyEvents(events: readonly StoredEvent[]): readonly StoredEvent[] {
  return events.filter(isLegacyEvent);
}

function lastTitle(events: readonly StoredEvent[]): string | undefined {
  let title: string | undefined;
  for (const event of events) {
    if (event["type"] !== "session/title") continue;
    const candidate = (event["data"] as { title?: unknown } | undefined)?.title;
    if (typeof candidate === "string" && candidate.trim() !== "") title = candidate;
  }
  return title;
}

function writeBufferAtomically(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes);
    renameSync(temporary, path);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Preserve the original failure.
    }
    throw error;
  }
}

function encodeLog(path: string, headerLine: string, eventLines: readonly string[]): Buffer {
  const eventText = eventLines.length === 0 ? "" : `${eventLines.join("\n")}\n`;
  if (!path.endsWith(".zstd")) return Buffer.from(`${headerLine}\n${eventText}`, "utf8");
  const headerFrame = zstdCompressSync(Buffer.from(`${headerLine}\n`, "utf8"), ZSTD_CHECKSUM);
  if (eventText === "") return headerFrame;
  const eventFrame = zstdCompressSync(Buffer.from(eventText, "utf8"), ZSTD_CHECKSUM);
  return Buffer.concat([headerFrame, eventFrame]);
}

function nextBackupPath(path: string): string {
  const preferred = `${path}.bak`;
  return existsSync(preferred) ? `${preferred}.${Date.now()}` : preferred;
}

/** Read the repair queue; a missing file is a clean queue. */
export function readRepairQueue(path: string = repairQueuePath()): RepairQueue | undefined {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return repairQueueSchema.parse(JSON.parse(text));
}

/** Queue selected Session ids for the next DSH start. */
export function writeRepairQueue(
  sessionIds: readonly string[],
  path: string = repairQueuePath(),
): number {
  const unique = [...new Set(sessionIds.filter((id) => id.trim() !== ""))];
  const queue: RepairQueue = { version: 1, createdAt: Date.now(), sessionIds: unique };
  writeFileAtomically(path, `${JSON.stringify(queue, null, 2)}\n`);
  return unique.length;
}

/** Remove the consumed repair queue. */
export function clearRepairQueue(path: string = repairQueuePath()): void {
  rmSync(path, { force: true });
}

/** Absolute path of the repair queue for the active DSH home. */
export function repairQueuePath(): string {
  return join(resolveDshHome(), REPAIR_QUEUE_FILENAME);
}

/** Scan stored logs for the retired event without writing anything. */
export function scanLegacySessions(sources: readonly StoredSessionRef[]): MaintenanceScanResult {
  const sessions: LegacySessionInfo[] = [];
  const failures: MaintenanceFailure[] = [];
  for (const source of sources) {
    try {
      const parsed = parseLog(source.logPath);
      const legacy = legacyEvents(parsed.events);
      if (legacy.length === 0) continue;
      const last = legacy[legacy.length - 1];
      const enabled = (last?.["data"] as { enabled?: unknown } | undefined)?.enabled;
      if (typeof enabled !== "boolean") throw new Error("invalid poteto/mode payload");
      sessions.push({
        sessionId: source.sessionId,
        workspace: source.workspace ?? "",
        title: lastTitle(parsed.events) ?? source.sessionId,
        enabled,
        eventCount: parsed.events.length,
      });
    } catch (error) {
      failures.push({
        sessionId: source.sessionId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  sessions.sort(
    (left, right) =>
      left.workspace.localeCompare(right.workspace) ||
      left.title.localeCompare(right.title) ||
      left.sessionId.localeCompare(right.sessionId),
  );
  return { sessions, failures };
}

/**
 * Rewrite one legacy log and seed the storageDomain sidecar. The caller
 * validates the rewritten log through the persistence service and calls
 * {@link restoreLegacySession} when validation fails.
 */
export async function repairLegacySession(
  source: StoredSessionRef,
  table: PotetoModeTable,
): Promise<LegacyRepairResult> {
  const parsed = parseLog(source.logPath);
  const legacy = legacyEvents(parsed.events);
  if (legacy.length === 0) return { changed: false };
  const last = legacy[legacy.length - 1];
  const enabled = (last?.["data"] as { enabled?: unknown } | undefined)?.enabled;
  if (typeof enabled !== "boolean") throw new Error("invalid poteto/mode payload");

  const previousRecord = table.get(source.sessionId);
  const backupPath = nextBackupPath(source.logPath);
  copyFileSync(source.logPath, backupPath);
  await table.put(source.sessionId, { enabled });
  try {
    const repaired = parsed.events.map((event) =>
      isLegacyEvent(event) ? { ...event, ignorable: true } : event,
    );
    writeBufferAtomically(
      source.logPath,
      encodeLog(
        source.logPath,
        parsed.headerLine,
        repaired.map((event) => JSON.stringify(event)),
      ),
    );
  } catch (error) {
    await restoreSidecar(table, source.sessionId, previousRecord);
    throw error;
  }
  return { changed: true, enabled, backupPath, previousRecord };
}

/** Host capabilities needed to execute one queued repair run. */
export interface RepairQueueRunner {
  readonly table: PotetoModeTable;
  openRead(sessionId: string): Promise<{ close(): Promise<void> }>;
  isLive?(sessionId: string): boolean;
}

/**
 * Repair every queued Session in place. The caller owns queue cleanup; this
 * function only reports per-Session outcomes.
 */
export async function executeRepairQueue(
  queue: RepairQueue,
  sources: readonly StoredSessionRef[],
  runner: RepairQueueRunner,
): Promise<RepairOutcome> {
  const ids = [...new Set(queue.sessionIds)];
  const byId = new Map(sources.map((source) => [source.sessionId, source]));
  const failed: { sessionId: string; message: string }[] = [];
  let repaired = 0;
  for (const sessionId of ids) {
    const source = byId.get(sessionId);
    if (source === undefined) {
      failed.push({ sessionId, message: "session not found" });
      continue;
    }
    if (runner.isLive?.(sessionId) === true) {
      failed.push({ sessionId, message: "session is live" });
      continue;
    }
    let result: LegacyRepairResult | undefined;
    try {
      result = await repairLegacySession(source, runner.table);
      if (result.changed) {
        const handle = await runner.openRead(sessionId);
        await handle.close();
      }
      repaired += 1;
    } catch (error) {
      if (result?.changed === true) {
        try {
          await restoreLegacySession(source, runner.table, result);
        } catch {
          // Keep the original repair failure; the backup remains on disk.
        }
      }
      failed.push({ sessionId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { repaired, failed };
}

/** Restore the log and sidecar after a failed post-write validation. */
export async function restoreLegacySession(
  source: StoredSessionRef,
  table: PotetoModeTable,
  result: LegacyRepairResult,
): Promise<void> {
  if (result.backupPath !== undefined && existsSync(result.backupPath)) {
    writeBufferAtomically(source.logPath, readFileSync(result.backupPath));
  }
  await restoreSidecar(table, source.sessionId, result.previousRecord);
}

async function restoreSidecar(
  table: PotetoModeTable,
  sessionId: string,
  previous: { readonly enabled: boolean } | undefined,
): Promise<void> {
  if (previous === undefined) await table.delete(sessionId);
  else await table.put(sessionId, previous);
}
