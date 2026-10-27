/**
 * Copy the generated port and the hand-written skill trees into `dist/`.
 *
 * This script owns exactly three directories inside `dist/`: `pstack`, `skills/vendored`,
 * and `skills/authored`. It removes and rewrites those three and touches nothing else, so
 * `dist/*.mjs` from the bundle survives it in either order. That narrow scope is the whole
 * reason it exists as a separate step: a script that cleared `dist/` would delete the
 * bundle, and one that ran before the bundle would have its work deleted by `clean: true`.
 *
 * Each destination is replaced rather than merged, so a file deleted at the source is gone
 * from the output too. Merging would leave the previous run's files behind, and a reader
 * would be looking at a tree the build did not produce.
 */

import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ROOT } from "./root.ts";
import { PORT_ROOT, VENDORED_SKILLS_ROOT, AUTHORED_SKILLS_ROOT } from "../../src/paths.ts";

/** The generated tree, as it exists before the copy. */
export const GENERATED_PORT = join(ROOT, "pstack", "pstack");

/** One source tree and the destination it becomes. */
export interface CopyStep {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

/** The three copies, in the order they are reported. */
export function copySteps(): readonly CopyStep[] {
  return [
    { label: "pstack", from: GENERATED_PORT, to: PORT_ROOT },
    { label: "skills/vendored", from: join(ROOT, "skills", "vendored"), to: VENDORED_SKILLS_ROOT },
    { label: "skills/authored", from: join(ROOT, "skills", "authored"), to: AUTHORED_SKILLS_ROOT },
  ];
}

/** Replace one destination with a copy of its source. */
async function copyTree(step: CopyStep): Promise<void> {
  if (!existsSync(step.from)) {
    throw new Error(
      `${step.from}: missing. Run the step that produces it first; this script copies, it does not generate.`,
    );
  }
  await rm(step.to, { recursive: true, force: true });
  await mkdir(step.to, { recursive: true });
  await cp(step.from, step.to, { recursive: true });
}

/** Run the copy. Returns the process exit code. */
export async function main(): Promise<number> {
  try {
    for (const step of copySteps()) {
      await copyTree(step);
      console.log(`copied ${step.label} into ${step.to.slice(ROOT.length + 1)}`);
    }
  } catch (error) {
    console.error(`dist/ cannot be assembled: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
