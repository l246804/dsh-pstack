import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { isTreatment } from "../types.ts";
import type { Treatment } from "../types.ts";
import { verdictFor } from "./lib/evidence.ts";
import { listSnapshotRecords, readReviewEntries, toSemanticReview } from "./lib/review.ts";
import { environmentMatrix } from "./lib/run-metadata.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export interface ReviewTarget {
  treatment: Treatment;
  environment: string;
  root?: string;
}

export interface ApplyResult {
  updated: string[];
}

export interface CheckResult {
  ok: boolean;
  problems: string[];
}

/**
 * Write each review.json entry onto its committed record.json and recompute the verdict.
 * A record whose verdict is already `blocked` keeps that block, so applying a review never
 * overwrites a startup-conflict block. Every other field on the record is preserved.
 */
export function applyReview(target: ReviewTarget): ApplyResult {
  const entries = readReviewEntries(target.treatment, target.environment, target.root);
  const records = listSnapshotRecords(target.treatment, target.environment, target.root);
  const recordIds = new Set(records.map((record) => record.scenarioId));
  const reviewIds = new Set(Object.keys(entries));
  const unknown = [...reviewIds].filter((id) => !recordIds.has(id)).sort();
  const missing = [...recordIds].filter((id) => !reviewIds.has(id)).sort();
  if (unknown.length > 0 || missing.length > 0) {
    const lines: string[] = [];
    if (unknown.length > 0)
      lines.push(`review.json references unknown scenarios: ${unknown.join(", ")}`);
    if (missing.length > 0) lines.push(`snapshot records with no review entry: ${missing.join(", ")}`);
    throw new Error(lines.join("\n"));
  }
  const updated: string[] = [];
  for (const { scenarioId, file, record } of records) {
    const semanticReview = toSemanticReview(entries[scenarioId]!);
    record.semanticReview = semanticReview;
    if (record.verdict.status !== "blocked") {
      record.verdict = verdictFor({
        treatment: record.treatment,
        failures: record.mechanicalFailures ?? [],
        semanticReview,
      });
    }
    writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
    updated.push(scenarioId);
  }
  return { updated };
}

/** Verify the snapshot is fully reviewed: no pending record and review ids match record ids. */
export function checkReview(target: ReviewTarget): CheckResult {
  const problems: string[] = [];
  let entries;
  try {
    entries = readReviewEntries(target.treatment, target.environment, target.root);
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : String(error)] };
  }
  const records = listSnapshotRecords(target.treatment, target.environment, target.root);
  const recordIds = new Set(records.map((record) => record.scenarioId));
  const reviewIds = new Set(Object.keys(entries));
  for (const id of [...reviewIds].filter((id) => !recordIds.has(id)).sort())
    problems.push(`review.json references unknown scenario ${id}`);
  for (const id of [...recordIds].filter((id) => !reviewIds.has(id)).sort())
    problems.push(`record ${id} has no review entry`);
  for (const { scenarioId, record } of records) {
    if (record.semanticReview.status === "pending")
      problems.push(`record ${scenarioId} still has a pending semanticReview`);
  }
  return { ok: problems.length === 0, problems };
}

function main(): void {
  const treatment = argValue("--treatment") as Treatment | undefined;
  const environment = argValue("--environment");
  if (!isTreatment(treatment) || environment === undefined) {
    throw new Error(
      "usage: review.ts --treatment native|adapted --environment ID (--apply | --check)",
    );
  }
  environmentMatrix(environment);
  const apply = process.argv.includes("--apply");
  const check = process.argv.includes("--check");
  if (apply === check) throw new Error("pass exactly one of --apply or --check");
  if (apply) {
    const { updated } = applyReview({ treatment, environment });
    console.log(
      `[review] applied ${updated.length} review entr${updated.length === 1 ? "y" : "ies"} to ${treatment}-${environment}`,
    );
    return;
  }
  const { ok, problems } = checkReview({ treatment, environment });
  if (!ok) {
    for (const problem of problems) console.error(`[review] ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[review] ${treatment}-${environment}: every record has a non-pending review`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[review] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
