import { pathToFileURL } from "node:url";

import { isVariant } from "../types.ts";
import { argValue } from "../shared/args.ts";
import type { Variant } from "../types.ts";
import { environmentMatrix } from "../worker/run-metadata.ts";
import { collectReviewSnapshot, REVIEWS_DIRECTORY } from "../evidence/review-snapshot.ts";
import { CONFIG_FILE, readPlaygroundConfig } from "../worker/home.ts";

async function main(): Promise<void> {
  await readPlaygroundConfig(CONFIG_FILE);
  const variant = argValue("--variant") as Variant | undefined;
  if (!isVariant(variant))
    throw new Error("collect requires --variant native|adapted --environment ID");
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const matrix = environmentMatrix(environmentId);
  collectReviewSnapshot(variant, matrix.id);
  console.log(`[collect] reviews=${REVIEWS_DIRECTORY}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(`[collect] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
