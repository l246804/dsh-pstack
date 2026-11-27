import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { RUN_STATUSES, VARIANTS, type RunRecord } from "../types.ts";

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
