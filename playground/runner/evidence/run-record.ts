import { createEnvironment } from "../worker/run-metadata.ts";
import { environmentMatrix } from "../scenario/environments.ts";
import type { WorkerPaths } from "../worker/worker.ts";
import { digestSession, sessionFacts } from "./session-facts.ts";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { RUN_STATUSES, VARIANTS, type Variant, type RunRecord } from "../types.ts";

const strings = z.array(z.string());
const target = z.object({ provider: z.string(), model: z.string(), effort: z.string() });
const toolStatus = z.enum(["pending", "ok", "error"]);
/** Validate disk input once before consumers rely on the complete RunRecord contract. */
const runRecord = z.object({
  scenarioId: z.string(),
  variant: z.enum(VARIANTS),
  environment: z.object({
    worker: z.number(),
    dshVersion: z.string(),
    pstackVersion: z.string(),
    upstreamRevision: z.string(),
    matrix: z.object({
      id: z.string(),
      description: z.string(),
      kind: z.enum(["base", "capability", "conflict"]),
      enabledPluginPackages: strings,
      versionExemptions: strings.optional(),
      teamMode: z.boolean().optional(),
    }),
  }),
  target: target.nullable(),
  session: z
    .object({
      sessionId: z.string(),
      sessionFile: z.string(),
      workspacePath: z.string().nullable(),
      agentPreset: z.string().nullable(),
      skillLoads: strings,
      toolCalls: z.array(
        z.object({
          name: z.string(),
          status: toolStatus,
          argsSummary: z.string(),
          errorText: z.string().optional(),
        }),
      ),
      turnEndReason: z.string().nullable(),
      assistantText: z.string(),
      userText: z.string(),
      userTexts: strings,
      autoAnswers: z.array(z.object({ question: z.string(), answer: z.string() })),
    })
    .nullable(),
  artifacts: z.object({
    recordFile: z.string(),
    screenshotFile: z.string().optional(),
  }),
  mechanicalFailures: strings,
  status: z.enum(RUN_STATUSES),
  blockedReason: z.string().optional(),
  capturedAt: z.string(),
  batchId: z.string().optional(),
}) satisfies z.ZodType<RunRecord>;

export function parseRunRecord(value: unknown, file: string): RunRecord {
  const result = runRecord.safeParse(value);
  if (!result.success) {
    throw new Error(`invalid RunRecord in ${file}: ${result.error.message}`);
  }
  return result.data;
}

/** Read only run records; worker config and progress are separate inputs. */
export function readRunRecords(directory: string): RunRecord[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (!entry.isFile()) return [];
    if (
      entry.name !== "record.json" &&
      !/-(?:native|adapted)-.+-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/.test(entry.name)
    )
      return [];
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`invalid RunRecord in ${file}: ${String(error)}`);
    }
    return [parseRunRecord(value, file)];
  });
}

export function assertSafeRecord(record: RunRecord, apiKeys: string[]): void {
  const serialized = JSON.stringify(record);
  for (const apiKey of apiKeys) {
    if (apiKey && serialized.includes(apiKey)) throw new Error("RunRecord contains an apiKey");
  }
}

export function latestRecords(records: RunRecord[]): RunRecord[] {
  const latest = new Map<string, RunRecord>();
  for (const record of records) {
    const key = `${record.scenarioId}\0${record.variant}\0${record.environment.matrix.id}`;
    const current = latest.get(key);
    if (!current || record.capturedAt > current.capturedAt) latest.set(key, record);
  }
  return [...latest.values()];
}

export function recordFileName(
  scenarioId: string,
  variant: Variant,
  environmentId: string,
  stamp: string,
): string {
  return `${scenarioId}-${variant}-${environmentId}-${stamp}.json`;
}

export function blockedRecord(input: {
  scenarioId: string;
  variant: Variant;
  paths: WorkerPaths;
  recordFile: string;
  screenshotFile: string;
  sessionFile?: string;
  sessionId?: string;
  reason: string;
  batchId?: string;
  /** The attempt start stamp shared with the record and screenshot filenames. */
  capturedAt: string;
}): RunRecord {
  const matrix = environmentMatrix(input.paths.environmentId);
  const sessionFile = input.sessionFile;
  const session = sessionFile
    ? (() => {
        try {
          return sessionFacts(
            digestSession(sessionFile, input.sessionId ?? "", input.paths.index),
            sessionFile,
            [],
          );
        } catch {
          return null;
        }
      })()
    : null;
  return {
    scenarioId: input.scenarioId,
    variant: input.variant,
    environment: createEnvironment({
      worker: input.paths.index,
      matrix,
    }),
    target: null,
    session,
    artifacts: {
      recordFile: input.recordFile,
      screenshotFile: input.screenshotFile,
    },
    mechanicalFailures: [],
    status: "blocked",
    blockedReason: input.reason,
    batchId: input.batchId,
    capturedAt: input.capturedAt,
  };
}
