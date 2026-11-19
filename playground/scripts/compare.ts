import { pathToFileURL } from "node:url";

import type { BehaviorScenario, RunRecord } from "../runner/types.ts";
import { listSnapshotRecords } from "./lib/review.ts";
import { environmentMatrix } from "../runner/lib/run-metadata.ts";
import { scenarioContentHash } from "../runner/lib/scenario-hash.ts";

export { scenarioContentHash } from "../runner/lib/scenario-hash.ts";

export interface CompareSnapshotInput {
  environment: string;
  root?: string;
  loadScenario: (id: string) => BehaviorScenario;
  scenario?: string;
}

export interface CompareFailure {
  scenarioId: string;
  problems: string[];
}

export interface CompareResult {
  /** Scenario ids present on both sides and compared. */
  compared: string[];
  /** Every scenario with at least one problem, one-sided or mismatched. */
  failures: CompareFailure[];
}

/**
 * The comparability check for one scenario. Two records are comparable on the run-identity
 * tuple `(dshVersion, scenario content hash, environment matrix id, target route)`;
 * `upstreamRevision` and `pstackVersion` are provenance, never comparability keys.
 */
export function compareOne(
  native: RunRecord,
  adapted: RunRecord,
  scenario: BehaviorScenario,
): string[] {
  const problems: string[] = [];
  if (native.scenarioId !== scenario.id || adapted.scenarioId !== scenario.id) {
    problems.push("records do not belong to the selected scenario");
  }
  if (native.environment.dshVersion !== adapted.environment.dshVersion) {
    problems.push("native and adapted DSH versions differ");
  }
  if (native.environment.matrix.id !== adapted.environment.matrix.id) {
    problems.push("native and adapted environment matrices differ");
  }
  if (JSON.stringify(native.target) !== JSON.stringify(adapted.target)) {
    problems.push("native and adapted actual model routes differ");
  }
  const hash = scenarioContentHash(scenario);
  if (native.scenarioHash !== undefined && native.scenarioHash !== hash) {
    problems.push("native record scenario content differs from the current definition");
  }
  if (adapted.scenarioHash !== undefined && adapted.scenarioHash !== hash) {
    problems.push("adapted record scenario content differs from the current definition");
  }
  if (
    native.scenarioHash !== undefined &&
    adapted.scenarioHash !== undefined &&
    native.scenarioHash !== adapted.scenarioHash
  ) {
    problems.push("native and adapted scenario contents differ");
  }
  return problems;
}

function byScenarioId(
  records: Array<{ scenarioId: string; record: RunRecord }>,
): Map<string, RunRecord> {
  return new Map(records.map((entry) => [entry.scenarioId, entry.record]));
}

/**
 * Compare one environment's committed native and adapted records. A scenario present on only
 * one side is a problem; a scenario present on both is compared field by field. Read-only:
 * it never writes a record.
 */
export function compareSnapshot(input: CompareSnapshotInput): CompareResult {
  const nativeRecords = byScenarioId(listSnapshotRecords("native", input.environment, input.root));
  const adaptedRecords = byScenarioId(
    listSnapshotRecords("adapted", input.environment, input.root),
  );

  const ids =
    input.scenario !== undefined
      ? [input.scenario]
      : [...new Set([...nativeRecords.keys(), ...adaptedRecords.keys()])].sort();

  const compared: string[] = [];
  const failures: CompareFailure[] = [];
  for (const id of ids) {
    const native = nativeRecords.get(id);
    const adapted = adaptedRecords.get(id);
    const problems: string[] = [];
    if (!native) problems.push(`${id}: missing on native`);
    if (!adapted) problems.push(`${id}: missing on adapted`);
    if (native && adapted) {
      problems.push(
        ...compareOne(native, adapted, input.loadScenario(id)).map((p) => `${id}: ${p}`),
      );
      compared.push(id);
    }
    if (problems.length > 0) failures.push({ scenarioId: id, problems });
  }
  return { compared, failures };
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const environment = argValue("--environment") ?? "base";
  environmentMatrix(environment);
  const scenario = argValue("--scenario");
  const all = process.argv.includes("--all");
  if ((scenario !== undefined) === all) {
    throw new Error("usage: compare.ts --environment ID (--scenario ID | --all)");
  }
  const { loadScenario } = await import("../runner/lib/scenarios.ts");
  const result = compareSnapshot({
    environment,
    loadScenario,
    ...(scenario === undefined ? {} : { scenario }),
  });
  for (const { problems } of result.failures) {
    for (const problem of problems) console.error(`[compare] ${problem}`);
  }
  console.log(
    `[compare] compared ${result.compared.length} scenario(s), ${result.failures.length} with problems`,
  );
  if (result.failures.length > 0) process.exitCode = 1;
  if (all && result.compared.length === 0) {
    console.error("[compare] no comparable scenarios");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[compare] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
