import { z } from "zod";

import { SEMANTIC_REVIEW_STATUSES, VARIANTS, type RunRecord } from "../types.ts";

const strings = z.array(z.string());
const target = z.object({ provider: z.string(), model: z.string(), effort: z.string() });
const toolStatus = z.enum(["pending", "ok", "error"]);
const verdict = z.union([
  z.object({ variant: z.literal("native"), status: z.enum(["observed", "gap"]), gaps: strings }),
  z.object({
    variant: z.literal("native"),
    status: z.enum(["blocked", "unobserved"]),
    reason: z.string(),
  }),
  z.object({ variant: z.literal("adapted"), status: z.literal("verified") }),
  z.object({ variant: z.literal("adapted"), status: z.literal("not-verified"), failures: strings }),
  z.object({
    variant: z.literal("adapted"),
    status: z.enum(["blocked", "inconclusive"]),
    reason: z.string(),
  }),
]);

/** Validate disk input once before consumers rely on the complete RunRecord contract. */
const runRecord = z
  .object({
    scenarioId: z.string(),
    scenarioHash: z.string().optional(),
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
        analysis: z
          .object({
            tools: z.array(
              z.object({
                name: z.string(),
                attempts: z.number(),
                failures: z.number(),
                firstAttemptStatus: toolStatus,
                finalStatus: toolStatus,
                recovered: z.boolean(),
              }),
            ),
            artifacts: strings,
            warnings: strings,
          })
          .optional(),
      })
      .nullable(),
    artifacts: z.object({
      recordFile: z.string(),
      screenshotFile: z.string().optional(),
      observed: strings,
    }),
    semanticReview: z.discriminatedUnion("status", [
      z.object({ status: z.literal("pending"), reason: z.string() }),
      z.object({
        status: z.enum(SEMANTIC_REVIEW_STATUSES),
        reason: z.string(),
        reviewer: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("model"), route: target }),
          z.object({ kind: z.literal("human"), name: z.string() }),
        ]),
      }),
    ]),
    mechanicalFailures: strings,
    verdict,
    blockedReason: z.string().optional(),
    capturedAt: z.string(),
    batchId: z.string().optional(),
  })
  .refine((record) => record.variant === record.verdict.variant, {
    path: ["verdict", "variant"],
    message: "must match record.variant",
  }) satisfies z.ZodType<RunRecord>;

export function parseRunRecord(value: unknown, file: string): RunRecord {
  const result = runRecord.safeParse(value);
  if (!result.success) {
    throw new Error(`invalid RunRecord in ${file}: ${result.error.message}`);
  }
  return result.data;
}
