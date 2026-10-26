/**
 * The fake-forge fixture `orch.test.ts` writes onto `PATH`.
 *
 * The upstream test writes a **bash** script and puts it on `PATH`, then the store
 * shells out to it once per query. That made the shipped test suite depend on `bash`,
 * which this release removes, so the generated fixture is a Node program instead.
 *
 * Why a separate module: the generated text must contain `${...}` sequences that the
 * *test file* interpolates at its own runtime, so it cannot be written as a template
 * literal here — a nested `${}` would be evaluated while this module loads. Every
 * piece is a single-quoted string, where those characters are inert, and the joined
 * result is exactly the source text the test writes to disk.
 *
 * The generated program contains no backtick: the test writes it inside a template
 * literal, so a backtick would close that literal and the bundle would not parse.
 * Values that need quoting are emitted through `JSON.stringify` in the generated file,
 * which is correct for any payload.
 *
 * Behaviour is the bash fixture's, case for case:
 * - the working directory must realpath to `<directory>/repo`, else exit 2;
 * - `pr list --head <branch> …` answers from the recorded rows for `stack/open`, and
 *   with fixed rows for `stack/closed` and `stack/merged`;
 * - `pr list --base <branch> …` answers for `stack/open` and an empty array for
 *   `stack/draft`;
 * - anything else is exit 2 with `unexpected <forge> arguments: …`.
 */

/** One line of the generated fixture, with `${...}` left for the test to expand. */
const LINES: readonly string[] = [
  "#!/usr/bin/env node",
  'const { readFileSync, realpathSync } = require("node:fs");',
  'const args = process.argv.slice(2).join(" ");',
  "const here = realpathSync(process.cwd());",
  'const expectedCwd = ${JSON.stringify(realpathSync(join(directory, "repo")))};',
  "if (here !== expectedCwd) {",
  '  process.stderr.write(${JSON.stringify(`${forge} ran outside the fixture repo: `)} + here + "\\\\n");',
  "  process.exit(2);",
  "}",
  "const expected = [",
  '  ${JSON.stringify(list("--head", "stack/open"))},',
  '  ${JSON.stringify(list("--head", "stack/closed"))},',
  '  ${JSON.stringify(list("--head", "stack/merged"))},',
  '  ${JSON.stringify(list("--base", "stack/open"))},',
  '  ${JSON.stringify(list("--base", "stack/draft"))}',
  "];",
  "const answers = [",
  '  () => readFileSync(${JSON.stringify(outputPath)}, "utf8"),',
  '  () => ${JSON.stringify(`${forgeRows(forge, [{ number: 13, state: "closed", head: "stack/closed", base: "stack/merged" }])}\\n`)},',
  '  () => ${JSON.stringify(`${forgeRows(forge, [{ number: 10, state: "merged", head: "stack/merged", base: "main" }])}\\n`)},',
  '  () => ${JSON.stringify(`${forgeRows(forge, [{ number: 14, state: "draft", head: "stack/draft", base: "stack/open" }, { number: 15, state: "closed", head: "stack/abandoned", base: "stack/open" }])}\\n`)},',
  '  () => ${JSON.stringify("[]\\n")}',
  "];",
  "const index = expected.indexOf(args);",
  "if (index === -1) {",
  '  process.stderr.write(${JSON.stringify(`unexpected ${forge} arguments: `)} + args + "\\\\n");',
  "  process.exit(2);",
  "}",
  "process.stdout.write(answers[index]());",
];

/** The generated fixture, newline-joined. */
export const NODE_FAKE_FORGE = LINES.join("\n");

/**
 * The bash fixture this replaces, verbatim from the pinned upstream.
 *
 * Copied as an array of single-quoted lines rather than one multi-line template: the
 * body contains `${...}`, and a template literal here would evaluate it. Kept beside
 * its replacement so the pair can be compared without opening the submodule.
 *
 * A bash `printf` needs a literal backslash before `n`, which is `\\\\n` in a
 * single-quoted JS literal and produces `\\n` in the generated file — the same two
 * characters the upstream source contains.
 */
export const BASH_FAKE_FORGE = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  'if [ "$(pwd -P)" != "${realpathSync(join(directory, "repo"))}" ]; then',
  '  printf \'${forge} ran outside the fixture repo: %s\\\\n\' "$(pwd -P)" >&2',
  "  exit 2",
  "fi",
  'case "$*" in',
  '  "${list("--head", "stack/open")}")',
  '    cat "${outputPath}"',
  "    ;;",
  '  "${list("--head", "stack/closed")}")',
  '    printf \'%s\\\\n\' \'${forgeRows(forge, [{ number: 13, state: "closed", head: "stack/closed", base: "stack/merged" }])}\'',
  "    ;;",
  '  "${list("--head", "stack/merged")}")',
  '    printf \'%s\\\\n\' \'${forgeRows(forge, [{ number: 10, state: "merged", head: "stack/merged", base: "main" }])}\'',
  "    ;;",
  '  "${list("--base", "stack/open")}")',
  '    printf \'%s\\\\n\' \'${forgeRows(forge, [',
  '      { number: 14, state: "draft", head: "stack/draft", base: "stack/open" },',
  "      {",
  "        number: 15,",
  '        state: "closed",',
  '        head: "stack/abandoned",',
  '        base: "stack/open",',
  "      },",
  "    ])}'",
  "    ;;",
  '  "${list("--base", "stack/draft")}")',
  '    printf \'[]\\\\n\'',
  "    ;;",
  "  *)",
  '    printf \'unexpected ${forge} arguments: %s\\\\n\' "$*" >&2',
  "    exit 2",
  "    ;;",
  "esac",
].join("\n");

/**
 * The exact anchor text in `orch.test.ts`: the bash fixture as a template literal.
 *
 * A backtick opens it, the body is `BASH_FAKE_FORGE`, and a newline plus a backtick
 * closes it.
 */
export const BASH_FAKE_FORGE_ANCHOR = "`" + BASH_FAKE_FORGE + "\n`";

/** The replacement text: the same template literal wrapping the Node program. */
export const NODE_FAKE_FORGE_REPLACEMENT = "`" + NODE_FAKE_FORGE + "\n`";
