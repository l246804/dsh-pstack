import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import type { RunRecord, Variant } from "../types.ts";
import {
  assertSafeRecord,
  mechanicalFailures,
  recordFileName,
  sessionFacts,
} from "../evidence/evidence.ts";
import {
  readHomePlan,
  readPlaygroundConfig,
  CONFIG_FILE,
  setDefaultWorkspace,
} from "../worker/home.ts";
import { providerSecrets } from "../config/provider.ts";
import { readWebUrl } from "../container/index.ts";
import { createEnvironment, environmentMatrix } from "../worker/run-metadata.ts";
import { DEFAULT_ENVIRONMENTS } from "../scenario/defaults.ts";
import { currentTaskFile, stopRequestFile, workerPaths } from "../worker/worker.ts";
import { stopWorkerTask } from "../execution/stop-task.ts";
import {
  attemptScenario,
  blockedRecord,
  latestSessionFile,
  materializeWorkspace,
} from "../execution/run.ts";

async function main(): Promise<void> {
  const variant = argValue("--variant") as Variant | undefined;
  const scenarioId = argValue("--scenario");
  if (!isVariant(variant) || !scenarioId) {
    throw new Error(
      "usage: run-scenario.ts --worker N --scenario ID --variant native|adapted --environment ID",
    );
  }
  const worker = Number(argValue("--worker") ?? "0");
  if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  const config = await readPlaygroundConfig(CONFIG_FILE);
  const paths = workerPaths(worker, matrix.id, variant);
  const preparedVariant = existsSync(paths.variantFile)
    ? readFileSync(paths.variantFile, "utf8").trim()
    : "";
  if (preparedVariant !== variant)
    throw new Error(`worker is prepared for ${preparedVariant || "nothing"}, not ${variant}`);
  const scenario = (await import("../scenario/scenarios.ts")).loadScenario(scenarioId);
  const environments = scenario.environments ?? DEFAULT_ENVIRONMENTS;
  if (!environments.includes(matrix.id)) {
    throw new Error(`scenario ${scenarioId} does not run in environment ${matrix.id}`);
  }
  if (scenario.variants !== undefined && !scenario.variants.includes(variant)) {
    throw new Error(`scenario ${scenarioId} is not allowed in ${variant}`);
  }
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
  console.log(`[run-scenario] ${scenarioId} ${variant} ${matrix.id} ${record.status}`);
  console.log(`[run-scenario] record=${recordFile}`);
  console.log(
    "[run-scenario] assess the rubric and record the conclusion in results/<scenario>/result.md",
  );
  process.exitCode = record.status === "completed" ? 0 : record.status === "blocked" ? 2 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      `[run-scenario] ERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
