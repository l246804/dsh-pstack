import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Variant } from "../types.ts";
import { readRunRecords } from "../evidence/run-record.ts";
import { computeWorkers } from "../worker/capacity.ts";
import { environmentMatrix } from "../scenario/environments.ts";
import { REPOSITORY_ROOT, workersDirectory } from "../shared/paths.ts";
import {
  formatTimestamp,
  progressFilePath,
  readProgress,
  updateProgress,
  writeProgress,
  type ProgressState,
} from "../worker/progress.ts";
import { acquireBatchLock, writeBatchMetadata, type BatchMetadata } from "../worker/batch.ts";
import {
  currentTaskFile,
  listWorkers,
  stopRequestFile,
  type WorkerPaths,
} from "../worker/worker.ts";
import { stopWorkerTask } from "./stop-task.ts";
import { runtimeSettings } from "../config/runtime.ts";

interface ChildResult {
  code: number | null;
  output: string;
}

function runCase(args: string[], env: NodeJS.ProcessEnv, paths: WorkerPaths): Promise<ChildResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(runtimeSettings().vpxBin, args, {
      cwd: REPOSITORY_ROOT,
      env,
      detached: true,
    });
    let output = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolvePromise({ code, output });
    };
    timer = setTimeout(() => {
      output += "run-scenario exceeded its wall-clock budget";
      try {
        stopWorkerTask(paths);
      } catch (error) {
        output += `; ${error instanceof Error ? error.message : String(error)}`;
      }
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
      finish(-1);
    }, runtimeSettings().scenarioTimeoutMs + 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      output += error.message;
      finish(-1);
    });
    // agent-browser may leave its detached daemon holding inherited pipes; `exit`
    // is the child contract, while `close` can wait forever on those pipes.
    child.on("exit", (code) => finish(code));
    child.on("close", (code) => finish(code));
  });
}

export interface BatchInput {
  variant: Variant;
  environment: string;
  scenarioIds: readonly string[];
  round?: number;
}
export interface BatchResult {
  progress: ProgressState;
  progressFile: string;
  logFile: string;
  notRun: string[];
}
export async function runBatch(input: BatchInput): Promise<BatchResult> {
  const { variant } = input;
  const matrix = environmentMatrix(input.environment);
  const ids = [...new Set(input.scenarioIds)];
  if (ids.length === 0) throw new Error("no scenarios selected");
  const prepared = listWorkers({ environmentId: matrix.id, variant })
    .filter((paths) => !existsSync(stopRequestFile(paths)))
    .sort((left, right) => left.index - right.index)
    .slice(0, computeWorkers(ids.length).workers);
  if (prepared.length === 0) throw new Error("no prepared workers; run playground:prepare first");
  const pending = [...ids];
  const file = progressFilePath(matrix.id, variant);
  const round = input.round ?? (readProgress(file)?.round ?? 0) + 1;
  if (!Number.isInteger(round) || round < 1) throw new Error("--round must be positive");
  const batch: BatchMetadata = {
    batchId: randomUUID(),
    variant,
    environment: matrix.id,
    scope: ids,
    startedAt: new Date().toISOString(),
  };
  const releaseBatch = acquireBatchLock(batch);
  try {
    const state: ProgressState = {
      variant,
      environmentId: matrix.id,
      round,
      total: ids.length,
      done: 0,
      statuses: { completed: 0, failed: 0, blocked: 0 },
      running: [],
      startedAt: formatTimestamp(),
      updatedAt: formatTimestamp(),
      perWorker: Object.fromEntries(
        prepared.map(({ index }) => [`w${index}`, { done: 0, total: 0 }]),
      ),
      failures: [],
      workers: prepared.length,
    };
    writeProgress(file, state);

    mkdirSync(join(workersDirectory(), variant, matrix.id), { recursive: true });
    const logFile = join(workersDirectory(), variant, matrix.id, "batch.log");
    writeFileSync(logFile, `variant=${variant} environment=${matrix.id} round=${round}\n`);
    writeBatchMetadata(batch);
    const outcomes = await Promise.allSettled(
      prepared.map(async (workerPathsForTask) => {
        const worker = workerPathsForTask.index;
        try {
          while (true) {
            if (
              !existsSync(workerPathsForTask.urlFile) ||
              existsSync(stopRequestFile(workerPathsForTask))
            )
              return;
            const scenarioId = pending.shift();
            if (scenarioId === undefined) return;
            updateProgress(file, (current) => {
              current.running.push({ worker, scenarioId });
              const perWorker = current.perWorker[`w${worker}`];
              if (perWorker) perWorker.total += 1;
            });
            const taskFile = currentTaskFile(workerPathsForTask);
            writeFileSync(
              taskFile,
              `${JSON.stringify({ scenarioId, startedAt: new Date().toISOString(), batchId: batch.batchId }, null, 2)}\n`,
            );
            const args = [
              "playground/runner/cli/run-scenario.ts",
              "--worker",
              String(worker),
              "--scenario",
              scenarioId,
              "--variant",
              variant,
              "--environment",
              matrix.id,
            ];
            const result = await runCase(args, process.env, workerPathsForTask);
            rmSync(taskFile, { force: true });
            appendFileSync(
              logFile,
              `\n===== ${scenarioId} ${variant} ${matrix.id} exit=${String(result.code)} =====\n${result.output}\n`,
            );
            const records = readRunRecords(
              join(workersDirectory(), variant, matrix.id, `w${worker}/evidence`),
            );
            const record = records.find(
              (entry) =>
                entry.scenarioId === scenarioId &&
                entry.variant === variant &&
                entry.batchId === batch.batchId,
            );
            const status = record?.status ?? "blocked";
            const failureReason =
              record === undefined
                ? `run-scenario exited ${String(result.code)} without a record`
                : (record.blockedReason ?? record.mechanicalFailures.join("; "));
            updateProgress(file, (current) => {
              current.running = current.running.filter(
                (entry) => !(entry.worker === worker && entry.scenarioId === scenarioId),
              );
              current.done += 1;
              current.statuses[status] += 1;
              const perWorker = current.perWorker[`w${worker}`];
              if (perWorker) perWorker.done += 1;
              if (status !== "completed") {
                current.failures.push({
                  scenarioId,
                  worker,
                  reason: failureReason,
                });
              }
            });
          }
        } catch (error) {
          updateProgress(file, (current) => {
            const task = current.running.find((entry) => entry.worker === worker);
            if (!task) return;
            current.running = current.running.filter((entry) => entry.worker !== worker);
            current.done += 1;
            current.statuses.blocked += 1;
            const perWorker = current.perWorker[`w${worker}`];
            if (perWorker) perWorker.done += 1;
            current.failures.push({ scenarioId: task.scenarioId, worker, reason: String(error) });
          });
          throw error;
        }
      }),
    );
    const errors = outcomes.filter((outcome) => outcome.status === "rejected");
    if (errors.length > 0) {
      throw new AggregateError(
        errors.map((error) => error.reason),
        errors.map((error) => String(error.reason)).join("; "),
      );
    }
    const progress = readProgress(file)!;
    return { progress, progressFile: file, logFile, notRun: pending };
  } finally {
    releaseBatch();
  }
}
