import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { RunRecord, PlaygroundConfig, BehaviorScenario } from "../types.ts";
import { assertSafeRecord, recordFileName, blockedRecord } from "../evidence/run-record.ts";
import { mechanicalFailures } from "../evidence/assertions.ts";
import { sessionFacts } from "../evidence/session-facts.ts";
import { readHomePlan } from "../worker/home.ts";
import { setDefaultWorkspace } from "../storage/workspaces.ts";
import { providerSecrets, loadProviderPlan } from "../config/provider.ts";
import { readWebUrl } from "../container/index.ts";
import { createEnvironment } from "../worker/run-metadata.ts";
import { environmentMatrix } from "../scenario/environments.ts";
import { scenarioApplies } from "../scenario/applicability.ts";
import {
  currentTaskFile,
  stopRequestFile,
  workerPaths,
  type WorkerPaths,
} from "../worker/worker.ts";
import { stopWorkerTask } from "./stop-task.ts";
import { attemptScenario } from "./run.ts";

import { latestSessionFile } from "../storage/sessions.ts";
import { materializeWorkspace } from "../worker/workspace.ts";

export interface ScenarioInput {
  variant: WorkerPaths["variant"];
  environment: string;
  worker: number;
  scenario: BehaviorScenario;
  config: PlaygroundConfig;
}
export function runScenario(input: ScenarioInput): RunRecord {
  const { variant, worker, scenario, config } = input;
  const scenarioId = scenario.id;
  const matrix = environmentMatrix(input.environment);
  const paths = workerPaths(worker, matrix.id, variant);
  loadProviderPlan(config);
  const preparedVariant = existsSync(paths.variantFile)
    ? readFileSync(paths.variantFile, "utf8").trim()
    : "";
  if (preparedVariant !== variant)
    throw new Error(`worker is prepared for ${preparedVariant || "nothing"}, not ${variant}`);
  if (!scenarioApplies(scenario, variant, matrix.id))
    throw new Error(`scenario ${scenarioId} does not run in ${variant}-${matrix.id}`);
  const taskFile = currentTaskFile(paths);
  const batchId = (() => {
    if (!existsSync(taskFile)) return undefined;
    try {
      const value = JSON.parse(readFileSync(taskFile, "utf8")) as { batchId?: unknown };
      return typeof value.batchId === "string" ? value.batchId : undefined;
    } catch {
      return undefined;
    }
  })();
  const expectedTarget = readHomePlan(paths);
  // DSH starts every session on its default Standard preset; the poteto workflow is a
  // session toggle, not a root preset, so both variants assert the same preset id.
  const expectedPreset = "standard";
  const workspace = materializeWorkspace(paths, scenario);
  setDefaultWorkspace(paths, scenario.id);
  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(paths.evidenceDir, recordFileName(scenarioId, variant, matrix.id, stamp));
  const screenshotFile = recordFile.replace(/\.json$/, ".png");
  let record: RunRecord;
  try {
    if (existsSync(stopRequestFile(paths))) throw new Error("external stop requested");
    const outcome = attemptScenario({
      paths,
      scenario,
      url: readWebUrl(paths),
      screenshotFile,
      expectedPreset,
      ...(config.browser === undefined ? {} : { browser: config.browser }),
      scenarioTimeoutMs: config.runtime.scenarioTimeoutMs,
    });
    const session = sessionFacts(outcome.digest, outcome.file, outcome.answers);
    const failures = mechanicalFailures({
      scenario,
      session,
      workspace,
      sessionWorkspace: join(paths.containerWorkspace, scenario.id),
      route: outcome.digest.route,
      expectedTarget,
      expectedPreset,
    });
    record = {
      scenarioId,
      variant,
      environment: createEnvironment({ worker, matrix }),
      target: outcome.digest.route,
      session,
      artifacts: {
        recordFile,
        screenshotFile,
      },
      mechanicalFailures: failures,
      status: failures.length === 0 ? "completed" : "failed",
      batchId,
      capturedAt,
    };
  } catch (error) {
    let reason = existsSync(stopRequestFile(paths))
      ? "external stop requested"
      : error instanceof Error
        ? error.message
        : String(error);
    if (existsSync(paths.urlFile)) {
      try {
        stopWorkerTask(paths);
      } catch (stopError) {
        reason += `; ${stopError instanceof Error ? stopError.message : String(stopError)}`;
      }
    }
    const lastSession = latestSessionFile(paths, {
      scenarioId,
      rootOnly: true,
      startedAt: capturedAt,
    });
    record = blockedRecord({
      scenarioId,
      variant,
      paths,
      recordFile,
      screenshotFile,
      sessionFile: lastSession?.file,
      sessionId: lastSession?.id,
      batchId,
      reason,
      capturedAt,
    });
  }
  assertSafeRecord(record, providerSecrets(config));
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
