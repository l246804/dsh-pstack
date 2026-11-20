import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { isVariant } from "../types.ts";
import type { Variant, RunRecord, Verdict } from "../types.ts";
import { latestRecords } from "../evidence/evidence.ts";
import { computeWorkers } from "../worker/capacity.ts";
import {
  environmentMatrix,
  REPOSITORY_ROOT,
  upstreamRevision,
  workersDirectory,
} from "../worker/run-metadata.ts";
import {
  formatTimestamp,
  progressFilePath,
  readProgress,
  updateProgress,
  writeProgress,
  type ProgressState,
} from "../worker/progress.ts";
import { listScenarioIds, loadScenario } from "../scenario/scenarios.ts";
import { writeBatchMetadata } from "../evidence/review-snapshot.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";
import { currentTaskFile, stopRequestFile, workerCount, workerPaths } from "../worker/worker.ts";

const VPX = "vpx";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

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

function readRecords(directory: string): RunRecord[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return readRecords(file);
    if (!entry.name.endsWith(".json")) return [];
    try {
      const record = JSON.parse(readFileSync(file, "utf8")) as RunRecord;
      return typeof record.scenarioId === "string" && typeof record.variant === "string"
        ? [record]
        : [];
    } catch (error) {
      throw new Error(
        `invalid RunRecord JSON in ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
}

function allRecords(): RunRecord[] {
  return readRecords(workersDirectory());
}

function selectedScenarios(variant: Variant, environmentId: string): string[] {
  const scenarios = argValue("--scenarios");
  const failed = process.argv.includes("--only-failed");
  const full = process.argv.includes("--full");
  if (
    [scenarios, failed ? "failed" : undefined, full ? "full" : undefined].filter(Boolean).length > 1
  ) {
    throw new Error("--full, --scenarios and --only-failed are mutually exclusive");
  }
  if (full) {
    return listScenarioIds().filter((id) => {
      const scenario = loadScenario(id);
      const variantAllowed = scenario.variants === undefined || scenario.variants.includes(variant);
      const environments = scenario.environments ?? ["base"];
      return variantAllowed && environments.includes(environmentId);
    });
  }
  if (scenarios) return parseList(scenarios);
  if (failed) {
    return latestRecords(allRecords())
      .filter(
        (record) => record.variant === variant && record.environment.matrix.id === environmentId,
      )
      .filter((record) =>
        variant === "native"
          ? record.verdict.status === "gap"
          : record.verdict.status === "not-verified",
      )
      .map((record) => record.scenarioId);
  }
  throw new Error("run-batch requires --full, --scenarios <ids>, or --only-failed");
}

interface ChildResult {
  code: number | null;
  output: string;
}

function runCase(args: string[], env: NodeJS.ProcessEnv): Promise<ChildResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(VPX, args, { cwd: REPOSITORY_ROOT, env });
    let output = "";
    let settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      resolvePromise({ code, output });
    };
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

function statuses(): ProgressState["statuses"] {
  return {
    observed: 0,
    gap: 0,
    blocked: 0,
    unobserved: 0,
    verified: 0,
    "not-verified": 0,
    inconclusive: 0,
  };
}

function statusFor(record: RunRecord | undefined, variant: Variant): Verdict["status"] {
  if (record) return record.verdict.status;
  return variant === "native" ? "unobserved" : "inconclusive";
}

async function main(): Promise<void> {
  await readPlaygroundConfig(CONFIG_FILE);
  if (listScenarioIds().length === 0) {
    throw new Error("no scenarios are registered; generate probes first");
  }
  const variant = argValue("--variant") as Variant | undefined;
  if (!isVariant(variant)) {
    throw new Error(
      "usage: run-batch.ts --variant native|adapted --environment ID [--full|--scenarios a,b|--only-failed] [--round N]",
    );
  }
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  const ids = selectedScenarios(variant, matrix.id);
  if (argValue("--scenarios") !== undefined) {
    const offenders = ids.filter((id) => {
      const scenario = loadScenario(id);
      const variants = scenario.variants ?? ["native", "adapted"];
      const environments = scenario.environments ?? ["base"];
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
  const prepared = workerCount(matrix.id, variant);
  if (prepared === 0) throw new Error("no prepared workers; run playground:prepare first");
  const workers = Math.min(computeWorkers(ids.length).workers, prepared);
  const pending = [...ids];
  const roundFlag = argValue("--round");
  const file = progressFilePath(matrix.id, variant);
  const round = roundFlag ? Number(roundFlag) : (readProgress(file)?.round ?? 0) + 1;
  if (!Number.isInteger(round) || round < 1) throw new Error("--round must be positive");
  const state: ProgressState = {
    variant,
    environmentId: matrix.id,
    round,
    total: ids.length,
    done: 0,
    statuses: statuses(),
    running: [],
    startedAt: formatTimestamp(),
    updatedAt: formatTimestamp(),
    perWorker: Object.fromEntries(
      Array.from({ length: workers }, (_, index) => [`w${index}`, { done: 0, total: 0 }]),
    ),
    failures: [],
    workers,
  };
  writeProgress(file, state);
  console.log(`[run-batch] progress=${file}`);
  mkdirSync(join(workersDirectory(), variant, matrix.id), { recursive: true });
  const logFile = join(workersDirectory(), variant, matrix.id, "batch.log");
  writeFileSync(logFile, `variant=${variant} environment=${matrix.id} round=${round}\n`);
  const batchId = `${variant}-${matrix.id}-${formatTimestamp().replace(/[-: ]/g, "")}`;
  const mode = process.argv.includes("--full") ? "full" : "incremental";
  writeBatchMetadata({
    batchId,
    variant,
    environment: matrix.id,
    mode,
    scope: ids,
    startedAt: new Date().toISOString(),
    upstreamRevision: upstreamRevision(),
  });
  const childEnvironment = process.env;
  await Promise.all(
    Array.from({ length: workers }, async (_, worker) => {
      while (true) {
        const scenarioId = pending.shift();
        if (scenarioId === undefined) return;
        updateProgress(file, (current) => {
          current.running.push({ worker, scenarioId });
          const perWorker = current.perWorker[`w${worker}`];
          if (perWorker) perWorker.total += 1;
        });
        const workerPathsForTask = workerPaths(worker, matrix.id, variant);
        const taskFile = currentTaskFile(workerPathsForTask);
        rmSync(stopRequestFile(workerPathsForTask), { force: true });
        writeFileSync(
          taskFile,
          `${JSON.stringify({ scenarioId, startedAt: new Date().toISOString(), batchId }, null, 2)}\n`,
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
        const result = await runCase(args, childEnvironment);
        rmSync(taskFile, { force: true });
        rmSync(stopRequestFile(workerPathsForTask), { force: true });
        appendFileSync(
          logFile,
          `\n===== ${scenarioId} ${variant} ${matrix.id} exit=${String(result.code)} =====\n${result.output}\n`,
        );
        const records = readRecords(
          join(workersDirectory(), variant, matrix.id, `w${worker}/evidence`),
        );
        const record = records.find(
          (entry) =>
            entry.scenarioId === scenarioId &&
            entry.variant === variant &&
            entry.batchId === batchId,
        );
        const status = statusFor(record, variant);
        updateProgress(file, (current) => {
          current.running = current.running.filter(
            (entry) => !(entry.worker === worker && entry.scenarioId === scenarioId),
          );
          current.done += 1;
          current.statuses[status] += 1;
          const perWorker = current.perWorker[`w${worker}`];
          if (perWorker) perWorker.done += 1;
          if (status !== "verified" && status !== "observed") {
            current.failures.push({
              scenarioId,
              worker,
              reason: record?.verdict.status ?? "no record for this batch",
            });
          }
        });
        console.log(`[run-batch] ${scenarioId} ${variant} ${matrix.id} ${status}`);
      }
    }),
  );
  console.log(`[run-batch] log=${logFile}`);
}

main().catch((error: unknown) => {
  console.error(`[run-batch] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
