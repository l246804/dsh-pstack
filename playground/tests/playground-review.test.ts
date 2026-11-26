import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { applyReview, checkReview } from "../scripts/review.ts";
import type { ReviewEntry } from "../runner/evidence/review-snapshot.ts";
import type { RunRecord, Variant, Verdict } from "../runner/types.ts";

const temporary = mkdtempSync(join(tmpdir(), "pstack-review-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function snapshotDir(root: string, variant: Variant, environment: string): string {
  return join(root, `${variant}-${environment}`);
}

function recordDir(
  root: string,
  variant: Variant,
  environment: string,
  scenarioId: string,
): string {
  return join(
    snapshotDir(root, variant, environment),
    "scenarios",
    scenarioId,
    `${variant}-${environment}`,
  );
}

function recordPath(
  root: string,
  variant: Variant,
  environment: string,
  scenarioId: string,
): string {
  return join(recordDir(root, variant, environment, scenarioId), "record.json");
}

function makeRecord(
  variant: Variant,
  environment: string,
  scenarioId: string,
  overrides: Partial<RunRecord> = {},
): RunRecord {
  const verdict: Verdict =
    variant === "native"
      ? { variant: "native", status: "unobserved", reason: "pending" }
      : { variant: "adapted", status: "inconclusive", reason: "pending" };
  return {
    scenarioId,
    variant,
    environment: {
      worker: 0,
      dshVersion: "test-dsh",
      pstackVersion: "test-pstack",
      matrix: { id: environment, description: "test", kind: "base", enabledPluginPackages: [] },
      upstreamRevision: "test-upstream",
    },
    target: null,
    session: null,
    artifacts: { recordFile: "record.json", observed: [] },
    semanticReview: { status: "pending", reason: "pending" },
    mechanicalFailures: [],
    verdict,
    capturedAt: "2026-11-11T00:00:00.000Z",
    ...overrides,
  };
}

function writeSnapshot(
  root: string,
  variant: Variant,
  environment: string,
  records: RunRecord[],
): void {
  for (const record of records) {
    const dir = recordDir(root, variant, environment, record.scenarioId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  }
}

function writeReview(
  root: string,
  variant: Variant,
  environment: string,
  entries: Record<string, ReviewEntry>,
): void {
  const dir = snapshotDir(root, variant, environment);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "review.json"), `${JSON.stringify(entries, null, 2)}\n`);
}

function readRecord(
  root: string,
  variant: Variant,
  environment: string,
  scenarioId: string,
): RunRecord {
  return JSON.parse(
    readFileSync(recordPath(root, variant, environment, scenarioId), "utf8"),
  ) as RunRecord;
}

function review(status: ReviewEntry["status"], reason = "checked"): ReviewEntry {
  return { status, reason, reviewer: { kind: "human", name: "tester" } };
}

describe("applyReview", () => {
  it("turns a supported native review into observed and a gap into gap", () => {
    const root = mkdtempSync(join(temporary, "native-"));
    const variant: Variant = "native";
    const environment = "base";
    writeSnapshot(root, variant, environment, [
      makeRecord(variant, environment, "cap-observed"),
      makeRecord(variant, environment, "cap-gap"),
      makeRecord(variant, environment, "cap-blocked", {
        verdict: { variant: "native", status: "blocked", reason: "startup conflict" },
      }),
    ]);
    writeReview(root, variant, environment, {
      "cap-observed": review("supported"),
      "cap-gap": review("gap"),
      "cap-blocked": review("supported"),
    });

    const { updated } = applyReview({ variant, environment, root });
    expect(updated).toEqual(["cap-blocked", "cap-gap", "cap-observed"]);

    const observed = readRecord(root, variant, environment, "cap-observed");
    expect(observed.verdict.status).toBe("observed");
    expect(observed.semanticReview.status).toBe("supported");
    // Fields other than semanticReview and verdict are preserved.
    expect(observed.capturedAt).toBe("2026-11-11T00:00:00.000Z");

    expect(readRecord(root, variant, environment, "cap-gap").verdict.status).toBe("gap");

    // A startup-conflict block survives the review untouched.
    const blocked = readRecord(root, variant, environment, "cap-blocked");
    expect(blocked.verdict).toEqual({
      variant: "native",
      status: "blocked",
      reason: "startup conflict",
    });
    expect(blocked.semanticReview.status).toBe("supported");

    // Written as 2-space JSON with a trailing newline.
    const text = readFileSync(recordPath(root, variant, environment, "cap-observed"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "scenarioId"');

    expect(checkReview({ variant, environment, root }).ok).toBe(true);
  });

  it("verifies a supported adapted review and refuses a gap or a mechanical failure", () => {
    const root = mkdtempSync(join(temporary, "adapted-"));
    const variant: Variant = "adapted";
    const environment = "base";
    writeSnapshot(root, variant, environment, [
      makeRecord(variant, environment, "cap-verified"),
      makeRecord(variant, environment, "cap-gap"),
      makeRecord(variant, environment, "cap-fail", { mechanicalFailures: ["assertion failed"] }),
    ]);
    writeReview(root, variant, environment, {
      "cap-verified": review("supported"),
      "cap-gap": review("gap"),
      "cap-fail": review("supported"),
    });

    applyReview({ variant, environment, root });

    expect(readRecord(root, variant, environment, "cap-verified").verdict.status).toBe("verified");
    expect(readRecord(root, variant, environment, "cap-gap").verdict.status).toBe("not-verified");
    const failed = readRecord(root, variant, environment, "cap-fail");
    expect(failed.verdict.status).toBe("not-verified");
    expect((failed.verdict as { failures?: string[] }).failures).toContain("assertion failed");
  });

  it("keeps an adapted execution block when review says supported", () => {
    const root = mkdtempSync(join(temporary, "adapted-blocked-"));
    const variant: Variant = "adapted";
    const environment = "base";
    writeSnapshot(root, variant, environment, [
      makeRecord(variant, environment, "cap-blocked", {
        blockedReason: "scenario execution failed",
        verdict: {
          variant: "adapted",
          status: "inconclusive",
          reason: "scenario execution failed",
        },
      }),
    ]);
    writeReview(root, variant, environment, {
      "cap-blocked": review("supported"),
    });

    applyReview({ variant, environment, root });

    const blocked = readRecord(root, variant, environment, "cap-blocked");
    expect(blocked.verdict).toEqual({
      variant: "adapted",
      status: "inconclusive",
      reason: "scenario execution failed",
    });
    expect(blocked.blockedReason).toBe("scenario execution failed");
    expect(checkReview({ variant, environment, root }).ok).toBe(true);
  });

  it("fails loudly on unknown or missing scenario ids", () => {
    const root = mkdtempSync(join(temporary, "ids-"));
    const variant: Variant = "native";
    const environment = "base";
    writeSnapshot(root, variant, environment, [makeRecord(variant, environment, "cap-a")]);

    writeReview(root, variant, environment, {
      "cap-a": review("supported"),
      "cap-ghost": review("supported"),
    });
    expect(() => applyReview({ variant, environment, root })).toThrow(
      /unknown scenarios: cap-ghost/,
    );

    writeReview(root, variant, environment, {});
    expect(() => applyReview({ variant, environment, root })).toThrow(/no review entry: cap-a/);
  });
});

describe("checkReview", () => {
  it("reports a record that is still pending", () => {
    const root = mkdtempSync(join(temporary, "pending-"));
    const variant: Variant = "native";
    const environment = "base";
    writeSnapshot(root, variant, environment, [makeRecord(variant, environment, "cap-a")]);
    writeReview(root, variant, environment, { "cap-a": review("supported") });

    const result = checkReview({ variant, environment, root });
    expect(result.ok).toBe(false);
    expect(result.problems.some((problem) => problem.includes("pending"))).toBe(true);
  });

  it("reports mismatched review and record scenario ids", () => {
    const root = mkdtempSync(join(temporary, "mismatch-"));
    const variant: Variant = "native";
    const environment = "base";
    writeSnapshot(root, variant, environment, [
      makeRecord(variant, environment, "cap-a"),
      makeRecord(variant, environment, "cap-b"),
    ]);
    writeReview(root, variant, environment, {
      "cap-a": review("supported"),
      "cap-c": review("supported"),
    });

    const result = checkReview({ variant, environment, root });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("review.json references unknown scenario cap-c");
    expect(result.problems).toContain("record cap-b has no review entry");
  });

  it("reports a verdict changed without applying the review", () => {
    const root = mkdtempSync(join(temporary, "verdict-"));
    const variant: Variant = "adapted";
    const environment = "base";
    writeSnapshot(root, variant, environment, [
      makeRecord(variant, environment, "cap-a", {
        verdict: { variant: "adapted", status: "verified" },
        semanticReview: {
          status: "supported",
          reason: "checked",
          reviewer: { kind: "human", name: "tester" },
        },
        mechanicalFailures: ["assertion failed"],
      }),
    ]);
    writeReview(root, variant, environment, { "cap-a": review("supported") });

    const result = checkReview({ variant, environment, root });
    expect(result.ok).toBe(false);
    expect(result.problems.some((problem) => problem.includes("verdict does not match"))).toBe(
      true,
    );
  });
});
