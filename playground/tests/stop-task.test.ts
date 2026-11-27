import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { setRuntimeSettings } from "../runner/config/runtime.ts";
import { stopWorkerTask } from "../runner/execution/stop-task.ts";
import { bootstrapReadyFile, stopRequestFile, workerPaths } from "../runner/worker/worker.ts";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  setRuntimeSettings(undefined);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(fail: boolean) {
  mkdirSync(".tmp", { recursive: true });
  const root = mkdtempSync(resolve(".tmp/stop-task-"));
  directories.push(root);
  const docker = join(root, "docker.cjs");
  const calls = join(root, "calls.jsonl");
  writeFileSync(
    docker,
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const log = process.env.STOP_TASK_TEST_CALLS;
fs.appendFileSync(log, JSON.stringify(args) + '\\n');
if (args[0] === 'stop' && process.env.STOP_TASK_TEST_FAIL === 'yes') process.exit(1);
`,
    { mode: 0o755 },
  );
  vi.stubEnv("STOP_TASK_TEST_CALLS", calls);
  vi.stubEnv("STOP_TASK_TEST_FAIL", fail ? "yes" : "no");
  setRuntimeSettings({
    scenarioTimeoutMs: 600_000,
    turnTimeoutMs: 180_000,
    subagentTimeoutMs: 600_000,
    networkMode: "host",
    workerPortBase: 8080,
    workerCapacity: { coreHeadroom: 2, memoryFraction: 0.7, memoryPerWorkerGB: 1 },
    workspaceRoot: join(root, "workspace"),
    workersDir: join(root, "workers"),
    dockerBin: docker,
    dshBin: "dsh",
    vpxBin: "vpx",
    pnpmBin: "pnpm",
  });
  const paths = workerPaths(0, "base", "adapted");
  const sibling = workerPaths(1, "base", "adapted");
  for (const worker of [paths, sibling]) {
    mkdirSync(worker.root, { recursive: true });
    writeFileSync(worker.urlFile, "http://localhost:8080");
  }
  const ready = bootstrapReadyFile("base", "adapted");
  writeFileSync(ready, "{}");
  return { paths, sibling, ready, calls };
}

describe("stop worker task", () => {
  it("stops only the selected worker and invalidates its URL and readiness", () => {
    const { paths, sibling, ready, calls } = fixture(false);
    stopWorkerTask(paths);
    expect(
      readFileSync(calls, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      ["stop", "-t", "10", paths.containerName],
      ["rm", "-f", paths.containerName],
    ]);
    expect(existsSync(stopRequestFile(paths))).toBe(true);
    expect(existsSync(paths.urlFile)).toBe(false);
    expect(existsSync(ready)).toBe(false);
    expect(existsSync(sibling.urlFile)).toBe(true);
    expect(existsSync(stopRequestFile(sibling))).toBe(false);
  });

  it("reports an unconfirmed stop instead of claiming cancellation succeeded", () => {
    const { paths, ready } = fixture(true);
    expect(() => stopWorkerTask(paths)).toThrow("could not confirm");
    expect(existsSync(stopRequestFile(paths))).toBe(true);
    expect(existsSync(ready)).toBe(false);
  });
});
