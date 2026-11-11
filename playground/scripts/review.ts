import { workersDirectory } from "./lib/run-metadata.ts";
import {
  applyReviews,
  inspectReviews,
  REVIEWS_DIRECTORY,
  type ReviewIdentity,
} from "./lib/review.ts";
import { listScenarioIds } from "./lib/scenarios.ts";

function label(identity: ReviewIdentity): string {
  return `${identity.scenarioId} ${identity.phase} ${identity.environmentId}`;
}

function main(): void {
  const input = {
    reviewsDirectory: REVIEWS_DIRECTORY,
    workersDirectory: workersDirectory(),
    scenarioIds: listScenarioIds(),
  };
  if (process.argv.includes("--apply")) {
    const result = applyReviews(input);
    for (const error of result.errors) console.log(`[review] INVALID ${error}`);
    for (const { identity, recordFile } of result.written)
      console.log(`[review] applied ${label(identity)} -> ${recordFile}`);
    for (const identity of result.skipped) console.log(`[review] idempotent ${label(identity)}`);
    for (const identity of result.missingRecord)
      console.log(`[review] no record for ${label(identity)}`);
    console.log(
      `[review] applied=${result.written.length} skipped=${result.skipped.length} missing=${result.missingRecord.length} errors=${result.errors.length}`,
    );
    process.exitCode = result.errors.length > 0 ? 1 : result.missingRecord.length > 0 ? 2 : 0;
    return;
  }
  const inspection = inspectReviews(input);
  for (const error of inspection.errors) console.log(`[review] INVALID ${error}`);
  console.log(`[review] sidecars=${inspection.sidecars.length} errors=${inspection.errors.length}`);
  console.log(
    `[review] reviewed: ${inspection.reviewed.length ? inspection.reviewed.map(label).join(", ") : "none"}`,
  );
  console.log(
    `[review] pending: ${inspection.pending.length ? inspection.pending.map(label).join(", ") : "none"}`,
  );
  if (inspection.orphaned.length > 0)
    console.log(`[review] sidecar without a record: ${inspection.orphaned.map(label).join(", ")}`);
  process.exitCode = inspection.errors.length > 0 ? 1 : 0;
}

try {
  main();
} catch (error) {
  console.error(`[review] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
