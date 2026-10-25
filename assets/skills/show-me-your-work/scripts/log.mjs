#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
//#region .runtime-sources/skills/poteto-mode/scripts/log.ts
/**
* Append one well-formed row to a show-me-your-work decision log (TSV).
*
* A Node replacement for the upstream `scripts/log.sh`. The observable rules are
* the shell script's, because `skills/show-me-your-work/SKILL.md` tells the model
* to read this file in a spreadsheet:
*
* - The header is written once, and only when the file is missing or empty.
* - Rows are appended, never rewritten. A network mount can make the emptiness
*   test lie for a file that exists, and the cost is one stray header line, not
*   the rows.
* - Tabs, CRs, and LFs inside a cell become spaces, so a cell always stays on one
*   line and a row always has exactly six columns.
* - A cell starting with `=`, `+`, `-`, or `@` gets one leading quote. Evidence
*   is attacker-controlled (PR titles, filenames, generated text), and a
*   spreadsheet parses those four characters as a formula.
* - The row ends with a newline.
*
* No shell, no `date` process, and no `tr`/`printf` semantics to reproduce.
*/
/** The exact header line, including its trailing newline. */
const HEADER = "ts	phase	decision	why	evidence	result\n";
/**
* Usage text.
*
* The shell script printed `log.sh` here because that was its own name. The
* shipped file is `log.mjs`, and an error that tells the reader to run a script
* this package no longer contains is worse than one that names the real path. The
* exit code and the stream are unchanged.
*/
const USAGE = "usage: log.mjs <logfile> <phase> <decision> <why> <evidence> <result>\n";
/** Formula-leading characters a spreadsheet would evaluate. */
const FORMULA_PREFIXES = [
	"=",
	"+",
	"-",
	"@"
];
/**
* One cell as the spreadsheet sees it.
*
* Exported because the skill's own contract is worth a unit test: the rules are
* about what lands in a cell, not about how a row is assembled.
*/
function cleanCell(value) {
	const flat = value.replaceAll(/[\t\n\r]/g, " ");
	return FORMULA_PREFIXES.some((prefix) => flat.startsWith(prefix)) ? `'${flat}` : flat;
}
/** `YYYY-MM-DDTHH:MM:SSZ`, the format `date -u +%Y-%m-%dT%H:%M:%SZ` prints. */
function timestamp(now = /* @__PURE__ */ new Date()) {
	return now.toISOString().replace(/\.\d{3}Z$/, "Z");
}
/** Read whether a file is missing or empty, treating any read failure as empty. */
function isEmptyOrMissing(logfile) {
	if (!existsSync(logfile)) return true;
	try {
		return statSync(logfile).size === 0;
	} catch {
		return true;
	}
}
/**
* Append one row.
*
* @param logfile - target TSV; its parent directories are created as needed.
* @param cells - exactly five cell values: phase, decision, why, evidence, result.
* @param now - injectable clock, so the timestamp format is testable.
* @returns the row written, without re-reading the file.
* @throws {TypeError} when `cells` does not hold exactly five values.
*/
function appendDecisionRow(logfile, cells, now = /* @__PURE__ */ new Date()) {
	if (cells.length !== 5) throw new TypeError(`expected 5 cells after the logfile, received ${cells.length}`);
	const absolute = resolve(logfile);
	const directory = dirname(absolute);
	if (directory !== "" && !existsSync(directory)) mkdirSync(directory, { recursive: true });
	if (isEmptyOrMissing(absolute)) appendFileSync(absolute, HEADER);
	const row = `${[timestamp(now), ...cells.map(cleanCell)].join("	")}\n`;
	appendFileSync(absolute, row);
	return row;
}
/** Run the CLI. Returns the process exit code. */
function main(argv, io = {
	stdout: (value) => process.stdout.write(value),
	stderr: (value) => process.stderr.write(value)
}) {
	if (argv.length !== 6) {
		io.stderr(USAGE);
		return 1;
	}
	const [logfile, ...cells] = argv;
	try {
		appendDecisionRow(logfile, cells);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		io.stderr(`log.mjs: ${message}\n`);
		return 1;
	}
}
const entryPoint = process.argv[1];
if (entryPoint !== void 0 && resolve(entryPoint) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
//#endregion
export { HEADER, USAGE, appendDecisionRow, cleanCell, main, timestamp };
