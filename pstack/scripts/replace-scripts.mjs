/**
 * Put the built runtime where the shipped tree expects it.
 *
 * `vp pack` with `root: "."` and `unbundle: true` mirrors the input tree: the output
 * for `runtime/skills/<skill>/scripts/x.ts` is `dist/runtime/skills/<skill>/scripts/x.mjs`.
 * Every specifier inside that output is either a sibling (`./store.mjs`) or a declared
 * dependency (`commander`), never a shared chunk hoisted out of the tree, because
 * unbundle mode emits one file per input module instead of merging them.
 *
 * Keeping `root` at `.` rather than at `runtime` is what makes that hold as the sources
 * grow: a second top-level directory under `runtime/` lands under `dist/runtime/` beside
 * `skills/`, instead of being silently re-rooted into the skills namespace.
 *
 * The generated tree carries an upstream `skills/<skill>/scripts/` for these same skills,
 * holding the sources they shipped with. Those sources must not survive: a `.sh` script
 * or a `.ts` file in an installed package is unrunnable where no interpreter is
 * guaranteed, and shipping both forms would leave the reader guessing which one runs.
 *
 * `commander` is deliberately not copied. It is a `dependencies` entry of this package,
 * so the profile's own pnpm installed it where Node resolves it; a second copy here
 * would pin this checkout's build version and shadow the installed one.
 */

import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/** Where the build writes, mirroring the source tree below `runtime/`. */
const BUILT = join("dist", "runtime", "skills");

/** Where the shipped tree keeps its skills. */
const SHIPPED_SKILLS = join("dist", "pstack", "skills");

/** The skills whose scripts the runtime replaces. */
const REPLACED = ["poteto-mode", "show-me-your-work", "statechart"];

if (!existsSync(BUILT)) {
  console.error(`replace:scripts: ${BUILT} is missing; run \`vp run build:runtime\` first`);
  process.exit(1);
}
if (!existsSync(SHIPPED_SKILLS)) {
  console.error(`replace:scripts: ${SHIPPED_SKILLS} is missing; run \`vp run copy:pstack\` first`);
  process.exit(1);
}

const built = readdirSync(BUILT).filter((name) => statSync(join(BUILT, name)).isDirectory());
const unexpected = built.filter((name) => !REPLACED.includes(name));
if (unexpected.length > 0) {
  console.error(
    `replace:scripts: ${unexpected.join(", ")} has built scripts but is not in the replaced list; add it deliberately rather than letting the copy decide`,
  );
  process.exit(1);
}

let replaced = 0;
for (const skill of built) {
  const from = join(BUILT, skill, "scripts");
  const to = join(SHIPPED_SKILLS, skill, "scripts");
  if (!existsSync(from)) {
    console.error(`replace:scripts: ${from} is missing`);
    process.exit(1);
  }
  if (!existsSync(to)) {
    console.error(`replace:scripts: ${to} is not a generated skill directory`);
    process.exit(1);
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  replaced += 1;
}

console.log(
  `replace:scripts: replaced ${replaced} skill script director${replaced === 1 ? "y" : "ies"}`,
);
