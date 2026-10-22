/**
 * Check that every surgical rewrite still matches its upstream source.
 *
 * `FILE_REWRITES` and `SCRIPT_REWRITES` read exact upstream wording. When an
 * upstream edit changes that wording the pattern stops matching, the generated
 * text silently keeps the old sentence, and `sync:check` still passes because
 * the output is merely stale rather than forbidden-token dirty. This turns that
 * silent failure into a build error.
 *
 * Run with `--check` to fail; bare to list what matched.
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileRewriteSpecs, isBlockRewrite, scriptRewriteSpecs, type RewriteStep } from "./adapt.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM = join(ROOT, "upstream/cursor-plugins/pstack");
const check = process.argv.includes("--check");

/**
 * Describe what a step is allowed to change, so a reviewer can see the scope of
 * every rewrite without reading its 200-character regex.
 *
 * `removed` is the number of lines the upstream match covers. A token step must
 * report `1`; a block step must carry a reason. That is the mechanical answer to
 * "did this rewrite only touch a name?".
 */
function describe(spec: RewriteStep): { scope: "token" | "block"; reason: string | undefined } {
  return { scope: isBlockRewrite(spec) ? "block" : "token", reason: spec[2] };
}

async function main(): Promise<void> {
  const problems: string[] = [];
  let checked = 0;
  const blocks: string[] = [];

  for (const spec of [...fileRewriteSpecs(), ...scriptRewriteSpecs()]) {
    let source: string;
    try {
      source = await readFile(join(UPSTREAM, spec.path), "utf8");
    } catch {
      problems.push(`${spec.path}: no such upstream file`);
      continue;
    }
    for (const [index, step] of spec.rewrites.entries()) {
      checked += 1;
      const [pattern] = step;
      const match = pattern.exec(source);
      if (!match) {
        problems.push(
          `${spec.path}: rewrite #${index + 1} no longer matches upstream (${pattern.source.slice(0, 60)}…)`,
        );
        continue;
      }
      const { scope, reason } = describe(step);
      if (scope === "block") {
        blocks.push(`${spec.path} #${index + 1}: ${reason}`);
      }
    }
  }

  if (problems.length > 0) {
    console.error(
      "Stale rewrites. Upstream wording moved; update the pattern in scripts/adapt.ts.",
    );
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`All ${checked} surgical rewrites still match their upstream source.`);
  if (blocks.length > 0) {
    console.log(`\n${blocks.length} block rewrites, each with a written reason:`);
    for (const block of blocks) console.log(`  ${block}`);
  }
  if (check) console.log("\nRewrite anchors are current.");
}

await main();
