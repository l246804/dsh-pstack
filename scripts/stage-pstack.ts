/**
 * Stage the shipped pstack tree: the generated native baseline plus the adapter
 * answer stamped over its `docs/harness/dsh.md`. `vp pack` copies this one
 * directory, so the adapter file never races the baseline copy.
 */

import { copyFileSync, cpSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = join(ROOT, ".tmp", "pstack-stage");

rmSync(STAGE, { recursive: true, force: true });
cpSync(join(ROOT, "native", "pstack"), STAGE, { recursive: true });
copyFileSync(join(ROOT, "src", "dsh.md"), join(STAGE, "docs", "harness", "dsh.md"));
