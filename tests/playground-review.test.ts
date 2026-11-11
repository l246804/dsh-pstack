import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { Phase, RunRecord, SessionFacts } from "../playground/types.ts";
import {
  latestRecords,
  pendingSemanticReview,
  verdictFor,
} from "../playground/scripts/lib/evidence.ts";
import {
  applyReviews,
  inspectReviews,
  parseReviewValue,
  readRunRecords,
} from "../playground/scripts/lib/review.ts";

const SCENARIO_ID = "poteto-help-smoke";
const REVIEWED_AT = "2026-11-11T01:00:00.000Z";

const temporaries: string[] = [];
afterEach(() => {
  for (const directory of temporaries.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

interface RecordOptions {
  sessionOverrides?: Partial<SessionFacts>;
  mechanicalFailures?: string[];
  capturedAt?: string;
  /** Simulate a record written before mechanicalFailures existed: the JSON lacks the field. */
  legacy?: boolean;
}

function pendingRecord(
  phase: Phase,
  environmentId: string,
  recordFile: string,
  options: RecordOptions = {},
): RunRecord {
  const mechanicalFailures = options.mechanicalFailures ?? [];
  return {
    scenarioId: SCENARIO_ID,
    phase,
    environment: {
      worker: 0,
      dshVersion: "test-dsh",
      adaptedVersion: phase === "raw" ? null : "test-adapted",
      matrix: { id: environmentId, enabledPluginPackages: [] },
      upstreamRevision: "test-upstream",
      configHash: "test-config",
    },
    target: { provider: "provider-a", model: "model-a", effort: "low" },
    session: {
      sessionId: "session",
      sessionFile: "session-file",
      workspacePath: null,
      agentPreset: phase === "raw" ? "standard" : "poteto-mode",
      skillLoads: ["poteto-help"],
      toolCalls: [],
      turnEndReason: "completed",
      assistantText: "建议先用 vp test 验证改动。",
      userText: "prompt",
      userTexts: ["prompt"],
      autoAnswers: [],
      ...options.sessionOverrides,
    },
    artifacts: { recordFile, observed: [] },
    semanticReview: pendingSemanticReview(),
    mechanicalFailures,
    verdict: verdictFor({
      phase,
      failures: mechanicalFailures,
      semanticReview: pendingSemanticReview(),
    }),
    capturedAt: options.capturedAt ?? "2026-11-11T00:00:00.000Z",
  };
}

interface Fixture {
  workers: string;
  reviews: string;
  evidence: string;
  original: string;
}

function fixture(phase: Phase, options: RecordOptions = {}): Fixture {
  const root = mkdtempSync(join(tmpdir(), "pstack-review-"));
  temporaries.push(root);
  const workers = join(root, ".workers");
  const evidence = join(workers, "base", "w0", "evidence");
  mkdirSync(evidence, { recursive: true });
  const reviews = join(root, "reviews");
  mkdirSync(reviews, { recursive: true });
  const original = join(evidence, `${SCENARIO_ID}-${phase}-base-2026-11-11T00-00-00-000Z.json`);
  const record = pendingRecord(phase, "base", original, options);
  if (options.legacy) {
    const legacy: Record<string, unknown> = { ...record };
    delete legacy.mechanicalFailures;
    writeFileSync(original, `${JSON.stringify(legacy, null, 2)}\n`);
  } else {
    writeFileSync(original, `${JSON.stringify(record, null, 2)}\n`);
  }
  return { workers, reviews, evidence, original };
}

function reviewValue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: "supported",
    reason: "The reply gives concrete verification guidance.",
    reviewer: {
      kind: "model",
      route: { provider: "provider-a", model: "model-a", effort: "low" },
    },
    reviewedAt: REVIEWED_AT,
    ...overrides,
  };
}

function writeSidecar(reviews: string, phase: Phase, value: unknown): void {
  writeFileSync(
    join(reviews, `${SCENARIO_ID}-${phase}-base.json`),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}

function evidenceFiles(evidence: string): string[] {
  return readdirSync(evidence).filter((name) => name.endsWith(".json"));
}

function newestRecord(evidence: string): RunRecord {
  const records = evidenceFiles(evidence).map(
    (name) => JSON.parse(readFileSync(join(evidence, name), "utf8")) as RunRecord,
  );
  return records.sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))[0] as RunRecord;
}

function paths(fx: Fixture) {
  return { reviewsDirectory: fx.reviews, workersDirectory: fx.workers, scenarioIds: [SCENARIO_ID] };
}

describe("review sidecar validation", () => {
  it("rejects a sidecar whose reviewer is missing", () => {
    const { errors } = parseReviewValue({
      status: "supported",
      reason: "looks right",
      reviewedAt: REVIEWED_AT,
    });
    expect(errors).toContain("reviewer is required");
  });

  it("rejects a model reviewer with an incomplete route and a human reviewer without a name", () => {
    const modelErrors = parseReviewValue(
      reviewValue({
        reviewer: { kind: "model", route: { provider: "provider-a", model: "", effort: "low" } },
      }),
    ).errors;
    expect(modelErrors).toContain("reviewer.route.model must be a non-empty string");

    const humanErrors = parseReviewValue(
      reviewValue({ reviewer: { kind: "human", name: "" } }),
    ).errors;
    expect(humanErrors.some((error) => error.includes("reviewer.name"))).toBe(true);
  });

  it.each(["pending", "Pending", " pending "])(
    "rejects the %s placeholder in a model reviewer route",
    (placeholder) => {
      const { review, errors } = parseReviewValue(
        reviewValue({
          reviewer: {
            kind: "model",
            route: { provider: "provider-a", model: placeholder, effort: "low" },
          },
        }),
      );
      expect(review).toBeUndefined();
      expect(errors.some((error) => error.includes("reviewer.route.model"))).toBe(true);
      expect(errors.some((error) => error.includes("placeholder"))).toBe(true);
    },
  );

  it("rejects a placeholder provider or effort with the same rule", () => {
    const providerErrors = parseReviewValue(
      reviewValue({
        reviewer: {
          kind: "model",
          route: { provider: "pending", model: "model-a", effort: "low" },
        },
      }),
    ).errors;
    expect(providerErrors.some((error) => error.includes("reviewer.route.provider"))).toBe(true);
    const effortErrors = parseReviewValue(
      reviewValue({
        reviewer: {
          kind: "model",
          route: { provider: "provider-a", model: "model-a", effort: "PENDING" },
        },
      }),
    ).errors;
    expect(effortErrors.some((error) => error.includes("reviewer.route.effort"))).toBe(true);
  });

  it("accepts a complete sidecar and a complete human reviewer", () => {
    expect(parseReviewValue(reviewValue()).errors).toEqual([]);
    expect(
      parseReviewValue(reviewValue({ reviewer: { kind: "human", name: "Ada" } })).errors,
    ).toEqual([]);
  });

  it("surfaces format errors from the inspection so the command can exit 1", () => {
    const fx = fixture("raw");
    writeSidecar(fx.reviews, "raw", {
      status: "supported",
      reason: "looks right",
      reviewedAt: REVIEWED_AT,
    });
    const inspection = inspectReviews(paths(fx));
    expect(inspection.errors.length).toBeGreaterThan(0);
    expect(inspection.sidecars).toEqual([]);
  });
});

describe("applying a review", () => {
  it("upgrades a pending raw record to an observed revision", () => {
    const fx = fixture("raw");
    writeSidecar(fx.reviews, "raw", reviewValue());

    const result = applyReviews(paths(fx));
    expect(result.errors).toEqual([]);
    expect(result.written).toHaveLength(1);

    const upgraded = newestRecord(fx.evidence);
    expect(upgraded.semanticReview.status).toBe("supported");
    expect(upgraded.reviewedAt).toBe(REVIEWED_AT);
    expect(upgraded.verdict).toEqual({ phase: "raw", status: "observed", gaps: [] });
    expect(upgraded.artifacts.recordFile).toBe(result.written[0]?.recordFile);
    expect(existsSync(result.written[0]?.recordFile ?? "")).toBe(true);
    expect(existsSync(fx.original)).toBe(true);
    expect(evidenceFiles(fx.evidence)).toHaveLength(2);
  });

  it("upgrades a pending adapted record to a verified revision", () => {
    const fx = fixture("adapted");
    writeSidecar(fx.reviews, "adapted", reviewValue());

    applyReviews(paths(fx));

    const upgraded = newestRecord(fx.evidence);
    expect(upgraded.semanticReview.status).toBe("supported");
    expect(upgraded.verdict).toEqual({ phase: "adapted", status: "verified" });
  });

  it("turns the verdict to gap when the reviewer reports a gap", () => {
    const fx = fixture("raw");
    writeSidecar(fx.reviews, "raw", reviewValue({ status: "gap", reason: "no concrete advice" }));

    applyReviews(paths(fx));

    const upgraded = newestRecord(fx.evidence);
    expect(upgraded.semanticReview.status).toBe("gap");
    expect(upgraded.verdict.status).toBe("gap");
  });

  it("does not launder a failed assertion into observed", () => {
    const fx = fixture("raw", { sessionOverrides: { skillLoads: [] }, legacy: true });
    writeSidecar(fx.reviews, "raw", reviewValue());

    applyReviews(paths(fx));

    const upgraded = newestRecord(fx.evidence);
    expect(upgraded.semanticReview.status).toBe("supported");
    expect(upgraded.verdict.status).toBe("gap");
    expect(JSON.stringify(upgraded.verdict)).toContain("poteto-help");
    expect(upgraded.mechanicalFailures.some((failure) => failure.includes("poteto-help"))).toBe(
      true,
    );
  });

  it("keeps mechanical failures on disk while a raw verdict is still unobserved", () => {
    const fx = fixture("raw", { mechanicalFailures: ['assistant reply lacks "限制"'] });
    const record = newestRecord(fx.evidence);
    expect(record.verdict.status).toBe("unobserved");
    expect(record.mechanicalFailures).toEqual(['assistant reply lacks "限制"']);
  });

  it("keeps mechanical failures on disk while an adapted verdict is inconclusive", () => {
    const fx = fixture("adapted", { mechanicalFailures: ["missing artifact: verify/SKILL.md"] });
    const record = newestRecord(fx.evidence);
    expect(record.verdict.status).toBe("inconclusive");
    expect(record.mechanicalFailures).toEqual(["missing artifact: verify/SKILL.md"]);
  });

  it("carries recorded mechanical failures into the revision verdict", () => {
    const fx = fixture("raw", {
      mechanicalFailures: ["actual model route differs from testModel"],
    });
    writeSidecar(fx.reviews, "raw", reviewValue());

    applyReviews(paths(fx));

    const upgraded = newestRecord(fx.evidence);
    expect(upgraded.mechanicalFailures).toEqual(["actual model route differs from testModel"]);
    expect(upgraded.verdict).toEqual({
      phase: "raw",
      status: "gap",
      gaps: [
        "actual model route differs from testModel",
        "The reply gives concrete verification guidance.",
      ],
    });
  });

  it("is idempotent: a second apply writes no new revision", () => {
    const fx = fixture("raw");
    writeSidecar(fx.reviews, "raw", reviewValue());

    const first = applyReviews(paths(fx));
    expect(first.written).toHaveLength(1);
    const afterFirst = evidenceFiles(fx.evidence).length;

    const second = applyReviews(paths(fx));
    expect(second.written).toEqual([]);
    expect(second.skipped).toHaveLength(1);
    expect(second.stale).toEqual([]);
    expect(evidenceFiles(fx.evidence)).toHaveLength(afterFirst);
  });

  it("counts a sidecar older than the latest recapture as stale and merges nothing", () => {
    const fx = fixture("raw");
    const rerunFile = join(fx.evidence, `${SCENARIO_ID}-raw-base-2026-11-11T02-00-00-000Z.json`);
    writeFileSync(
      rerunFile,
      `${JSON.stringify(
        pendingRecord("raw", "base", rerunFile, { capturedAt: "2026-11-11T02:00:00.000Z" }),
        null,
        2,
      )}\n`,
    );
    writeSidecar(fx.reviews, "raw", reviewValue());

    const result = applyReviews(paths(fx));
    expect(result.written).toEqual([]);
    expect(result.stale).toEqual([
      { scenarioId: SCENARIO_ID, phase: "raw", environmentId: "base" },
    ]);

    // The rerun evidence keeps its pending review; the old verdict never lands on it.
    const rerun = newestRecord(fx.evidence);
    expect(rerun.capturedAt).toBe("2026-11-11T02:00:00.000Z");
    expect(rerun.semanticReview.status).toBe("pending");
    expect(evidenceFiles(fx.evidence)).toHaveLength(2);
  });

  it("merges a sidecar reviewed at exactly the latest capture time", () => {
    const fx = fixture("raw", { capturedAt: REVIEWED_AT });
    writeSidecar(fx.reviews, "raw", reviewValue());

    const result = applyReviews(paths(fx));
    expect(result.stale).toEqual([]);
    expect(result.written).toHaveLength(1);
    expect(newestRecord(fx.evidence).semanticReview.status).toBe("supported");
  });

  it("leaves a record pending when no sidecar reviews it", () => {
    const fx = fixture("raw");

    const result = applyReviews(paths(fx));
    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([]);

    const record = newestRecord(fx.evidence);
    expect(record.semanticReview.status).toBe("pending");
    expect(record.verdict.status).toBe("unobserved");
    expect(evidenceFiles(fx.evidence)).toHaveLength(1);
  });

  it("keeps the revision visible to the latest-record reader collect uses", () => {
    const fx = fixture("adapted");
    writeSidecar(fx.reviews, "adapted", reviewValue());
    applyReviews(paths(fx));

    const latest = latestRecords(readRunRecords(fx.workers)).find(
      (record) => record.phase === "adapted",
    );
    expect(latest?.semanticReview.status).toBe("supported");
    expect(latest?.verdict).toEqual({ phase: "adapted", status: "verified" });
  });
});
