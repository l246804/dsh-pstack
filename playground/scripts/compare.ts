import { pathToFileURL } from "node:url";

import type { BehaviorScenario, RunRecord } from "../runner/types.ts";
import { listSnapshotRecords } from "../runner/evidence/review-snapshot.ts";
import { environmentMatrix } from "../runner/worker/run-metadata.ts";
import { scenarioContentHash } from "../runner/scenario/scenario-hash.ts";
import { DEFAULT_ENVIRONMENTS, DEFAULT_VARIANTS } from "../runner/scenario/defaults.ts";

export { scenarioContentHash } from "../runner/scenario/scenario-hash.ts";

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
  /** Total committed records found for either side in this environment. */
  recordCount: number;
}

export function recordHashProblems(record: RunRecord, scenario: BehaviorScenario): string[] {
  const hash = scenarioContentHash(scenario);
  if (record.scenarioHash === undefined) return ["scenario content hash is missing"];
  return record.scenarioHash === hash
    ? []
    : [`${record.variant} record scenario content differs from the current definition`];
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
  if (native.environment.configHash !== adapted.environment.configHash) {
    problems.push("native and adapted config hashes differ");
  }
  if (JSON.stringify(native.target) !== JSON.stringify(adapted.target)) {
    problems.push("native and adapted actual model routes differ");
  }
  problems.push(...recordHashProblems(native, scenario));
  problems.push(...recordHashProblems(adapted, scenario));
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
 * one side is a problem only when that side is declared by the scenario's `variants`; a
 * native-only scenario intentionally has no adapted record. Scenarios present on both sides
 * are compared field by field. Read-only: it never writes a record.
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
    const defined = input.loadScenario(id);
    const variants = defined.variants ?? DEFAULT_VARIANTS;
    const native = nativeRecords.get(id);
    const adapted = adaptedRecords.get(id);
    const problems: string[] = [];
    if (!native && variants.includes("native")) problems.push(`${id}: missing on native`);
    if (!adapted && variants.includes("adapted")) problems.push(`${id}: missing on adapted`);
    if (native && adapted) {
      problems.push(...compareOne(native, adapted, defined).map((p) => `${id}: ${p}`));
      compared.push(id);
    } else {
      if (native) problems.push(...recordHashProblems(native, defined).map((p) => `${id}: ${p}`));
      if (adapted) problems.push(...recordHashProblems(adapted, defined).map((p) => `${id}: ${p}`));
    }
    if (problems.length > 0) failures.push({ scenarioId: id, problems });
  }
  return { compared, failures, recordCount: nativeRecords.size + adaptedRecords.size };
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const environment = argValue("--environment") ?? DEFAULT_ENVIRONMENTS[0];
  environmentMatrix(environment);
  const scenario = argValue("--scenario");
  const all = process.argv.includes("--all");
  if ((scenario !== undefined) === all) {
    throw new Error("usage: compare.ts --environment ID (--scenario ID | --all)");
  }
  const { loadScenario } = await import("../runner/scenario/scenarios.ts");
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
  if (all && result.compared.length === 0 && result.failures.length === 0) {
    if (result.recordCount === 0) {
      console.error("[compare] no snapshot records for this environment");
      process.exitCode = 1;
    } else {
      // Render-only environments can contain native-only scenarios. No comparable pair is
      // valid when records exist; an empty snapshot is handled as an error above.
      console.log("[compare] no comparable scenarios");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[compare] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
