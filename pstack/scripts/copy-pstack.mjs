/**
 * Assemble `dist/pstack/` from the generated tree.
 *
 * The generated tree lives at `pstack/pstack/` (produced by `generate`), and that is
 * the tree this package ships. Copying it under `dist/` is the whole job; the runtime
 * artifacts join it one step later, in `replace-scripts`, once they have been built and
 * had their bundled dependency relocated.
 *
 * The copy replaces the destination outright. A stale file surviving a regeneration is
 * the failure this tree already had once: a page nobody produces any more keeps
 * shipping, and no check notices because the check compares against the generator's
 * current output rather than against the directory on disk.
 */

import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const SOURCE = join("pstack");
const DESTINATION = join("dist", "pstack");

if (!existsSync(SOURCE)) {
  console.error(`copy:pstack: ${SOURCE} is missing; run \`vp run generate\` first`);
  process.exit(1);
}

rmSync(DESTINATION, { recursive: true, force: true });
cpSync(SOURCE, DESTINATION, { recursive: true });
console.log(`copy:pstack: ${SOURCE} -> ${DESTINATION}`);
