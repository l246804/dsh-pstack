import { pathToFileURL } from "node:url";

import { isTreatment } from "../types.ts";
import type { Treatment } from "../types.ts";
import { environmentMatrix } from "../worker/run-metadata.ts";
import { collectReviewSnapshot, REVIEWS_DIRECTORY } from "../evidence/review-snapshot.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const treatment = argValue("--treatment") as Treatment | undefined;
  if (!isTreatment(treatment))
    throw new Error("collect requires --treatment native|adapted --environment ID");
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  collectReviewSnapshot(treatment, matrix.id);
  console.log(`[collect] reviews=${REVIEWS_DIRECTORY}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[collect] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
