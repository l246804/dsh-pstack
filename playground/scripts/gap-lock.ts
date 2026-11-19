import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { expectedGapLock, gapLockProblems, type GapLock, type LockedGap } from "./lib/gap-lock.ts";
import { REPOSITORY_ROOT } from "../runner/lib/run-metadata.ts";

const GAPS_FILE = join(REPOSITORY_ROOT, "native", "gaps.json");
const LOCK_FILE = join(REPOSITORY_ROOT, "playground", "scenarios", "gap-lock.json");

const {
  values: { write, check },
} = parseArgs({
  // `vp run <task> -- --check` forwards a bare `--`; drop it before strict parsing.
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    write: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (write === check) {
  throw new Error("usage: gap-lock.ts --write | --check");
}

const gaps = (JSON.parse(readFileSync(GAPS_FILE, "utf8")) as { gaps: LockedGap[] }).gaps;

if (write) {
  const lock = expectedGapLock(gaps);
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`gap-lock: ${Object.keys(lock.gaps).length} confirmed gaps locked`);
  process.exit(0);
}

if (!existsSync(LOCK_FILE)) {
  throw new Error(`missing ${LOCK_FILE}; run vp run playground:gap-lock -- --write`);
}
const lock = JSON.parse(readFileSync(LOCK_FILE, "utf8")) as GapLock;
const problems = gapLockProblems(gaps, lock);
for (const problem of problems) console.log(`FAIL ${problem}`);
if (problems.length > 0) process.exit(1);
console.log("gap-lock is up to date.");
