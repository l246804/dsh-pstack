import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import type { Variant } from "../types.ts";
import { readRunRecords } from "../evidence/run-record.ts";
import { computeWorkers } from "../worker/capacity.ts";
import { environmentMatrix, REPOSITORY_ROOT, workersDirectory } from "../worker/run-metadata.ts";
import {
  formatTimestamp,
  progressFilePath,
  readProgress,
  updateProgress,
  writeProgress,
  type ProgressState,
} from "../worker/progress.ts";
import { listScenarioIds, loadScenario } from "../scenario/scenarios.ts";
import { DEFAULT_ENVIRONMENTS, DEFAULT_VARIANTS } from "../scenario/defaults.ts";
import { acquireBatchLock, writeBatchMetadata, type BatchMetadata } from "../worker/batch.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";
import {
  currentTaskFile,
  listWorkers,
  stopRequestFile,
  type WorkerPaths,
} from "../worker/worker.ts";
import { stopWorkerTask } from "../execution/stop-task.ts";
import { runtimeSettings } from "../config/runtime.ts";

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

function selectedScenarios(variant: Variant, environmentId: string): string[] {
  const ids = argValue("--scenarios");
  const full = process.argv.includes("--full");
  if (full === (ids !== undefined)) throw new Error("pass --full or --scenarios <ids>");
  if (ids !== undefined) return parseList(ids);
  return listScenarioIds().filter((id) => {
    const scenario = loadScenario(id);
    return (
      (scenario.variants ?? DEFAULT_VARIANTS).includes(variant) &&
      (scenario.environments ?? DEFAULT_ENVIRONMENTS).includes(environmentId)
    );
  });
}

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

export async function main(): Promise<void> {
  await readPlaygroundConfig(CONFIG_FILE);
  if (listScenarioIds().length === 0) {
    throw new Error("no scenarios are registered; add a scenario first");
  }
  const variant = argValue("--variant") as Variant | undefined;
  if (!isVariant(variant)) {
    throw new Error(
      "usage: run-batch.ts --variant native|adapted --environment ID [--full|--scenarios a,b] [--round N]",
    );
  }
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  const ids = selectedScenarios(variant, matrix.id);
  if (argValue("--scenarios") !== undefined) {
    const offenders = ids.filter((id) => {
      const scenario = loadScenario(id);
      const variants = scenario.variants ?? DEFAULT_VARIANTS;
      const environments = scenario.environments ?? DEFAULT_ENVIRONMENTS;
      return !variants.includes(variant) || !environments.includes(matrix.id);
    });
    if (offenders.length > 0) {
      throw new Error(
        `--scenarios ids not allowed in ${variant}-${matrix.id}: ${offenders.join(", ")}`,
      );
    }
  }
  if (ids.length === 0) {
    console.log("[run-batch] no scenarios selected");
    return;
  }
  const prepared = listWorkers({ environmentId: matrix.id, variant })
    .filter((paths) => !existsSync(stopRequestFile(paths)))
    .sort((left, right) => left.index - right.index)
    .slice(0, computeWorkers(ids.length).workers);
  if (prepared.length === 0) throw new Error("no prepared workers; run playground:prepare first");
  const pending = [...ids];
  const roundFlag = argValue("--round");
  const file = progressFilePath(matrix.id, variant);
  const round = roundFlag ? Number(roundFlag) : (readProgress(file)?.round ?? 0) + 1;
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
    console.log(`[run-batch] progress=${file}`);
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
            console.log(`[run-batch] ${scenarioId} ${variant} ${matrix.id} ${status}`);
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
    console.log(`[run-batch] log=${logFile}`);
    const finalState = readProgress(file);
    if (pending.length > 0) {
      console.error(
        `[run-batch] workers stopped; ${pending.length} scenario(s) were not run: ${pending.join(", ")}`,
      );
      process.exitCode = 1;
    }
    if ((finalState?.failures.length ?? 0) > 0) {
      console.error(`[run-batch] ${finalState?.failures.length ?? 0} scenario(s) failed`);
      process.exitCode = 1;
    }
  } finally {
    releaseBatch();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[run-batch] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
