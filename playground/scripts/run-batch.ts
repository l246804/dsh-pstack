import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { Phase, RunRecord, Verdict } from "../types.ts";
import { latestRecords } from "./lib/evidence.ts";
import { computeWorkers } from "./lib/capacity.ts";
import {
  environmentMatrix,
  REPORT_DIRECTORY,
  REPOSITORY_ROOT,
  workersDirectory,
} from "./lib/run-metadata.ts";
import {
  formatTimestamp,
  progressFilePath,
  readProgress,
  updateProgress,
  writeProgress,
  type ProgressState,
} from "./lib/progress.ts";
import { listScenarioIds, listScenariosForSkill } from "./lib/scenarios.ts";
import { workerCount } from "./lib/worker.ts";

const VPX = process.platform === "win32" ? "vpx.cmd" : "vpx";

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
      return typeof record.scenarioId === "string" && typeof record.phase === "string"
        ? [record]
        : [];
    } catch {
      return [];
    }
  });
}

function allRecords(): RunRecord[] {
  return [...readRecords(join(REPORT_DIRECTORY, "evidence")), ...readRecords(workersDirectory())];
}

function selectedScenarios(phase: Phase, environmentId: string): string[] {
  const scenarios = argValue("--scenarios");
  const skills = argValue("--skills");
  const failed = process.argv.includes("--only-failed");
  if ([scenarios, skills, failed ? "failed" : undefined].filter(Boolean).length > 1) {
    throw new Error("--scenarios, --skills and --only-failed are mutually exclusive");
  }
  if (scenarios) return parseList(scenarios);
  if (skills)
    return parseList(skills).flatMap((skill) =>
      listScenariosForSkill(skill).map((scenario) => scenario.id),
    );
  if (failed) {
    return latestRecords(allRecords())
      .filter((record) => record.phase === phase && record.environment.matrix.id === environmentId)
      .filter((record) =>
        phase === "raw"
          ? record.verdict.status === "gap"
          : record.verdict.status === "not-verified",
      )
      .map((record) => record.scenarioId);
  }
  return listScenarioIds();
}

function distribute(ids: string[], workers: number): string[][] {
  const queues = Array.from({ length: workers }, () => [] as string[]);
  ids.forEach((id, index) => queues[index % workers]?.push(id));
  return queues;
}

interface ChildResult {
  code: number | null;
  output: string;
}

function runCase(args: string[]): Promise<ChildResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(VPX, args, { cwd: REPOSITORY_ROOT, env: process.env });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", (error) => resolvePromise({ code: -1, output: error.message }));
    child.on("close", (code) => resolvePromise({ code, output }));
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

function statusFor(record: RunRecord | undefined, phase: Phase): Verdict["status"] {
  if (record) return record.verdict.status;
  return phase === "raw" ? "unobserved" : "inconclusive";
}

async function main(): Promise<void> {
  const phase = argValue("--phase") as Phase | undefined;
  if (phase !== "raw" && phase !== "adapted") {
    throw new Error(
      "usage: run-batch.ts --phase raw|adapted [--environment base] [--scenarios a,b|--skills a,b|--only-failed] [--workers N] [--round N]",
    );
  }
  const matrix = environmentMatrix(argValue("--environment"));
  const ids = selectedScenarios(phase, matrix.id);
  if (ids.length === 0) {
    console.log("[run-batch] no scenarios selected");
    return;
  }
  const requested = argValue("--workers") === undefined ? undefined : Number(argValue("--workers"));
  const prepared = workerCount(matrix.id, phase);
  const workers = Math.min(computeWorkers(requested).workers, prepared || requested || 1);
  const queues = distribute(ids, workers);
  const roundFlag = argValue("--round");
  const file = progressFilePath(matrix.id, phase);
  const round = roundFlag ? Number(roundFlag) : (readProgress(file)?.round ?? 0) + 1;
  if (!Number.isInteger(round) || round < 1) throw new Error("--round must be positive");
  const state: ProgressState = {
    phase,
    environmentId: matrix.id,
    round,
    total: ids.length,
    done: 0,
    statuses: statuses(),
    running: [],
    startedAt: formatTimestamp(),
    updatedAt: formatTimestamp(),
    perWorker: Object.fromEntries(
      queues.map((queue, index) => [`w${index}`, { done: 0, total: queue.length }]),
    ),
    failures: [],
    workers,
  };
  writeProgress(file, state);
  mkdirSync(join(workersDirectory(), phase, matrix.id), { recursive: true });
  const logFile = join(workersDirectory(), phase, matrix.id, "batch.log");
  writeFileSync(logFile, `phase=${phase} environment=${matrix.id} round=${round}\n`);
  await Promise.all(
    queues.map(async (queue, worker) => {
      for (const scenarioId of queue) {
        updateProgress(file, (current) => {
          current.running.push({ worker, scenarioId });
        });
        const args = [
          "playground/scripts/run-case.ts",
          "--worker",
          String(worker),
          "--scenario",
          scenarioId,
          "--phase",
          phase,
          "--environment",
          matrix.id,
        ];
        const config = argValue("--config");
        if (config) args.push("--config", config);
        const result = await runCase(args);
        appendFileSync(
          logFile,
          `\n===== ${scenarioId} ${phase} ${matrix.id} exit=${String(result.code)} =====\n${result.output}\n`,
        );
        const records = latestRecords(
          readRecords(join(workersDirectory(), phase, matrix.id, `w${worker}/evidence`)),
        );
        const record = records.find(
          (entry) => entry.scenarioId === scenarioId && entry.phase === phase,
        );
        const status = statusFor(record, phase);
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
              reason: record?.verdict.status ?? result.output.slice(-500),
            });
          }
        });
        console.log(`[run-batch] ${scenarioId} ${phase} ${matrix.id} ${status}`);
      }
    }),
  );
  console.log(`[run-batch] log=${logFile}`);
}

main().catch((error: unknown) => {
  console.error(`[run-batch] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
