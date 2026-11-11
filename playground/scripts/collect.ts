import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";

import type { Phase, RunRecord } from "../types.ts";
import { assertSameEntry, isRunRecord, latestRecords } from "./lib/evidence.ts";
import {
  environmentMatrix,
  PLAYGROUND_DIRECTORY,
  REPORT_DIRECTORY,
  workersDirectory,
} from "./lib/run-metadata.ts";
import { loadScenario, listScenarioIds } from "./lib/scenarios.ts";
import { exclusions } from "../scenarios/index.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function records(directory: string): RunRecord[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return records(file);
    if (!entry.name.endsWith(".json")) return [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      return isRunRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

function archive(record: RunRecord, source: string, destinationRoot: string): string {
  if (resolve(source).startsWith(`${resolve(destinationRoot)}${sep}`)) return source;
  const destination = join(
    destinationRoot,
    record.environment.matrix.id,
    record.phase,
    basename(source),
  );
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  const screenshot = source.replace(/\.json$/, ".png");
  if (existsSync(screenshot)) copyFileSync(screenshot, destination.replace(/\.json$/, ".png"));
  return destination;
}

function escape(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function reportFor(
  phase: Phase,
  environmentId: string,
  allRecords: RunRecord[],
): {
  markdown: string;
  archived: Array<{ record: RunRecord; source: string }>;
} {
  const latest = latestRecords(allRecords);
  const current = latest.filter(
    (record) => record.phase === phase && record.environment.matrix.id === environmentId,
  );
  const archived: Array<{ record: RunRecord; source: string }> = [];
  const rows: string[] = [];
  for (const id of listScenarioIds()) {
    const record = current.find((entry) => entry.scenarioId === id);
    const scenario = loadScenario(id);
    if (!record) {
      rows.push(
        `| ${id} | ${phase} | ${environmentId} | unrun | unavailable | pending | no RunRecord | ${escape(scenario.rubric.prompt)} | missing |`,
      );
      continue;
    }
    archived.push({ record, source: record.artifacts.recordFile });
    const comparison =
      phase === "adapted"
        ? latest.find(
            (entry) =>
              entry.phase === "raw" &&
              entry.scenarioId === id &&
              entry.environment.matrix.id === environmentId,
          )
        : undefined;
    const comparisonFailures =
      phase === "adapted"
        ? comparison
          ? assertSameEntry(comparison, record, scenario)
          : ["raw comparison is missing"]
        : [];
    const route = record.target
      ? `${record.target.provider}/${record.target.model}[${record.target.effort}]`
      : "unavailable";
    const reason = [record.semanticReview.reason, ...comparisonFailures].join("; ");
    const verdict = comparisonFailures.length > 0 ? "inconclusive" : record.verdict.status;
    rows.push(
      `| ${id} | ${phase} | ${environmentId} | ${verdict} | ${escape(route)} | ${record.semanticReview.status} | ${escape(reason)} | ${escape(scenario.rubric.prompt)} | ${escape(record.artifacts.recordFile)} |`,
    );
  }
  for (const exclusion of exclusions) {
    rows.push(
      `| ${exclusion.id} | excluded | ${environmentId} | excluded | not run | not applicable | ${escape(exclusion.reason)} | ${escape(exclusion.evidence)} | excluded |`,
    );
  }
  const metadata = current[0]?.environment;
  const statuses = [
    "observed",
    "gap",
    "blocked",
    "unobserved",
    "verified",
    "not-verified",
    "inconclusive",
  ];
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      current.filter((record) => record.verdict.status === status).length,
    ]),
  );
  const lines = [
    `# Playground ${phase} evidence`,
    "",
    `Environment: ${environmentId}. Registered scenarios: ${listScenarioIds().length}. Exclusions: ${exclusions.length}.`,
    `DSH: ${metadata?.dshVersion ?? "not observed"}. Upstream: ${metadata?.upstreamRevision ?? "not observed"}.`,
    `Config hash: ${metadata?.configHash ?? "not observed"}. Adapted package: ${metadata?.adaptedVersion ?? "none"}.`,
    "",
    "```json",
    JSON.stringify(
      { ...counts, unrun: listScenarioIds().length - current.length, excluded: exclusions.length },
      null,
      2,
    ),
    "```",
    "",
    "| scenario | phase | environment | verdict | actual route | semantic review | reason | rubric | evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ];
  return { markdown: lines.join("\n"), archived };
}

function main(): void {
  const phase = argValue("--phase") as Phase | undefined;
  if (phase !== "raw" && phase !== "adapted")
    throw new Error("collect requires --phase raw|adapted --environment ID");
  const matrix = environmentMatrix(argValue("--environment"));
  const { markdown, archived } = reportFor(phase, matrix.id, records(workersDirectory()));
  const rewritten = markdown.split("\n").map((line) => {
    let result = line;
    for (const { record, source } of archived) {
      const destination = archive(record, source, join(REPORT_DIRECTORY, "evidence"));
      result = result.replaceAll(source, relativePlayground(destination));
    }
    return result;
  });
  const file = join(
    REPORT_DIRECTORY,
    `run-${phase}-${matrix.id}-${new Date().toISOString().slice(0, 10)}.md`,
  );
  mkdirSync(REPORT_DIRECTORY, { recursive: true });
  writeFileSync(file, rewritten.join("\n"));
  console.log(`[collect] report=${file}`);
}

function relativePlayground(file: string): string {
  return file.startsWith(`${PLAYGROUND_DIRECTORY}/`)
    ? file.slice(PLAYGROUND_DIRECTORY.length + 1)
    : file;
}

try {
  main();
} catch (error) {
  console.error(`[collect] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
