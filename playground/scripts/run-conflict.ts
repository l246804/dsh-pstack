/**
 * Execute one conflict regression: build an adapted profile that layers a conflicting
 * official package onto dsh-pstack, install it, then try to start the web host and read the
 * startup failure. The expected result is a process exit whose log carries the conflict
 * keywords; a host that starts is reported as not-verified, never faked into a failure.
 *
 * The runner never keeps a server alive: `startWeb` either returns a URL (which we stop at
 * once) or throws when the child exits, and `stopWeb` runs in a `finally`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { conflictForEnvironment } from "../scenarios/conflicts.ts";
import { assertSafeRecord, recordFileName } from "./lib/evidence.ts";
import {
  CONFIG_FILE,
  buildProfile,
  copyCredentials,
  installPlugins,
  loadProviderPlan,
  readPlaygroundConfig,
  registerWorkspaces,
  resetHome,
  startWeb,
  stopWeb,
  writeHomePatch,
} from "./lib/env.ts";
import { buildConflictRunRecord, type ConflictStartupOutcome } from "./lib/conflict.ts";
import { REPORT_DIRECTORY, createEnvironment, environmentMatrix } from "./lib/run-metadata.ts";
import { listScenarioIds } from "./lib/scenarios.ts";
import { workerPaths } from "./lib/worker.ts";

const DEFAULT_ENVIRONMENT = "agent-team-conflict";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readLogText(file: string): string {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim().split("\n").slice(-200).join("\n");
}

async function main(): Promise<void> {
  const environmentId = argValue("--environment") ?? DEFAULT_ENVIRONMENT;
  const worker = Number(argValue("--worker") ?? "0");
  if (!Number.isInteger(worker) || worker < 0) throw new Error("--worker must be non-negative");

  const matrix = environmentMatrix(environmentId);
  const scenario = conflictForEnvironment(environmentId);
  const installedPackages = ["dsh-pstack", ...matrix.enabledPluginPackages];
  for (const pkg of scenario.expectedConflict.packages) {
    if (!installedPackages.includes(pkg)) {
      throw new Error(
        `scenario ${scenario.id} expects ${pkg}, but environment ${matrix.id} does not enable it`,
      );
    }
  }

  const configFile = argValue("--config") ?? process.env.PLAYGROUND_CONFIG_FILE ?? CONFIG_FILE;
  const config = readPlaygroundConfig(configFile);
  const plan = loadProviderPlan(config);
  const paths = workerPaths(worker, matrix.id);

  resetHome(paths);
  buildProfile(paths, "adapted", installedPackages);
  writeFileSync(paths.phaseFile, "adapted\n");
  copyCredentials(paths, config.credentialsFile);
  writeHomePatch(paths, plan, "adapted");
  registerWorkspaces(paths, listScenarioIds());

  const observed: string[] = [];
  let installError: string | undefined;
  try {
    installPlugins(paths);
    observed.push("install=ok");
  } catch (error) {
    installError = messageOf(error);
    observed.push(`install=error: ${installError}`);
  }

  let outcome: ConflictStartupOutcome;
  try {
    const started = await startWeb(paths, plan);
    outcome = { kind: "started", url: started.url };
    observed.push(`web=started url=${started.url}`);
  } catch (error) {
    const runError = messageOf(error);
    observed.push(`web=exited error=${runError}`);
    const combinedText = [installError ?? "", runError, readLogText(paths.logFile)]
      .filter((part) => part !== "")
      .join("\n");
    outcome = { kind: "exited", combinedText, runError };
  } finally {
    // A started host from the "no conflict" path must not survive this one-shot probe.
    stopWeb(paths);
  }

  const capturedAt = new Date().toISOString();
  const stamp = capturedAt.replace(/[:.]/g, "-");
  mkdirSync(paths.evidenceDir, { recursive: true });
  const recordFile = join(
    paths.evidenceDir,
    recordFileName(scenario.id, "adapted", matrix.id, stamp),
  );
  const environment = createEnvironment({ worker, matrix, config, phase: "adapted", paths });
  const record = buildConflictRunRecord({
    scenario,
    environment,
    recordFile,
    observed,
    outcome,
    capturedAt,
  });
  assertSafeRecord(
    record,
    Object.values(config.providers).map((provider) => provider.apiKey),
  );
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`[run-conflict] ${scenario.id} adapted ${matrix.id} ${record.verdict.status}`);
  console.log(`[run-conflict] evidence=${recordFile}`);
  console.log(`[run-conflict] reports=${REPORT_DIRECTORY}`);
  process.exitCode =
    record.verdict.status === "blocked" ? 0 : record.verdict.status === "not-verified" ? 1 : 2;
}

main().catch((error: unknown) => {
  console.error(`[run-conflict] ERROR: ${messageOf(error)}`);
  process.exitCode = 1;
});
