/**
 * Print the concept × file coverage matrix for the upstream→DSH adaptation.
 *
 * `adapt.ts` owns the rules; this script answers the question the rules cannot
 * answer on their own: which upstream files still mention a Cursor concept, and
 * does a rule claim it? A rule that claims a term but no file uses it is dead
 * weight. A file that uses a term no rule claims is a leak the sync will only
 * catch if the term happens to have a `forbid` pattern.
 *
 * `--check` fails on three things, all of them mechanical:
 *   1. `UPSTREAM_TERMS` names a rule id that does not exist.
 *   2. A rule matches upstream text but has no written coverage decision.
 *   3. A rule claims `full` coverage without a `forbid` pattern.
 *
 * Run it bare to read the matrix.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleCoverage, termRules, UPSTREAM_TERMS, type RuleCoverage } from "./adapt.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = join(ROOT, "upstream/cursor-plugins/pstack");
const check = process.argv.includes("--check");

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else files.push(full);
  }
  return files;
}

interface Row {
  readonly id: string;
  readonly kind: string;
  readonly coverage: RuleCoverage;
  readonly reason: string | undefined;
  readonly files: readonly string[];
}

async function main(): Promise<void> {
  const problems: string[] = [];
  const rules = termRules();
  const byId = new Map(rules.map((rule) => [rule.id, rule]));

  for (const entry of UPSTREAM_TERMS) {
    if (!byId.has(entry.rule)) {
      problems.push(`UPSTREAM_TERMS: "${entry.term}" points at missing rule "${entry.rule}"`);
    }
  }

  const files = (await listFiles(UPSTREAM)).filter((file) => !file.endsWith(".png"));
  const texts = new Map<string, string>();
  for (const file of files) texts.set(relative(UPSTREAM, file), await readFile(file, "utf8"));

  const rows: Row[] = [];
  for (const rule of rules) {
    let coverage: RuleCoverage;
    try {
      coverage = ruleCoverage(rule);
    } catch (error) {
      problems.push((error as Error).message);
      continue;
    }

    const hits: string[] = [];
    for (const [path, text] of texts) {
      // `detect` is not global; rebuilding it drops any sticky state so one
      // match cannot hide the next file.
      const pattern = new RegExp(rule.detect.source, rule.detect.flags.replace("g", ""));
      if (pattern.test(text)) hits.push(path);
    }

    if (hits.length > 0 && coverage !== "full" && !rule.reason) {
      problems.push(
        `rule "${rule.id}" matches ${hits.length} upstream file(s) but has no reason for its ${coverage} coverage`,
      );
    }

    rows.push({ id: rule.id, kind: rule.kind, coverage, reason: rule.reason, files: hits });
  }

  const width = Math.max(...rows.map((row) => row.id.length), 20);
  console.log(`${"concept".padEnd(width)}  kind         coverage   files`);
  console.log(`${"-".repeat(width)}  -----------  ---------  -----`);
  for (const row of rows) {
    console.log(
      `${row.id.padEnd(width)}  ${row.kind.padEnd(11)}  ${row.coverage.padEnd(9)}  ${String(row.files.length).padStart(5)}`,
    );
  }

  const unused = rows.filter((row) => row.files.length === 0);
  if (unused.length > 0) {
    console.log(`\nUnused rules (detect matches no upstream file):`);
    for (const row of unused) console.log(`  ${row.id}`);
  }

  const preserved = rows.filter((row) => row.coverage === "preserved");
  if (preserved.length > 0) {
    console.log(`\nDeliberately preserved upstream names:`);
    for (const row of preserved) console.log(`  ${row.id}: ${row.reason ?? "(no reason)"}`);
  }

  if (problems.length > 0) {
    console.error(`\nCoverage problems:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  if (check) console.log(`\nCoverage is complete (${rows.length} concepts).`);
}

await main();
