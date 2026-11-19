import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { isTreatment } from "../runner/types.ts";
import type { Treatment } from "../runner/types.ts";
import { environmentMatrix } from "../runner/worker/run-metadata.ts";
import { EVIDENCE_FILES } from "../runner/evidence/evidence-files.ts";
import { residualKinds } from "../runner/evidence/redaction.ts";
import { reviewSnapshotDirectory } from "../runner/evidence/review-snapshot.ts";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : entry.name === EVIDENCE_FILES.record ? [file] : [];
  });
}

function main(): void {
  const treatment = argValue("--treatment") as Treatment | undefined;
  if (!isTreatment(treatment)) throw new Error("redact requires --treatment native|adapted");
  const environmentId = argValue("--environment");
  if (environmentId === undefined) throw new Error("--environment is required");
  const environment = environmentMatrix(environmentId).id;
  const apply = process.argv.includes("--apply");
  const root = reviewSnapshotDirectory(treatment, environment);
  const records = walk(root);
  if (records.length === 0) throw new Error(`no review records under ${root}`);

  let errors = 0;
  let checked = 0;
  for (const record of records) {
    const safe = join(dirname(record), EVIDENCE_FILES.safe);
    const candidate = apply ? safe : existsSync(safe) ? safe : record;
    if (apply && !existsSync(safe)) {
      console.error(`[redact] MISSING ${relative(root, safe)}; create it in the redaction session`);
      errors += 1;
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(candidate, "utf8"));
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
      writeFileSync(record, `${JSON.stringify(parsed, null, 2)}\n`);
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
