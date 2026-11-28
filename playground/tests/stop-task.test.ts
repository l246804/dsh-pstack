import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { setRuntimeSettings } from "../runner/config/runtime.ts";
import { DockerSandbox } from "../runner/container/docker.ts";
import { stopWorkerTask } from "../runner/execution/stop-task.ts";
import { bootstrapReadyFile, stopRequestFile, workerPaths } from "../runner/worker/worker.ts";

vi.mock("../runner/container/image.ts", () => ({ requireImage: () => "fixture" }));

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  setRuntimeSettings(undefined);
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(failure: "none" | "stop" | "all" | "missing" | "start" = "none") {
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
const failure = process.env.STOP_TASK_TEST_FAIL;
if (failure === 'all' || (args[0] === 'stop' && ['stop', 'missing'].includes(failure)) || (args[0] === 'rm' && failure === 'missing') || (args[0] === 'run' && failure === 'start')) {
  process.stderr.write('fixture Docker failure');
  process.exit(1);
}
if (args[0] === 'logs') process.stdout.write('dsh web: http://localhost:8080');
`,
    { mode: 0o755 },
  );
  vi.stubEnv("STOP_TASK_TEST_CALLS", calls);
  vi.stubEnv("STOP_TASK_TEST_FAIL", failure);
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
    const { paths, sibling, ready, calls } = fixture();
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
    const { paths, ready } = fixture("all");
    expect(() => stopWorkerTask(paths)).toThrow("could not confirm");
    expect(existsSync(stopRequestFile(paths))).toBe(true);
    expect(existsSync(ready)).toBe(false);
    expect(existsSync(paths.urlFile)).toBe(true);
  });

  it("accepts forced removal when graceful stop fails", () => {
    const { paths } = fixture("stop");
    expect(() => stopWorkerTask(paths)).not.toThrow();
    expect(existsSync(paths.urlFile)).toBe(false);
  });

  it("clears a stale URL after confirming the container is already absent", () => {
    const { paths } = fixture("missing");
    expect(() => stopWorkerTask(paths)).not.toThrow();
    expect(existsSync(paths.urlFile)).toBe(false);
  });

  it.each(["none", "start"] as const)(
    "clears the stop request only after a successful restart (%s)",
    async (failure) => {
      const { paths } = fixture(failure);
      stopWorkerTask(paths);
      const start = () =>
        new DockerSandbox().start(
          paths,
          {
            providers: {},
            main: { provider: "fixture", model: "fixture", effort: "low" },
          },
          "host",
          8080,
        );
      if (failure === "start") {
        expect(start).toThrow("docker run failed");
        expect(existsSync(stopRequestFile(paths))).toBe(true);
        expect(existsSync(paths.urlFile)).toBe(false);
      } else {
        await expect(start()).resolves.toMatchObject({ port: 8080 });
        expect(existsSync(stopRequestFile(paths))).toBe(false);
        expect(existsSync(paths.urlFile)).toBe(true);
      }
    },
  );
});
