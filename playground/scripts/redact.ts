import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { isVariant } from "../runner/types.ts";
import { argValue } from "../runner/shared/args.ts";
import type { Variant } from "../runner/types.ts";
import { environmentMatrix } from "../runner/worker/run-metadata.ts";
import { EVIDENCE_FILES } from "../runner/evidence/evidence-files.ts";
import { parseRunRecord } from "../runner/evidence/run-record.ts";
import { residualKinds } from "../runner/evidence/redaction.ts";
import {
  listSnapshotRecordFiles,
  reviewSnapshotDirectory,
} from "../runner/evidence/review-snapshot.ts";

function main(): void {
  const variant = argValue("--variant") as Variant | undefined;
  if (!isVariant(variant)) throw new Error("redact requires --variant native|adapted");
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const environment = environmentMatrix(environmentId).id;
  const apply = process.argv.includes("--apply");
  const root = reviewSnapshotDirectory(variant, environment);
  const records = listSnapshotRecordFiles(variant, environment);
  if (records.length === 0) throw new Error(`no review records under ${root}`);

  let errors = 0;
  let checked = 0;
  for (const { file: recordPath } of records) {
    const safe = join(dirname(recordPath), EVIDENCE_FILES.safe);
    const candidate = apply ? safe : existsSync(safe) ? safe : recordPath;
    if (apply && !existsSync(safe)) {
      console.error(`[redact] MISSING ${relative(root, safe)}; create it in the redaction session`);
      errors += 1;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(candidate, "utf8"));
      parseRunRecord(parsed, candidate);
    } catch (error) {
      console.error(`[redact] INVALID ${relative(root, candidate)}: ${String(error)}`);
      errors += 1;
      continue;
    }
    const kinds = residualKinds(JSON.stringify(parsed));
    if (kinds.length > 0) {
      console.error(`[redact] RESIDUAL ${relative(root, candidate)}: ${kinds.join(", ")}`);
      errors += 1;
      continue;
    }
    if (apply) {
      writeFileSync(recordPath, `${JSON.stringify(parsed, null, 2)}\n`);
      rmSync(safe, { force: true });
    }
    checked += 1;
  }
  if (apply) console.log(`[redact] applied=${checked} errors=${errors}`);
  else console.log(`[redact] checked=${checked} errors=${errors}`);
  process.exitCode = errors === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[redact] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
