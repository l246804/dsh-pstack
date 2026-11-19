import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isTreatment } from "../types.ts";
import type { BehaviorScenario, RunRecord, Treatment } from "../types.ts";
import { analyzeSession } from "../evidence/analysis.ts";
import {
  assertSafeRecord,
  mechanicalFailures,
  pendingSemanticReview,
  recordFileName,
  sessionFacts,
  verdictFor,
} from "../evidence/evidence.ts";
import { readHomePlan, readPlaygroundConfig, CONFIG_FILE } from "../worker/home.ts";
import { reviewSnapshotDirectory } from "../evidence/review-snapshot.ts";
import { providerSecrets } from "../config/provider.ts";
import { readWebUrl } from "../container/web.ts";
import { EVIDENCE_FILES } from "../evidence/evidence-files.ts";
import { sanitizeRecord } from "../evidence/redaction.ts";
import { createEnvironment, environmentMatrix } from "../worker/run-metadata.ts";
import { scenarioContentHash } from "../scenario/scenario-hash.ts";
import { stopRequestFile, workerPaths } from "../worker/worker.ts";
import {
  attemptScenario,
  blockedRecord,
  InfraError,
  latestSessionFile,
  materializeWorkspace,
} from "../case/run.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const treatment = argValue("--treatment") as Treatment | undefined;
  const scenarioId = argValue("--scenario");
  if (!isTreatment(treatment) || !scenarioId) {
    throw new Error(
      "usage: run-case.ts --worker N --scenario ID --treatment native|adapted --environment ID [--config FILE]",
    );
  }
  const worker = Number(argValue("--worker") ?? "0");
  if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  const paths = workerPaths(worker, matrix.id, treatment);
  const preparedTreatment = existsSync(paths.treatmentFile)
    ? readFileSync(paths.treatmentFile, "utf8").trim()
    : "";
  if (preparedTreatment !== treatment)
    throw new Error(`worker is prepared for ${preparedTreatment || "nothing"}, not ${treatment}`);
  const bundlePath = process.env.PLAYGROUND_SCENARIO_BUNDLE;
  const scenario = bundlePath
    ? (() => {
        const scenarios = JSON.parse(readFileSync(bundlePath, "utf8")) as BehaviorScenario[];
        const found = scenarios.find((entry) => entry.id === scenarioId);
        if (!found) throw new Error(`scenario ${scenarioId} is missing from the batch bundle`);
        return found;
      })()
    : (await import("../scenario/scenarios.ts")).loadScenario(scenarioId);
  const environments = scenario.environments ?? ["base"];
  if (!environments.includes(matrix.id)) {
    throw new Error(`scenario ${scenarioId} does not run in environment ${matrix.id}`);
  }
  if (scenario.treatments !== undefined && !scenario.treatments.includes(treatment)) {
    throw new Error(`scenario ${scenarioId} is not allowed in ${treatment}`);
  }
  const configFile = argValue("--config") ?? process.env.PLAYGROUND_CONFIG_FILE ?? CONFIG_FILE;
  const config = await readPlaygroundConfig(configFile);
  const expectedTarget = readHomePlan(paths);
  // DSH starts every session on its default Standard preset; the poteto workflow is a
  // session toggle, not a root preset, so both treatments assert the same preset id.
  const expectedPreset = "standard";
  const workspace = materializeWorkspace(paths, scenario);
  rmSync(stopRequestFile(paths), { force: true });
  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(
    paths.evidenceDir,
    recordFileName(scenarioId, treatment, matrix.id, stamp),
  );
  const screenshotFile = recordFile.replace(/\.json$/, ".png");
  let record: RunRecord;
  try {
    const outcome = attemptScenario({
      paths,
      scenario,
      url: readWebUrl(paths),
      expectedTarget,
      screenshotFile,
      expectedPreset,
      ...(config.browser === undefined ? {} : { browser: config.browser }),
    });
    const session = sessionFacts(outcome.digest, outcome.file, outcome.answers);
    session.analysis = analyzeSession(session);
    const failures = mechanicalFailures({
      scenario,
      session,
      workspace,
      route: outcome.digest.route,
      expectedTarget,
      expectedPreset,
    });
    const semanticReview = pendingSemanticReview();
    record = {
      scenarioId,
      treatment,
      environment: createEnvironment({ worker, matrix, config, treatment, paths }),
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
      verdict: verdictFor({ treatment, failures, semanticReview }),
      batchId: process.env.PLAYGROUND_BATCH_ID,
      capturedAt,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const lastSession = latestSessionFile(paths);
    record = blockedRecord({
      scenarioId,
      treatment,
      paths,
      config,
      recordFile,
      screenshotFile,
      sessionFile: reason.includes("external stop") ? lastSession?.file : undefined,
      sessionId: reason.includes("external stop") ? lastSession?.id : undefined,
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
  console.log(`[run-case] ${scenarioId} ${treatment} ${matrix.id} ${record.verdict.status}`);
  console.log(`[run-case] evidence=${recordFile}`);
  console.log(`[run-case] reviews=${reviewSnapshotDirectory(treatment, matrix.id)}`);
  process.exitCode =
    record.verdict.status === "verified"
      ? 0
      : record.verdict.status === "inconclusive" || record.verdict.status === "blocked"
        ? 2
        : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[run-case] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
