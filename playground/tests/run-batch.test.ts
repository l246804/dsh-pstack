import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { runBatch } from "../runner/execution/batch.ts";
import { setRuntimeSettings } from "../runner/config/runtime.ts";
import { batchLockFile, readBatchMetadata } from "../runner/worker/batch.ts";
import { progressFilePath, readProgress } from "../runner/worker/progress.ts";
import { currentTaskFile, stopRequestFile, workerPaths } from "../runner/worker/worker.ts";
import type { RunRecord } from "../runner/types.ts";

vi.mock("../runner/worker/capacity.ts", () => ({
  computeWorkers: (count: number) => ({ workers: Math.min(2, count) }),
}));

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setRuntimeSettings(undefined);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

type Behavior = "complete" | "missing" | "corrupt" | "wait" | "stop";

function fixture(indices: number[], behaviors: Record<string, Behavior> = {}) {
  mkdirSync(".tmp", { recursive: true });
  const root = mkdtempSync(resolve(".tmp/run-batch-"));
  directories.push(root);
  const executable = join(root, "scenario.cjs");
  const record: RunRecord = {
    scenarioId: "fixture",
    variant: "native",
    environment: {
      worker: 0,
      dshVersion: "fixture",
      pstackVersion: "fixture",
      upstreamRevision: "fixture",
      matrix: { id: "base", kind: "base", description: "fixture", enabledPluginPackages: [] },
    },
    target: null,
    session: null,
    artifacts: { recordFile: "record.json" },
    mechanicalFailures: [],
    status: "completed",
    capturedAt: "2026-11-28T00:00:00.000Z",
  };
  writeFileSync(join(root, "fixture.json"), JSON.stringify({ record, behaviors }));
  writeFileSync(
    executable,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const { record, behaviors } = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixture.json')));
const arg = (flag) => process.argv[process.argv.indexOf(flag) + 1];
const id = arg('--scenario');
const worker = path.join(__dirname, 'workers/native/base/w' + arg('--worker'));
const task = JSON.parse(fs.readFileSync(path.join(worker, 'current-task.json')));
fs.writeFileSync(path.join(__dirname, id + '.started'), '');
const behavior = behaviors[id];
async function run() {
  while (behavior === 'wait' && !fs.existsSync(path.join(__dirname, 'release'))) {
    await new Promise((done) => setTimeout(done, 10));
  }
  if (behavior === 'missing') return;
  if (behavior === 'stop') {
    fs.writeFileSync(path.join(worker, 'stop-request'), '');
    process.exitCode = 2;
    return;
  }
  const directory = path.join(worker, 'evidence');
  fs.mkdirSync(directory, { recursive: true });
  const value = { ...record, scenarioId: id, batchId: task.batchId };
  fs.writeFileSync(path.join(directory, 'record.json'), behavior === 'corrupt' ? '{}' : JSON.stringify(value));
}
run();
`,
    { mode: 0o755 },
  );
  setRuntimeSettings({
    scenarioTimeoutMs: 600_000,
    turnTimeoutMs: 180_000,
    subagentTimeoutMs: 600_000,
    networkMode: "host",
    workerPortBase: 8080,
    workerCapacity: { coreHeadroom: 2, memoryFraction: 0.7, memoryPerWorkerGB: 1 },
    workspaceRoot: join(root, "workspace"),
    workersDir: join(root, "workers"),
    dockerBin: "unused",
    dshBin: "unused",
    vpxBin: executable,
    pnpmBin: "unused",
  });
  for (const index of indices) {
    const paths = workerPaths(index, "base", "native");
    mkdirSync(paths.root, { recursive: true });
    writeFileSync(paths.urlFile, "http://127.0.0.1:1");
  }
  return {
    root,
    run: (ids: string[]) => runBatch({ variant: "native", environment: "base", scenarioIds: ids }),
    progress: () => readProgress(progressFilePath("base", "native")),
  };
}

describe("batch lifecycle", () => {
  it("uses the surviving worker's index after w0 has stopped", async () => {
    const test = fixture([1]);
    await test.run(["first"]);
    expect(test.progress()).toMatchObject({
      done: 1,
      statuses: { completed: 1 },
      perWorker: { w1: { done: 1, total: 1 } },
    });
  });

  it("does not reuse a previous batch's record when a retry starts in the same second", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-28T00:00:00.000Z"));
    const test = fixture([0]);
    await test.run(["first"]);
    const before = readBatchMetadata("native", "base").batchId;
    const file = join(test.root, "fixture.json");
    const data = JSON.parse(readFileSync(file, "utf8"));
    writeFileSync(file, JSON.stringify({ ...data, behaviors: { first: "missing" } }));
    await test.run(["first"]);
    expect(readBatchMetadata("native", "base").batchId).not.toBe(before);
    expect(test.progress()).toMatchObject({ statuses: { completed: 0, blocked: 1 } });
  });

  it("holds the batch lock until the other child exits after a record read fails", async () => {
    const test = fixture([0, 1], { first: "corrupt", second: "wait" });
    let failure: unknown;
    const running = test.run(["first", "second"]).catch((error: unknown) => {
      failure = error;
    });
    try {
      await vi.waitFor(() => expect(existsSync(join(test.root, "second.started"))).toBe(true));
      await vi.waitFor(() =>
        expect(existsSync(currentTaskFile(workerPaths(0, "base", "native")))).toBe(false),
      );
      expect(existsSync(batchLockFile("native", "base"))).toBe(true);
      expect(failure).toBeUndefined();
    } finally {
      writeFileSync(join(test.root, "release"), "");
      await running;
      await vi.waitFor(() =>
        expect(existsSync(currentTaskFile(workerPaths(1, "base", "native")))).toBe(false),
      );
    }
    expect(failure).toBeInstanceOf(Error);
    expect(existsSync(batchLockFile("native", "base"))).toBe(false);
    expect(test.progress()).toMatchObject({
      done: 2,
      running: [],
      statuses: { completed: 1, blocked: 1 },
    });
  });

  it("does not dispatch another scenario after a stop request, even if Docker could not remove the URL", async () => {
    const test = fixture([0], { first: "stop" });
    const result = await test.run(["first", "second"]);
    expect(result.notRun).toEqual(["second"]);
    expect(existsSync(join(test.root, "second.started"))).toBe(false);
    expect(existsSync(stopRequestFile(workerPaths(0, "base", "native")))).toBe(true);
    expect(test.progress()?.done).toBe(1);
  });
});
