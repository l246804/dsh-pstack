import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";

import {
  formatTimestamp,
  updateProgress,
  writeProgress,
  type ProgressState,
} from "../playground/scripts/lib/progress.ts";

const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const temporary = mkdtempSync(join(tmpdir(), "pstack-progress-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function state(startedAt: string, updatedAt: string): ProgressState {
  return {
    phase: "raw",
    environmentId: "base",
    round: 1,
    total: 2,
    done: 0,
    statuses: {
      observed: 0,
      gap: 0,
      blocked: 0,
      unobserved: 0,
      verified: 0,
      "not-verified": 0,
      inconclusive: 0,
    },
    running: [],
    startedAt,
    updatedAt,
    perWorker: {},
    failures: [],
    workers: 1,
  };
}

describe("formatTimestamp", () => {
  it("renders the human-readable timestamp format", () => {
    expect(formatTimestamp()).toMatch(timestampPattern);
  });

  it("zero-pads every field from a local Date", () => {
    expect(formatTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02 03:04:05");
  });
});

describe("ProgressState timestamps", () => {
  it("persists readable timestamps through the JSON file", () => {
    const file = join(temporary, "persist-progress.json");
    const stamp = formatTimestamp(new Date(2026, 0, 2, 3, 4, 5));
    writeProgress(file, state(stamp, stamp));

    const written = JSON.parse(readFileSync(file, "utf8")) as ProgressState;
    expect(written.startedAt).toBe("2026-01-02 03:04:05");
    expect(written.updatedAt).toBe("2026-01-02 03:04:05");
    expect(written.startedAt).toMatch(timestampPattern);
    expect(written.updatedAt).toMatch(timestampPattern);
  });

  it("refreshes updatedAt and keeps startedAt on update", () => {
    const file = join(temporary, "update-progress.json");
    writeProgress(file, state("2026-01-02 03:04:05", "2000-01-01 00:00:00"));

    updateProgress(file, (current) => {
      current.done = 1;
    });

    const updated = JSON.parse(readFileSync(file, "utf8")) as ProgressState;
    expect(updated.done).toBe(1);
    expect(updated.startedAt).toBe("2026-01-02 03:04:05");
    expect(updated.updatedAt).toMatch(timestampPattern);
    expect(updated.updatedAt).not.toBe("2000-01-01 00:00:00");
  });
});
