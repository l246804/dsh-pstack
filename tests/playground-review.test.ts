import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { applyReview, checkReview } from "../playground/scripts/review.ts";
import type { ReviewEntry } from "../playground/scripts/lib/review.ts";
import {
  checkStatusTable,
  statusTableContent,
  writeStatusTable,
} from "../playground/scripts/status-table.ts";
import type { Phase, RunRecord, Verdict } from "../playground/types.ts";

const temporary = mkdtempSync(join(tmpdir(), "pstack-review-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function snapshotDir(root: string, phase: Phase, environment: string): string {
  return join(root, `${phase}-${environment}`);
}

function recordDir(
  root: string,
  phase: Phase,
  environment: string,
  scenarioId: string,
): string {
  return join(snapshotDir(root, phase, environment), "scenarios", scenarioId, `${phase}-${environment}`);
}

function recordPath(
  root: string,
  phase: Phase,
  environment: string,
  scenarioId: string,
): string {
  return join(recordDir(root, phase, environment, scenarioId), "record.json");
}

function makeRecord(
  phase: Phase,
  environment: string,
  scenarioId: string,
  overrides: Partial<RunRecord> = {},
): RunRecord {
  const verdict: Verdict =
    phase === "raw"
      ? { phase: "raw", status: "unobserved", reason: "pending" }
      : { phase: "adapted", status: "inconclusive", reason: "pending" };
  return {
    scenarioId,
    phase,
    environment: {
      worker: 0,
      dshVersion: "test-dsh",
      adaptedVersion: phase === "raw" ? null : "test-adapted",
      matrix: { id: environment, description: "test", kind: "base", enabledPluginPackages: [] },
      upstreamRevision: "test-upstream",
      configHash: "test-hash",
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
  phase: Phase,
  environment: string,
  records: RunRecord[],
): void {
  for (const record of records) {
    const dir = recordDir(root, phase, environment, record.scenarioId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
  }
}

function writeReview(
  root: string,
  phase: Phase,
  environment: string,
  entries: Record<string, ReviewEntry>,
): void {
  const dir = snapshotDir(root, phase, environment);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "review.json"), `${JSON.stringify(entries, null, 2)}\n`);
}

function readRecord(
  root: string,
  phase: Phase,
  environment: string,
  scenarioId: string,
): RunRecord {
  return JSON.parse(readFileSync(recordPath(root, phase, environment, scenarioId), "utf8")) as RunRecord;
}

function review(status: ReviewEntry["status"], reason = "checked"): ReviewEntry {
  return { status, reason, reviewer: { kind: "human", name: "tester" } };
}

describe("applyReview", () => {
  it("turns a supported raw review into observed and a gap into gap", () => {
    const root = mkdtempSync(join(temporary, "raw-"));
    const phase: Phase = "raw";
    const environment = "base";
    writeSnapshot(root, phase, environment, [
      makeRecord(phase, environment, "cap-observed"),
      makeRecord(phase, environment, "cap-gap"),
      makeRecord(phase, environment, "cap-blocked", {
        verdict: { phase: "raw", status: "blocked", reason: "startup conflict" },
      }),
    ]);
    writeReview(root, phase, environment, {
      "cap-observed": review("supported"),
      "cap-gap": review("gap"),
      "cap-blocked": review("supported"),
    });

    const { updated } = applyReview({ phase, environment, root });
    expect(updated).toEqual(["cap-blocked", "cap-gap", "cap-observed"]);

    const observed = readRecord(root, phase, environment, "cap-observed");
    expect(observed.verdict.status).toBe("observed");
    expect(observed.semanticReview.status).toBe("supported");
    // Fields other than semanticReview and verdict are preserved.
    expect(observed.capturedAt).toBe("2026-11-11T00:00:00.000Z");
    expect(observed.environment.configHash).toBe("test-hash");

    expect(readRecord(root, phase, environment, "cap-gap").verdict.status).toBe("gap");

    // A startup-conflict block survives the review untouched.
    const blocked = readRecord(root, phase, environment, "cap-blocked");
    expect(blocked.verdict).toEqual({
      phase: "raw",
      status: "blocked",
      reason: "startup conflict",
    });
    expect(blocked.semanticReview.status).toBe("supported");

    // Written as 2-space JSON with a trailing newline.
    const text = readFileSync(recordPath(root, phase, environment, "cap-observed"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "scenarioId"');

    expect(checkReview({ phase, environment, root }).ok).toBe(true);
  });

  it("verifies a supported adapted review and refuses a gap or a mechanical failure", () => {
    const root = mkdtempSync(join(temporary, "adapted-"));
    const phase: Phase = "adapted";
    const environment = "base";
    writeSnapshot(root, phase, environment, [
      makeRecord(phase, environment, "cap-verified"),
      makeRecord(phase, environment, "cap-gap"),
      makeRecord(phase, environment, "cap-fail", { mechanicalFailures: ["assertion failed"] }),
    ]);
    writeReview(root, phase, environment, {
      "cap-verified": review("supported"),
      "cap-gap": review("gap"),
      "cap-fail": review("supported"),
    });

    applyReview({ phase, environment, root });

    expect(readRecord(root, phase, environment, "cap-verified").verdict.status).toBe("verified");
    expect(readRecord(root, phase, environment, "cap-gap").verdict.status).toBe("not-verified");
    const failed = readRecord(root, phase, environment, "cap-fail");
    expect(failed.verdict.status).toBe("not-verified");
    expect((failed.verdict as { failures?: string[] }).failures).toContain("assertion failed");
  });

  it("fails loudly on unknown or missing scenario ids", () => {
    const root = mkdtempSync(join(temporary, "ids-"));
    const phase: Phase = "raw";
    const environment = "base";
    writeSnapshot(root, phase, environment, [makeRecord(phase, environment, "cap-a")]);

    writeReview(root, phase, environment, {
      "cap-a": review("supported"),
      "cap-ghost": review("supported"),
    });
    expect(() => applyReview({ phase, environment, root })).toThrow(/unknown scenarios: cap-ghost/);

    writeReview(root, phase, environment, {});
    expect(() => applyReview({ phase, environment, root })).toThrow(
      /no review entry: cap-a/,
    );
  });
});

describe("checkReview", () => {
  it("reports a record that is still pending", () => {
    const root = mkdtempSync(join(temporary, "pending-"));
    const phase: Phase = "raw";
    const environment = "base";
    writeSnapshot(root, phase, environment, [makeRecord(phase, environment, "cap-a")]);
    writeReview(root, phase, environment, { "cap-a": review("supported") });

    const result = checkReview({ phase, environment, root });
    expect(result.ok).toBe(false);
    expect(result.problems.some((problem) => problem.includes("pending"))).toBe(true);
  });

  it("reports mismatched review and record scenario ids", () => {
    const root = mkdtempSync(join(temporary, "mismatch-"));
    const phase: Phase = "raw";
    const environment = "base";
    writeSnapshot(root, phase, environment, [
      makeRecord(phase, environment, "cap-a"),
      makeRecord(phase, environment, "cap-b"),
    ]);
    writeReview(root, phase, environment, {
      "cap-a": review("supported"),
      "cap-c": review("supported"),
    });

    const result = checkReview({ phase, environment, root });
    expect(result.ok).toBe(false);
    expect(result.problems).toContain("review.json references unknown scenario cap-c");
    expect(result.problems).toContain("record cap-b has no review entry");
  });
});

describe("status table", () => {
  it("renders one row per record and detects a stale status.md", () => {
    const root = mkdtempSync(join(temporary, "status-"));
    const phase: Phase = "raw";
    const environment = "base";
    writeSnapshot(root, phase, environment, [
      makeRecord(phase, environment, "cap-alpha"),
      makeRecord(phase, environment, "cap-beta", {
        mechanicalFailures: ["assertion failed", "route differs"],
      }),
    ]);
    const inventoryFile = join(root, "inventory.json");
    writeFileSync(
      inventoryFile,
      `${JSON.stringify({
        capabilities: [{ id: "capability-alpha", probes: { base: "cap-alpha" } }],
      })}\n`,
    );
    const target = { phase, environment, root, inventoryFile };

    const content = statusTableContent(target);
    const lines = content.split("\n");
    expect(lines[0]).toBe("<!-- generated by playground:status, do not edit -->");
    // The table is the header row, the separator row, then one row per record.
    const dataRows = lines.filter((line) => line.startsWith("|")).slice(2);
    expect(dataRows).toHaveLength(2);
    expect(content).toContain("| capability-alpha | cap-alpha | unobserved | 0 |");
    expect(content).toContain(
      "| cap-beta | cap-beta | unobserved | 2 | [record.json](scenarios/cap-beta/raw-base/record.json)",
    );

    const { file } = writeStatusTable(target);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toBe(content);
    expect(checkStatusTable(target).ok).toBe(true);

    // Changing a record makes the committed table stale.
    const changed = JSON.parse(readFileSync(recordPath(root, phase, environment, "cap-alpha"), "utf8"));
    changed.verdict.status = "gap";
    writeFileSync(
      recordPath(root, phase, environment, "cap-alpha"),
      `${JSON.stringify(changed, null, 2)}\n`,
    );
    expect(checkStatusTable(target).ok).toBe(false);
  });
});
