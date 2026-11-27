import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import type { RunRecord, Variant } from "../types.ts";
import { analyzeSession } from "../evidence/analysis.ts";
import {
  assertSafeRecord,
  mechanicalFailures,
  pendingSemanticReview,
  recordFileName,
  sessionFacts,
  verdictFor,
} from "../evidence/evidence.ts";
import {
  readHomePlan,
  readPlaygroundConfig,
  CONFIG_FILE,
  setDefaultWorkspace,
} from "../worker/home.ts";
import { reviewSnapshotDirectory } from "../evidence/review-snapshot.ts";
import { providerSecrets } from "../config/provider.ts";
import { readWebUrl } from "../container/index.ts";
import { EVIDENCE_FILES } from "../evidence/evidence-files.ts";
import { sanitizeRecord } from "../evidence/redaction.ts";
import { createEnvironment, environmentMatrix } from "../worker/run-metadata.ts";
import { scenarioContentHash } from "../scenario/scenario-hash.ts";
import { DEFAULT_ENVIRONMENTS } from "../scenario/defaults.ts";
import { currentTaskFile, stopRequestFile, workerPaths } from "../worker/worker.ts";
import {
  attemptScenario,
  blockedRecord,
  InfraError,
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
  rmSync(stopRequestFile(paths), { force: true });
  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(paths.evidenceDir, recordFileName(scenarioId, variant, matrix.id, stamp));
  const screenshotFile = recordFile.replace(/\.json$/, ".png");
  let record: RunRecord;
  try {
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
    session.analysis = analyzeSession(session);
    const failures = mechanicalFailures({
      scenario,
      session,
      workspace,
      sessionWorkspace: join(paths.containerWorkspace, scenario.id),
      route: outcome.digest.route,
      expectedTarget,
      expectedPreset,
    });
    const semanticReview = pendingSemanticReview();
    record = {
      scenarioId,
      variant,
      environment: createEnvironment({ worker, matrix }),
      target: outcome.digest.route,
      session,
      artifacts: {
        recordFile,
        screenshotFile,
        observed: [
          `skillLoads=${session.skillLoads.join(",") || "none"}`,
          `toolCalls=${session.toolCalls.length}`,
          `warnings=${session.analysis.warnings.length}`,
        ],
      },
      semanticReview,
      mechanicalFailures: failures,
      verdict: verdictFor({ variant, failures, semanticReview }),
      batchId,
      capturedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
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
    if (!(error instanceof InfraError)) {
      record.artifacts.observed.push("scenario execution did not complete");
    }
  }
  assertSafeRecord(record, providerSecrets(config));
  record.scenarioHash = scenarioContentHash(scenario);
  const sourceFile = recordFile.replace(/\.json$/, EVIDENCE_FILES.sourceSuffix);
  writeFileSync(
    sourceFile,
    `${JSON.stringify(
      {
        recordFile,
        screenshotFile,
        sessionFile: record.session?.sessionFile ?? null,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(recordFile, `${JSON.stringify(sanitizeRecord(record), null, 2)}\n`);
  console.log(`[run-scenario] ${scenarioId} ${variant} ${matrix.id} ${record.verdict.status}`);
  console.log(`[run-scenario] evidence=${recordFile}`);
  console.log(`[run-scenario] reviews=${reviewSnapshotDirectory(variant, matrix.id)}`);
  process.exitCode =
    record.verdict.status === "verified"
      ? 0
      : record.verdict.status === "inconclusive" || record.verdict.status === "blocked"
        ? 2
        : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(
      `[run-scenario] ERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
