import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { collectScreenshots, selectRecords } from "../runner/evidence/collect.ts";
import { parseRunRecord } from "../runner/evidence/run-record.ts";
import type { RunRecord } from "../runner/types.ts";

mkdirSync(".tmp", { recursive: true });
const temporary = mkdtempSync(join(".tmp", "playground-collect-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function record(id: string, batchId = "batch"): RunRecord {
  return {
    scenarioId: id,
    variant: "native",
    environment: {
      worker: 0,
      dshVersion: "runtime-a",
      pstackVersion: "upstream-a",
      upstreamRevision: "revision-a",
      matrix: { id: "base", kind: "base", description: "test", enabledPluginPackages: [] },
    },
    target: null,
    session: null,
    artifacts: { recordFile: "local-record.json" },
    mechanicalFailures: [],
    status: "completed",
    capturedAt: "2026-11-27T00:00:00.000Z",
    batchId,
  };
}

function withImage(entry: RunRecord, text = "image"): RunRecord {
  const screenshotFile = join(temporary, `${entry.scenarioId}-${entry.batchId}.png`);
  writeFileSync(screenshotFile, text);
  return { ...entry, artifacts: { ...entry.artifacts, screenshotFile } };
}

describe("screenshot collection", () => {
  it("exports only selected images, preserving authored conclusions and other results across versions", () => {
    const root = join(temporary, "incremental");
    const first = withImage(record("first"), "first image");
    const untouched = withImage(record("untouched"), "untouched image");
    collectScreenshots([first, untouched], root);
    const result = join(root, "first/result.md");
    writeFileSync(result, "approved conclusion");
    const updated = withImage(
      {
        ...record("first", "next"),
        environment: { ...first.environment, dshVersion: "runtime-b", pstackVersion: "upstream-b" },
      },
      "new image",
    );

    collectScreenshots([updated], root);

    expect(readFileSync(join(root, "first/native-base.png"), "utf8")).toBe("new image");
    expect(readFileSync(join(root, "untouched/native-base.png"), "utf8")).toBe("untouched image");
    expect(readFileSync(result, "utf8")).toBe("approved conclusion");
    expect(readdirSync(join(root, "first")).sort()).toEqual(["native-base.png", "result.md"]);
    expect(readdirSync(join(root, "untouched"))).toEqual(["native-base.png"]);
  });

  it("requires every selected scenario's own current batch record", () => {
    const older = record("probe", "previous");
    expect(() => selectRecords([older], "native", "base", ["probe"], "current")).toThrow(
      "no record for probe in batch current",
    );
    const current = record("probe", "current");
    const later = { ...older, capturedAt: "2026-11-28T00:00:00.000Z" };
    expect(selectRecords([later, current], "native", "base", ["probe"], "current")).toEqual([
      current,
    ]);
    expect(selectRecords([current, later], "native", "base", ["probe"])).toEqual([later]);
    expect(() => selectRecords([current], "adapted", "base", ["probe"])).toThrow("no record");
    expect(() => selectRecords([current], "native", "render", ["probe"])).toThrow("no record");
    expect(() => selectRecords([current], "native", "base", ["probe", "missing"])).toThrow(
      "missing",
    );
  });

  it("checks missing screenshots before replacing any selected image", () => {
    const root = join(temporary, "missing");
    collectScreenshots([withImage(record("existing"), "original")], root);
    const next = withImage(record("existing", "next"), "replacement");
    expect(() => collectScreenshots([next, record("missing")], root)).toThrow("missing screenshot");
    expect(readFileSync(join(root, "existing/native-base.png"), "utf8")).toBe("original");
  });

  it("removes a superseded screenshot when a blocked attempt produced none", () => {
    const root = join(temporary, "blocked");
    collectScreenshots([withImage(record("blocked"))], root);
    writeFileSync(join(root, "blocked/result.md"), "previous analysis");
    const blocked: RunRecord = {
      ...record("blocked"),
      status: "blocked",
      blockedReason: "startup failed",
    };
    expect(collectScreenshots([blocked], root)).toEqual([]);
    expect(readdirSync(join(root, "blocked"))).toEqual(["result.md"]);
  });

  it("keeps failed assertions in local records and still collects their screenshots", () => {
    const failed = withImage({
      ...record("failed"),
      status: "failed",
      mechanicalFailures: ["unexpected write"],
    });
    expect(parseRunRecord(failed, "local.json").mechanicalFailures).toEqual(["unexpected write"]);
    expect(collectScreenshots([failed], join(temporary, "failed"))).toHaveLength(1);
  });
});
