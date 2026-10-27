#!/usr/bin/env node
import { afterEach, describe, it } from "node:test";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { inspect } from "node:util";
import { access, chmod, mkdir, mkdtemp, open, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
//#region .runtime-sources/skills/poteto-mode/scripts/expect.ts
/**
* A small `expect` for `node:test`.
*
* The five upstream test files were written against `bun:test`. Their assertions
* are ordinary value comparisons, so this module supplies exactly the matchers
* they use rather than a general test framework. It is deliberately not a drop-in
* replacement: a matcher that is not listed here fails to compile, which keeps the
* port auditable against the calls that actually exist.
*
* Covered: `toBe`, `toEqual`, `toContain`, `toMatch`, `toThrow`, `toBeNull`,
* `toBeInstanceOf`, `toHaveLength`, `toEndWith`, `toMatchObject`, `.not` on each,
* and `rejects` / `resolves` for promises.
*
* Two differences from `bun:test`, stated so a failure is not misread:
*
* - `toEqual` is structural for arrays and plain objects, `Object.is` otherwise.
*   A class instance only equals itself; `toBeInstanceOf` is the matcher for type
*   identity. The ported tests compare plain data, which is why this is enough.
* - A failure throws `AssertionError` with the two values rendered, not Bun's
*   coloured diff.
*/
/** Raised by every failing assertion. */
var AssertionError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "AssertionError";
	}
};
function display(value) {
	if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
	return inspect(value, {
		depth: 3,
		breakLength: 120,
		maxArrayLength: 20
	});
}
function messageOf(error) {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return String(error);
}
/** Structural equality for the shapes the ported tests compare. */
function deepEqual(left, right) {
	if (Object.is(left, right)) return true;
	if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		return left.every((item, index) => deepEqual(item, right[index]));
	}
	if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
	const leftProto = Object.getPrototypeOf(left);
	if (leftProto !== Object.getPrototypeOf(right)) return false;
	if (leftProto !== Object.prototype && leftProto !== null) return false;
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every((key) => deepEqual(left[key], right[key]));
}
function contains(haystack, needle) {
	if (typeof haystack === "string") return haystack.includes(String(needle));
	if (Array.isArray(haystack)) return haystack.some((item) => deepEqual(item, needle));
	if (haystack instanceof Set) return [...haystack].some((item) => deepEqual(item, needle));
	return false;
}
/**
* Whether `expected` is a partial description of `actual`.
*
* `bun:test`'s `toMatchObject` is recursive: every key in `expected` must exist and
* match, arrays match element by element with the same partial rule, and extra keys
* in `actual` are allowed. That is what lets an assertion name only the fields it
* cares about, which several ported cases rely on.
*/
function matchesObject(actual, expected) {
	if (Array.isArray(expected)) {
		if (!Array.isArray(actual) || actual.length !== expected.length) return false;
		return expected.every((item, index) => matchesObject(actual[index], item));
	}
	if (expected instanceof Date) return deepEqual(actual, expected);
	if (expected === null || typeof expected !== "object") return deepEqual(actual, expected);
	if (actual === null || typeof actual !== "object") return false;
	return Object.entries(expected).every(([key, value]) => matchesObject(actual[key], value));
}
function thrownBy(call) {
	try {
		call();
		return { thrown: false };
	} catch (error) {
		return {
			thrown: true,
			error
		};
	}
}
function buildMatchers(actual, negate) {
	/**
	* Fail when `ok` is not what the matcher asked for.
	*
	* `negate` inverts the requirement, so `.not.toContain(x)` passes on a haystack
	* that does not contain `x` and fails when it does.
	*/
	const check = (ok, matcher, expected) => {
		if (ok === !negate) return;
		const relation = negate ? `not to ${matcher}` : matcher;
		throw new AssertionError(`expected ${display(actual)} ${relation} ${display(expected)}`);
	};
	const checkPlain = (ok, matcher) => {
		if (ok === !negate) return;
		throw new AssertionError(`expected ${display(actual)} ${negate ? `not to ${matcher}` : matcher}`);
	};
	const matchers = {
		toBe(expected) {
			check(Object.is(actual, expected), "toBe", expected);
		},
		toEqual(expected) {
			check(deepEqual(actual, expected), "toEqual", expected);
		},
		toContain(expected) {
			check(contains(actual, expected), "toContain", expected);
		},
		toMatch(expected) {
			const text = String(actual);
			check(typeof expected === "string" ? text.includes(expected) : expected.test(text), "toMatch", expected);
		},
		toThrow(expected) {
			if (typeof actual !== "function") throw new AssertionError(`toThrow needs a function, received ${display(actual)}`);
			const result = thrownBy(actual);
			if (!result.thrown) {
				checkPlain(false, "toThrow");
				return;
			}
			if (expected === void 0) {
				checkPlain(true, "toThrow");
				return;
			}
			const message = messageOf(result.error);
			const ok = typeof expected === "string" ? message.includes(expected) : expected instanceof RegExp ? expected.test(message) : result.error instanceof expected;
			check(ok, "toThrow", expected);
		},
		toBeNull() {
			checkPlain(actual === null, "toBeNull");
		},
		toBeInstanceOf(expected) {
			check(actual instanceof expected, "toBeInstanceOf", expected);
		},
		toHaveLength(expected) {
			const length = actual?.length;
			check(length === expected, "toHaveLength", expected);
		},
		toEndWith(expected) {
			check(String(actual).endsWith(expected), "toEndWith", expected);
		},
		toMatchObject(expected) {
			check(matchesObject(actual, expected), "toMatchObject", expected);
		}
	};
	Object.defineProperties(matchers, {
		not: {
			get: () => buildMatchers(actual, !negate),
			enumerable: true
		},
		rejects: {
			get: () => buildAsyncMatchers(actual, "rejects", negate),
			enumerable: true
		},
		resolves: {
			get: () => buildAsyncMatchers(actual, "resolves", negate),
			enumerable: true
		}
	});
	return matchers;
}
/**
* Compare against a settled promise.
*
* `rejects` reads the rejection reason and fails when the promise resolved;
* `resolves` is the mirror. Each matcher awaits the settlement, which is what
* makes `await expect(promise).rejects.toThrow(...)` wait before it compares.
*/
function buildAsyncMatchers(actual, mode, negate) {
	if (typeof actual?.then !== "function") throw new AssertionError(`expected a promise, received ${display(actual)}`);
	const wantRejection = mode === "rejects" !== negate;
	const settle = async () => {
		let resolved;
		let rejected;
		await Promise.resolve(actual).then((value) => {
			resolved = { value };
		}, (error) => {
			rejected = { error };
		});
		if (wantRejection) {
			if (resolved !== void 0) throw new AssertionError(`expected the promise to reject, it resolved to ${display(resolved.value)}`);
			return rejected?.error;
		}
		if (rejected !== void 0) throw new AssertionError(`expected the promise to resolve, it rejected with ${messageOf(rejected.error)}`);
		return resolved?.value;
	};
	/**
	* Run one matcher against the settled value.
	*
	* `toThrow` and `toBeInstanceOf` both read the rejection reason, so a thrown
	* reason is turned back into a thunk for `toThrow` rather than special-cased
	* twice. `negate` is already folded into the settlement mode, so the inner
	* matchers run un-negated.
	*/
	const wrap = async (name, expected) => {
		const subject = await settle();
		if (name === "toThrow") {
			buildMatchers(() => {
				throw subject;
			}, false).toThrow(expected);
			return;
		}
		if (name === "toBeNull") {
			buildMatchers(subject, false).toBeNull();
			return;
		}
		const matchers = buildMatchers(subject, false);
		const matcher = matchers[name];
		if (typeof matcher !== "function") throw new AssertionError(`unknown matcher ${name}`);
		matcher.call(matchers, expected);
	};
	const matchers = {
		toBe: (expected) => wrap("toBe", expected),
		toEqual: (expected) => wrap("toEqual", expected),
		toContain: (expected) => wrap("toContain", expected),
		toMatch: (expected) => wrap("toMatch", expected),
		toThrow: (expected) => wrap("toThrow", expected),
		toBeNull: () => wrap("toBeNull"),
		toBeInstanceOf: (expected) => wrap("toBeInstanceOf", expected),
		toHaveLength: (expected) => wrap("toHaveLength", expected),
		toEndWith: (expected) => wrap("toEndWith", expected),
		toMatchObject: (expected) => wrap("toMatchObject", expected)
	};
	Object.defineProperty(matchers, "not", {
		get: () => buildAsyncMatchers(actual, mode, !negate),
		enumerable: true
	});
	return matchers;
}
const expect = Object.assign((actual) => buildMatchers(actual, false), {
	not: (actual) => buildMatchers(actual, true),
	rejects: (actual) => buildAsyncMatchers(actual, "rejects", false),
	resolves: (actual) => buildAsyncMatchers(actual, "resolves", false)
});
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/support.ts
/**
* The one support module the ported upstream tests import.
*
* The five upstream test files were written for `bun:test` and use exactly two
* Bun facilities: its `expect`, and `Bun.spawnSync` / `Bun.spawn` for running git
* and short-lived processes. Rather than rewrite every call site, this module
* supplies those two shapes and the test patch only replaces the import line. The
* bodies below stay byte-for-byte the upstream text, so a future upstream change
* is still readable against this tree.
*
* `Bun.spawnSync` returns `{ exitCode, stdout, stderr, success }` with Buffer
* output and never throws on a nonzero exit; `node:child_process.spawnSync`
* returns `{ status, stdout, stderr }`. The adapter is the mapping between them,
* not a second implementation.
*
* `Bun.spawn` returns `{ pid, exited: Promise<number> }`. The adapter runs the
* child to completion and resolves `exited` with the exit status, which is what
* the one call site awaits.
*/
/**
* Run a command to completion, Bun-shaped.
*
* A signal-terminated child reports `exitCode: 1` rather than `null`, so a test
* that formats the code never prints `undefined` for a killed process.
*/
function spawnSync$1(argv, options = {}) {
	const [command, ...args] = argv;
	if (command === void 0) throw new TypeError("spawnSync needs a command");
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		stdio: [
			options.stdin === "inherit" ? "inherit" : "pipe",
			options.stdout === "inherit" ? "inherit" : "pipe",
			options.stderr === "inherit" ? "inherit" : "pipe"
		],
		encoding: "buffer"
	});
	const exitCode = result.status ?? 1;
	return {
		exitCode,
		stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.alloc(0),
		stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.alloc(0),
		success: exitCode === 0
	};
}
/**
* A child that exits immediately, as a real process.
*
* The current interpreter running an empty program is a process like any other: its
* `pid` is real and its exit status is 0.
*/
function immediateExit() {
	return spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
}
/** Whether `command` starts at all, checked without a shell. */
function resolves(command) {
	return spawnSync(command, ["--version"], { stdio: "ignore" }).error === void 0;
}
/**
* Start a command and expose Bun's `{ pid, exited }` shape.
*
* The one upstream call is `spawn(["true"])`, used to obtain a pid that has already
* exited so the test can plant a stale lock. It reads `pid` *before* awaiting
* `exited`, so the pid must be real and already dead when this returns.
*
* That rules out "spawn it and fall back on failure": the failure is asynchronous, so
* the caller would read `-1`. The probe is synchronous instead, which lets this
* function choose the right child before returning. `true` is used when it exists and
* the current interpreter otherwise — a `PATH` without the usual Unix utilities is
* exactly the environment this release has to work in.
*/
function spawn$1(argv) {
	const [command, ...args] = argv;
	if (command === void 0) throw new TypeError("spawn needs a command");
	const child = resolves(command) ? spawn(command, args, { stdio: "ignore" }) : immediateExit();
	return {
		pid: child.pid ?? -1,
		exited: new Promise((resolve) => {
			child.once("close", (code) => resolve(code ?? 1));
			child.once("error", () => resolve(1));
		})
	};
}
/** The `Bun` global the upstream tests reference, limited to what they call. */
const Bun = {
	spawnSync: spawnSync$1,
	spawn: spawn$1
};
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/orch/store.ts
const UNIT_HEADER = "id	track	state	branch	pr	sha	brief";
const LEDGER_HEADER = "pr	sha	verdict	evidence	verifier	ts";
const LOCK_FILE = ".orch.lock";
var UserError = class extends Error {};
var NotFoundError = class extends UserError {
	output;
	constructor(message, output) {
		super(message);
		this.output = output;
	}
};
function errorCode(error) {
	if (error !== null && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
	return null;
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isUnknownArray(value) {
	return Array.isArray(value);
}
function verdictOrNull(value) {
	switch (value) {
		case "live-ui-verified":
		case "unit-test-verified":
		case "type-check-only":
		case "verifier-blocked":
		case "verifier-failed": return value;
		default: return null;
	}
}
function frontierPrStateOrNull(value) {
	switch (value) {
		case "OPEN":
		case "MERGED":
		case "CLOSED": return value;
		default: return null;
	}
}
function parseVerdict(value) {
	const verdict = verdictOrNull(value);
	if (verdict === null) throw new UserError("verdict must be live-ui-verified, unit-test-verified, type-check-only, verifier-blocked, or verifier-failed");
	return verdict;
}
function cleanCell(value) {
	const cleaned = value.replace(/[\t\n\r]/g, " ");
	return /^[=+\-@]/.test(cleaned) ? `'${cleaned}` : cleaned;
}
function requiredCell(value, label) {
	const cleaned = cleanCell(value);
	if (cleaned.trim().length === 0) throw new UserError(`${label} must not be empty`);
	return cleaned;
}
function requiredLine(value, label) {
	const cleaned = value.replace(/[\n\r]/g, " ").trim();
	if (cleaned.length === 0) throw new UserError(`${label} must not be empty`);
	return cleaned;
}
function positiveInteger(value, label) {
	if (!Number.isSafeInteger(value) || value < 1) throw new UserError(`${label} must be a positive integer`);
	return value;
}
async function exists(path) {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return false;
		throw error;
	}
}
async function atomicWrite(path, contents) {
	const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, contents, { flag: "wx" });
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true });
	}
}
async function writeIfMissing(path, contents) {
	if (!await exists(path)) await atomicWrite(path, contents);
}
async function requiredFile(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (errorCode(error) === "ENOENT") throw new UserError(`store is not initialized at ${dirname(path)}; run orch init`);
		throw error;
	}
}
function holderIsDead(holder) {
	const pid = Number.parseInt(holder, 10);
	if (!Number.isSafeInteger(pid) || pid <= 0 || String(pid) !== holder) return false;
	try {
		process.kill(pid, 0);
		return false;
	} catch (error) {
		return errorCode(error) === "ESRCH";
	}
}
async function acquireLock(store, options) {
	const path = join(store, LOCK_FILE);
	const pid = String(process.pid);
	const create = async () => {
		const handle = await open(path, "wx");
		await handle.writeFile(`${pid}\n`);
		await handle.close();
	};
	const takeOver = async () => {
		await unlink(path);
		try {
			await create();
		} catch (retryError) {
			if (errorCode(retryError) === "EEXIST") throw new UserError(`store lock held by pid ${(await readFile(path, "utf8")).trim() || "unknown"}`);
			throw retryError;
		}
	};
	try {
		await create();
	} catch (error) {
		if (errorCode(error) !== "EEXIST") throw error;
		let holder = "unknown";
		try {
			holder = (await readFile(path, "utf8")).trim() || "unknown";
		} catch {
			holder = "unknown";
		}
		if (holderIsDead(holder)) {
			options.onStaleLock?.(holder);
			await takeOver();
		} else if (options.force) {
			options.onLockStolen?.(holder);
			await takeOver();
		} else throw new UserError(`store lock held by pid ${holder}`);
	}
	return async () => {
		try {
			if ((await readFile(path, "utf8")).trim() === pid) await unlink(path);
		} catch (error) {
			if (errorCode(error) !== "ENOENT") throw error;
		}
	};
}
async function readTsv(path, header, width) {
	const lines = (await requiredFile(path)).replace(/\r/g, "").split("\n");
	if (lines.shift() !== header) throw new UserError(`${basename(path)} has an invalid header`);
	return lines.filter((value) => value.length > 0).map((value) => {
		const cells = value.split("	");
		if (cells.length !== width) throw new UserError(`${basename(path)} has a malformed row`);
		return cells;
	});
}
async function writeTsv(path, header, rows) {
	const body = rows.map((row) => row.map(cleanCell).join("	")).join("\n");
	await atomicWrite(path, `${header}\n${body}${body.length > 0 ? "\n" : ""}`);
}
async function readUnits(store) {
	return (await readTsv(join(store, "units.tsv"), UNIT_HEADER, 7)).map((row) => ({
		id: row[0] ?? "",
		track: row[1] ?? "",
		state: row[2] ?? "",
		branch: row[3] ?? "",
		pr: row[4] ?? "",
		sha: row[5] ?? "",
		brief: row[6] ?? ""
	}));
}
function unitCells(unit) {
	return [
		unit.id,
		unit.track,
		unit.state,
		unit.branch,
		unit.pr,
		unit.sha,
		unit.brief
	];
}
async function saveUnits(store, rows) {
	await writeTsv(join(store, "units.tsv"), UNIT_HEADER, rows.map(unitCells));
}
async function readLedger(store) {
	return (await readTsv(join(store, "ledger.tsv"), LEDGER_HEADER, 6)).map((row) => {
		const rawVerdict = row[2] ?? "";
		const verdict = verdictOrNull(rawVerdict);
		if (verdict === null) throw new UserError(`ledger.tsv has invalid verdict ${rawVerdict}`);
		return {
			pr: row[0] ?? "",
			sha: row[1] ?? "",
			verdict,
			evidence: row[3] ?? "",
			verifier: row[4] ?? "",
			ts: row[5] ?? ""
		};
	});
}
function ledgerCells(row) {
	return [
		row.pr,
		row.sha,
		row.verdict,
		row.evidence,
		row.verifier,
		row.ts
	];
}
async function saveLedger(store, rows) {
	await writeTsv(join(store, "ledger.tsv"), LEDGER_HEADER, rows.map(ledgerCells));
}
function pointerCells(pointer) {
	return [
		pointer.ts,
		pointer.agent,
		pointer.unit,
		pointer.status,
		pointer.report
	];
}
async function readPointers(directory) {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (errorCode(error) === "ENOENT") throw new UserError(`store is not initialized at ${dirname(directory)}; run orch init`);
		throw error;
	}
	const result = [];
	const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".tsv")).sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of files) {
		const raw = (await readFile(join(directory, entry.name), "utf8")).replace(/\r?\n$/, "");
		const row = raw.split("	");
		if (/[\r\n]/.test(raw) || row.length !== 5) throw new UserError(`inbox pointer ${entry.name} is malformed`);
		result.push({
			ts: row[0] ?? "",
			agent: row[1] ?? "",
			unit: row[2] ?? "",
			status: row[3] ?? "",
			report: row[4] ?? ""
		});
	}
	return result;
}
function renderGates(rows) {
	if (rows.length === 0) return "";
	return `# Gates\n\n${rows.map((gate) => {
		const answer = gate.kind === "resolved" ? `\n- Answer: ${gate.answer}` : "";
		return `## ${gate.id}

- Status: ${gate.kind}
- Question: ${gate.question}
- Options: ${gate.options}
- Default: ${gate.defaultAnswer}${answer}`;
	}).join("\n\n")}\n`;
}
async function readGates(store) {
	const raw = (await requiredFile(join(store, "gates.md"))).replace(/\r/g, "").trim();
	if (raw.length === 0) return [];
	if (!raw.startsWith("# Gates\n\n## ")) throw new UserError("gates.md has an invalid heading");
	const result = [];
	for (const block of raw.slice(12).split("\n\n## ")) {
		const lines = block.split("\n").filter((value) => value.length > 0);
		const id = lines.shift() ?? "";
		const fields = /* @__PURE__ */ new Map();
		for (const value of lines) {
			const match = /^- ([^:]+): (.*)$/.exec(value);
			if (match === null) throw new UserError(`gates.md has a malformed gate ${id}`);
			fields.set(match[1] ?? "", match[2] ?? "");
		}
		const status = fields.get("Status");
		const question = fields.get("Question");
		const options = fields.get("Options");
		const defaultAnswer = fields.get("Default");
		if (id.length === 0 || question === void 0 || options === void 0 || defaultAnswer === void 0) throw new UserError(`gates.md has a malformed gate ${id}`);
		if (status === "open") result.push({
			kind: "open",
			id,
			question,
			options,
			defaultAnswer
		});
		else if (status === "resolved" && fields.has("Answer")) result.push({
			kind: "resolved",
			id,
			question,
			options,
			defaultAnswer,
			answer: fields.get("Answer") ?? ""
		});
		else throw new UserError(`gates.md has invalid status ${status ?? ""}`);
	}
	if (new Set(result.map((gate) => gate.id)).size !== result.length) throw new UserError("gates.md has duplicate gate ids");
	return result;
}
function parseFrontier(raw) {
	let value;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new UserError("frontier.json is not valid JSON");
	}
	if (!isRecord(value)) throw new UserError("frontier.json must contain an object");
	if (Object.keys(value).length === 0) return {
		generation: 0,
		prs: [],
		lowestUnmerged: null
	};
	if (typeof value.generation !== "number" || !Number.isSafeInteger(value.generation) || value.generation < 0 || !isUnknownArray(value.prs) || !(value.lowestUnmerged === null || typeof value.lowestUnmerged === "number" && Number.isSafeInteger(value.lowestUnmerged))) throw new UserError("frontier.json has an invalid shape");
	const prs = [];
	for (const row of value.prs) {
		const state = isRecord(row) ? frontierPrStateOrNull(row.state) : null;
		if (!isRecord(row) || typeof row.pr !== "number" || !Number.isSafeInteger(row.pr) || row.pr < 1 || typeof row.branches !== "string" || row.branches.length === 0 || typeof row.sha !== "string" || state === null) throw new UserError("frontier.json has an invalid PR row");
		prs.push({
			pr: row.pr,
			branches: row.branches,
			sha: row.sha,
			state
		});
	}
	return {
		generation: value.generation,
		prs,
		lowestUnmerged: value.lowestUnmerged
	};
}
async function readFrontier(store) {
	return parseFrontier(await requiredFile(join(store, "frontier.json")));
}
async function readStanding(store) {
	const raw = (await requiredFile(join(store, "preferences.md"))).replace(/\r/g, "");
	if (raw.trim().length === 0) return [];
	const result = [];
	for (const value of raw.split("\n").filter((item) => item.length > 0)) {
		const match = /^([1-9]\d*)\. (.+)$/.exec(value);
		const number = Number(match?.[1] ?? 0);
		if (match === null || number !== result.length + 1) throw new UserError("preferences.md has malformed numbering");
		result.push({
			number,
			line: match[2] ?? ""
		});
	}
	return result;
}
function countValues(values) {
	const result = {};
	for (const value of values) result[value] = (result[value] ?? 0) + 1;
	return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}
function summarize(unitRows, ledgerRows, currentFrontier, gateRows) {
	return {
		unitStates: countValues(unitRows.map((unit) => unit.state)),
		ledgerVerdicts: countValues(ledgerRows.map((row) => row.verdict)),
		frontierGeneration: currentFrontier.generation,
		openGateIds: gateRows.filter((gate) => gate.kind === "open").map((gate) => gate.id).sort()
	};
}
function countRecord(value) {
	if (!isRecord(value)) return null;
	const result = {};
	for (const [name, count] of Object.entries(value)) {
		if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return null;
		result[name] = count;
	}
	return result;
}
function previousSummary(raw) {
	const match = /<!-- orch-summary (.+) -->/.exec(raw);
	if (match === null) return null;
	let value;
	try {
		value = JSON.parse(match[1] ?? "");
	} catch {
		return null;
	}
	if (!isRecord(value) || typeof value.frontierGeneration !== "number" || !isUnknownArray(value.openGateIds)) return null;
	const unitStates = countRecord(value.unitStates);
	const ledgerVerdicts = countRecord(value.ledgerVerdicts);
	const openGateIds = value.openGateIds.filter((item) => typeof item === "string");
	if (unitStates === null || ledgerVerdicts === null || openGateIds.length !== value.openGateIds.length) return null;
	return {
		unitStates,
		ledgerVerdicts,
		frontierGeneration: value.frontierGeneration,
		openGateIds
	};
}
function changed(before, after) {
	if (before === null) return "first render";
	const result = [];
	const groups = [{
		label: "units",
		oldCounts: before.unitStates,
		newCounts: after.unitStates
	}, {
		label: "ledger",
		oldCounts: before.ledgerVerdicts,
		newCounts: after.ledgerVerdicts
	}];
	for (const { label, oldCounts, newCounts } of groups) {
		const names = [.../* @__PURE__ */ new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)])].sort();
		for (const name of names) {
			const oldCount = oldCounts[name] ?? 0;
			const newCount = newCounts[name] ?? 0;
			if (oldCount !== newCount) result.push(`${label} ${name} ${oldCount}->${newCount}`);
		}
	}
	if (before.frontierGeneration !== after.frontierGeneration) result.push(`frontier generation ${before.frontierGeneration}->${after.frontierGeneration}`);
	if (before.openGateIds.join("\0") !== after.openGateIds.join("\0")) result.push(`open gates ${before.openGateIds.length}->${after.openGateIds.length}`);
	return result.length === 0 ? "no derived changes" : result.join("; ");
}
function markdown(value) {
	return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}
function table(headers, rows) {
	if (rows.length === 0) return "(none)";
	return [
		`| ${headers.join(" | ")} |`,
		`| ${headers.map(() => "---").join(" | ")} |`,
		...rows.map((row) => `| ${row.map(markdown).join(" | ")} |`)
	].join("\n");
}
function statusMarkdown(unitRows, ledgerRows, currentFrontier, gateRows, currentSummary) {
	return `# Orchestrate status

Generated: ${(/* @__PURE__ */ new Date()).toISOString()}

## Units

States: ${countLine(currentSummary.unitStates)}

${table([
		"ID",
		"Track",
		"State",
		"Branch",
		"PR",
		"SHA",
		"Brief"
	], unitRows.map(unitCells))}

## Verification ledger

Verdicts: ${countLine(currentSummary.ledgerVerdicts)}

${table([
		"PR",
		"SHA",
		"Verdict",
		"Evidence",
		"Verifier",
		"Timestamp"
	], ledgerRows.map(ledgerCells))}

## Frontier

Generation: ${currentFrontier.generation}
Lowest unmerged: ${currentFrontier.lowestUnmerged ?? "none"}

${table([
		"Branch",
		"PR",
		"SHA",
		"State"
	], currentFrontier.prs.map((row) => [
		row.branches,
		String(row.pr),
		row.sha,
		row.state
	]))}

## Gates

${table([
		"ID",
		"Status",
		"Question",
		"Options",
		"Default",
		"Answer"
	], gateRows.map((gate) => [
		gate.id,
		gate.kind,
		gate.question,
		gate.options,
		gate.defaultAnswer,
		gate.kind === "resolved" ? gate.answer : ""
	]))}

<!-- orch-summary ${JSON.stringify(currentSummary)} -->
`;
}
function countLine(value) {
	const entries = Object.entries(value);
	return entries.length === 0 ? "none" : entries.map(([name, count]) => `${name}=${count}`).join(", ");
}
const FORGE_PULL_REQUEST_QUERIES = {
	gh: {
		stateField: "state",
		headField: "headRefName",
		baseField: "baseRefName",
		states: /* @__PURE__ */ new Map([
			["OPEN", "OPEN"],
			["MERGED", "MERGED"],
			["CLOSED", "CLOSED"]
		])
	},
	origin: {
		stateField: "status",
		headField: "headRef",
		baseField: "baseRef",
		states: /* @__PURE__ */ new Map([
			["open", "OPEN"],
			["draft", "OPEN"],
			["merged", "MERGED"],
			["closed", "CLOSED"]
		])
	}
};
function parseForge(value) {
	if (value === "gh" || value === "origin") return value;
	throw new UserError("forge must be gh or origin");
}
function runTool({ command, args, repo }) {
	try {
		return execFileSync(command, args, {
			cwd: repo,
			encoding: "utf8",
			env: process.env,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
	} catch (error) {
		throw new UserError(`${command} ${args.join(" ")} failed: ${errorMessage(error)}`);
	}
}
function listPullRequests({ filter, branch, forge, repo }) {
	const query = FORGE_PULL_REQUEST_QUERIES[forge];
	const command = `${forge} pr list ${filter} ${branch}`;
	const raw = runTool({
		command: forge,
		args: [
			"pr",
			"list",
			filter,
			branch,
			"--state",
			"all",
			"--json",
			[
				"number",
				query.stateField,
				query.headField,
				query.baseField
			].join(",")
		],
		repo
	});
	let value;
	try {
		value = JSON.parse(raw);
	} catch {
		throw new UserError(`${command} output is not valid JSON`);
	}
	if (!isUnknownArray(value)) throw new UserError(`${command} output is not a JSON array`);
	return value.map((row) => {
		const status = isRecord(row) ? row[query.stateField] : void 0;
		const state = typeof status === "string" ? query.states.get(status) ?? null : null;
		const head = isRecord(row) ? row[query.headField] : void 0;
		const base = isRecord(row) ? row[query.baseField] : void 0;
		if (!isRecord(row) || typeof row.number !== "number" || !Number.isSafeInteger(row.number) || row.number < 1 || state === null || typeof head !== "string" || head.length === 0 || typeof base !== "string" || base.length === 0) throw new UserError(`${command} output has an invalid PR row`);
		return {
			pr: row.number,
			state,
			branch: head,
			base
		};
	});
}
function branchPullRequest({ branch, forge, repo }) {
	const rows = listPullRequests({
		filter: "--head",
		branch,
		forge,
		repo
	});
	const row = rows[0];
	if (row === void 0) throw new UserError(`branch ${branch} has no pull request; open one with ${forge} pr create, or resolve the frontier from a branch whose chain is fully submitted`);
	if (rows.length > 1) throw new UserError(`branch ${branch} has multiple pull requests (${rows.map((item) => `#${item.pr}`).join(", ")}); close the stale ones first`);
	return row;
}
function openChildren({ branch, forge, repo }) {
	return listPullRequests({
		filter: "--base",
		branch,
		forge,
		repo
	}).filter((row) => row.state === "OPEN");
}
function runGit({ args, repo }) {
	return runTool({
		command: "git",
		args,
		repo
	}).trim();
}
function branchSha({ branch, repo }) {
	const sha = runGit({
		args: ["rev-parse", branch],
		repo
	});
	if (!/^[0-9a-f]{40,64}$/i.test(sha)) throw new UserError(`git rev-parse ${branch} returned an invalid SHA`);
	return sha;
}
function currentBranch(repo) {
	return runGit({
		args: [
			"symbolic-ref",
			"--short",
			"HEAD"
		],
		repo
	});
}
function trunkBranch(repo) {
	try {
		return runGit({
			args: [
				"symbolic-ref",
				"--short",
				"refs/remotes/origin/HEAD"
			],
			repo
		}).replace(/^origin\//, "");
	} catch {
		return "main";
	}
}
function resolveFrontier(repo, forge) {
	const trunk = trunkBranch(repo);
	const current = currentBranch(repo);
	if (current === trunk) return [];
	const seen = /* @__PURE__ */ new Set([current]);
	let bottom = branchPullRequest({
		branch: current,
		forge,
		repo
	});
	const chain = [bottom];
	while (bottom.base !== trunk) {
		if (seen.has(bottom.base)) throw new UserError(`pull request base chain loops at branch ${bottom.base}`);
		seen.add(bottom.base);
		bottom = branchPullRequest({
			branch: bottom.base,
			forge,
			repo
		});
		chain.unshift(bottom);
	}
	let tip = current;
	for (;;) {
		const children = openChildren({
			branch: tip,
			forge,
			repo
		});
		const child = children[0];
		if (child === void 0) break;
		if (children.length > 1) throw new UserError(`stack is not linear: branches ${children.map((row) => row.branch).join(", ")} all target ${tip}`);
		if (seen.has(child.branch)) throw new UserError(`pull request base chain loops at branch ${child.branch}`);
		seen.add(child.branch);
		chain.push(child);
		tip = child.branch;
	}
	if (new Set(chain.map((row) => row.pr)).size !== chain.length) throw new UserError("pull request base chain contains duplicate pull requests");
	return chain.map((row) => ({
		pr: row.pr,
		branches: row.branch,
		sha: branchSha({
			branch: row.branch,
			repo
		}),
		state: row.state
	}));
}
function validateFrontierPin({ actual, expected }) {
	if (actual.length === expected.length && actual.every((pr, index) => pr === expected[index])) return;
	const actualSet = new Set(actual);
	const expectedSet = new Set(expected);
	const missing = expected.filter((pr) => !actualSet.has(pr));
	const extra = actual.filter((pr) => !expectedSet.has(pr));
	const drift = [];
	if (missing.length > 0) drift.push(`missing from resolved chain: ${missing.join(",")}`);
	if (extra.length > 0) drift.push(`extra in resolved chain: ${extra.join(",")}`);
	if (missing.length === 0 && extra.length === 0) drift.push(`order differs: expected ${expected.join(",")}; resolved ${actual.join(",")}`);
	throw new UserError(`frontier pin mismatch: ${drift.join("; ")}`);
}
function openStore(directory, options = {}) {
	const store = resolve(directory);
	let closed = false;
	let releaseLock = null;
	let lockRequest = null;
	const ensureOpen = () => {
		if (closed) throw new UserError("store is closed");
	};
	const ensureLock = async () => {
		ensureOpen();
		if (releaseLock !== null) return;
		if (lockRequest === null) lockRequest = acquireLock(store, options).then((release) => {
			releaseLock = release;
		});
		try {
			await lockRequest;
		} catch (error) {
			lockRequest = null;
			throw error;
		}
	};
	const beginWrite = async () => {
		ensureOpen();
		if (!await exists(store)) throw new UserError(`store is not initialized at ${store}; run orch init`);
		await ensureLock();
	};
	return {
		units: {
			add: async (params) => {
				await beginWrite();
				const row = {
					id: requiredCell(params.id, "unit id"),
					track: requiredCell(params.track, "track"),
					state: "pending",
					branch: "",
					pr: "",
					sha: "",
					brief: params.brief === void 0 ? "" : requiredCell(params.brief, "brief")
				};
				const rows = [...await readUnits(store)];
				if (rows.some((unit) => unit.id === row.id)) throw new UserError(`unit ${row.id} already exists`);
				rows.push(row);
				await saveUnits(store, rows);
				return row;
			},
			set: async (params) => {
				await beginWrite();
				const id = requiredCell(params.id, "unit id");
				const state = requiredCell(params.state, "state");
				const rows = [...await readUnits(store)];
				const index = rows.findIndex((unit) => unit.id === id);
				const old = rows[index];
				if (index < 0 || old === void 0) throw new NotFoundError(`unit ${id} not found`);
				const row = {
					...old,
					state,
					branch: params.branch === void 0 ? old.branch : requiredCell(params.branch, "branch"),
					pr: params.pr === void 0 ? old.pr : String(positiveInteger(params.pr, "PR")),
					sha: params.sha === void 0 ? old.sha : requiredCell(params.sha, "SHA")
				};
				rows[index] = row;
				await saveUnits(store, rows);
				return row;
			},
			get: async (id) => {
				ensureOpen();
				const cleanId = requiredCell(id, "unit id");
				const row = (await readUnits(store)).find((unit) => unit.id === cleanId);
				if (row === void 0) throw new NotFoundError(`unit ${cleanId} not found`);
				return row;
			},
			list: async (params = {}) => {
				ensureOpen();
				const state = params.state === void 0 ? void 0 : requiredCell(params.state, "state");
				const track = params.track === void 0 ? void 0 : requiredCell(params.track, "track");
				return (await readUnits(store)).filter((unit) => (state === void 0 || unit.state === state) && (track === void 0 || unit.track === track));
			},
			counts: async () => {
				ensureOpen();
				return countValues((await readUnits(store)).map((unit) => unit.state));
			}
		},
		ledger: {
			record: async (params) => {
				await beginWrite();
				const verdict = parseVerdict(params.verdict);
				const row = {
					pr: String(positiveInteger(params.pr, "PR")),
					sha: requiredCell(params.sha, "SHA"),
					verdict,
					evidence: requiredCell(params.evidence, "evidence"),
					verifier: params.verifier === void 0 ? "" : requiredCell(params.verifier, "verifier"),
					ts: (/* @__PURE__ */ new Date()).toISOString()
				};
				const rows = [...await readLedger(store)];
				const index = rows.findIndex((old) => old.pr === row.pr && old.sha === row.sha);
				if (index < 0) rows.push(row);
				else rows[index] = row;
				await saveLedger(store, rows);
				return row;
			},
			check: async (params) => {
				ensureOpen();
				const pr = String(positiveInteger(params.pr, "PR"));
				const sha = requiredCell(params.sha, "SHA");
				const row = (await readLedger(store)).find((value) => value.pr === pr && value.sha === sha);
				if (row === void 0) throw new NotFoundError("NOT-VERIFIED", {
					compact: "NOT-VERIFIED",
					json: {
						pr,
						sha,
						verdict: "NOT-VERIFIED"
					}
				});
				return row;
			},
			summary: async () => {
				ensureOpen();
				return countValues((await readLedger(store)).map((row) => row.verdict));
			}
		},
		inbox: {
			push: async (params) => {
				await beginWrite();
				const pointer = {
					ts: (/* @__PURE__ */ new Date()).toISOString(),
					agent: requiredCell(params.agent, "agent"),
					unit: requiredCell(params.unit, "unit"),
					status: requiredCell(params.status, "status"),
					report: params.report === void 0 ? "" : requiredCell(params.report, "report")
				};
				const inbox = join(store, "inbox");
				if (!await exists(inbox)) throw new UserError(`store is not initialized at ${store}; run orch init`);
				const filename = `${pointer.ts.replace(/[:.]/g, "-")}-${process.pid}-${randomUUID()}.tsv`;
				const contents = `${pointerCells(pointer).map(cleanCell).join("	")}\n`;
				await atomicWrite(join(inbox, filename), contents);
				return {
					pointer,
					filename
				};
			},
			drain: async () => {
				await beginWrite();
				const inbox = join(store, "inbox");
				const rows = await readPointers(inbox);
				const drained = join(store, `.inbox-drain-${process.pid}-${randomUUID()}`);
				await rename(inbox, drained);
				try {
					await mkdir(inbox);
				} catch (error) {
					await rename(drained, inbox);
					throw error;
				}
				await rm(drained, {
					recursive: true,
					force: true
				});
				return rows;
			},
			peek: async () => {
				ensureOpen();
				return readPointers(join(store, "inbox"));
			},
			count: async () => {
				ensureOpen();
				return (await readPointers(join(store, "inbox"))).length;
			}
		},
		gates: {
			park: async (params) => {
				await beginWrite();
				const gate = {
					kind: "open",
					id: requiredLine(params.id, "gate id"),
					question: requiredLine(params.question, "question"),
					options: requiredLine(params.options, "options"),
					defaultAnswer: requiredLine(params.defaultAnswer, "default")
				};
				const rows = [...await readGates(store)];
				const index = rows.findIndex((old) => old.id === gate.id);
				if (index < 0) rows.push(gate);
				else rows[index] = gate;
				await atomicWrite(join(store, "gates.md"), renderGates(rows));
				return gate;
			},
			list: async () => {
				ensureOpen();
				return (await readGates(store)).filter((gate) => gate.kind === "open");
			},
			resolve: async (params) => {
				await beginWrite();
				const id = requiredLine(params.id, "gate id");
				const rows = [...await readGates(store)];
				const index = rows.findIndex((gate) => gate.id === id);
				const old = rows[index];
				if (index < 0 || old === void 0) throw new NotFoundError(`gate ${id} not found`);
				const gate = {
					kind: "resolved",
					id: old.id,
					question: old.question,
					options: old.options,
					defaultAnswer: old.defaultAnswer,
					answer: requiredLine(params.answer, "answer")
				};
				rows[index] = gate;
				await atomicWrite(join(store, "gates.md"), renderGates(rows));
				return gate;
			}
		},
		frontier: {
			set: async (params) => {
				await beginWrite();
				const repo = resolve(requiredLine(params.repo, "repo directory"));
				const forge = parseForge(params.forge ?? "gh");
				const pin = params.prs === void 0 ? void 0 : params.prs.map((pr) => positiveInteger(pr, "PR"));
				if (pin !== void 0 && new Set(pin).size !== pin.length) throw new UserError("--prs must not contain duplicates");
				const old = await readFrontier(store);
				const prs = resolveFrontier(repo, forge);
				if (pin !== void 0) validateFrontierPin({
					actual: prs.map((row) => row.pr),
					expected: pin
				});
				const value = {
					generation: old.generation + 1,
					prs,
					lowestUnmerged: prs.find((row) => row.state === "OPEN")?.pr ?? null
				};
				await atomicWrite(join(store, "frontier.json"), `${JSON.stringify(value, null, 2)}\n`);
				return value;
			},
			show: async () => {
				ensureOpen();
				return readFrontier(store);
			}
		},
		standing: {
			show: async () => {
				ensureOpen();
				return readStanding(store);
			},
			add: async (params) => {
				await beginWrite();
				const rows = [...await readStanding(store)];
				const item = {
					number: rows.length + 1,
					line: requiredLine(params.line, "standing order")
				};
				rows.push(item);
				await atomicWrite(join(store, "preferences.md"), `${rows.map((row) => `${row.number}. ${row.line}`).join("\n")}\n`);
				return item;
			}
		},
		status: { render: async () => {
			await beginWrite();
			const unitRows = await readUnits(store);
			const ledgerRows = await readLedger(store);
			const currentFrontier = await readFrontier(store);
			const gateRows = await readGates(store);
			const currentSummary = summarize(unitRows, ledgerRows, currentFrontier, gateRows);
			const path = join(store, "status.md");
			const change = changed(await exists(path) ? previousSummary(await readFile(path, "utf8")) : null, currentSummary);
			await atomicWrite(path, statusMarkdown(unitRows, ledgerRows, currentFrontier, gateRows, currentSummary));
			return {
				units: unitRows,
				ledger: ledgerRows,
				frontier: currentFrontier,
				gates: gateRows,
				summary: currentSummary,
				changed: change
			};
		} },
		init: async () => {
			ensureOpen();
			await mkdir(store, { recursive: true });
			await ensureLock();
			await writeIfMissing(join(store, "units.tsv"), `${UNIT_HEADER}\n`);
			await writeIfMissing(join(store, "ledger.tsv"), `${LEDGER_HEADER}\n`);
			await mkdir(join(store, "inbox"), { recursive: true });
			await writeIfMissing(join(store, "gates.md"), "");
			await writeIfMissing(join(store, "preferences.md"), "");
			await writeIfMissing(join(store, "frontier.json"), "{}\n");
			return { store };
		},
		close: async () => {
			if (closed) return;
			if (lockRequest !== null) try {
				await lockRequest;
			} catch {}
			const release = releaseLock;
			releaseLock = null;
			closed = true;
			if (release !== null) await release();
		}
	};
}
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/orch/orch.test.ts
const SCRIPT = join(import.meta.dirname, "orch.mjs");
const directories = [];
const handles = [];
async function makeDirectory() {
	const directory = await mkdtemp(join(tmpdir(), "orch-test-"));
	directories.push(directory);
	return directory;
}
function useStore(directory, options) {
	const store = openStore(directory, options);
	handles.push(store);
	return store;
}
async function initializedStore() {
	const directory = await makeDirectory();
	const store = useStore(directory);
	await store.init();
	return {
		directory,
		store
	};
}
function git({ args, repo }) {
	const result = Bun.spawnSync([
		"git",
		"-C",
		repo,
		...args
	]);
	if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
	return result.stdout.toString().trim();
}
async function makeGitStack(directory) {
	const repo = join(directory, "repo");
	await mkdir(repo);
	git({
		repo,
		args: ["init", "--initial-branch=main"]
	});
	git({
		repo,
		args: [
			"config",
			"user.name",
			"Orch Test"
		]
	});
	git({
		repo,
		args: [
			"config",
			"user.email",
			"orch@example.com"
		]
	});
	await writeFile(join(repo, "main.txt"), "main\n");
	git({
		repo,
		args: ["add", "."]
	});
	git({
		repo,
		args: [
			"commit",
			"-m",
			"main"
		]
	});
	for (const [index, branch] of [
		"stack/merged",
		"stack/closed",
		"stack/open",
		"stack/draft"
	].entries()) {
		git({
			repo,
			args: [
				"checkout",
				"-b",
				branch
			]
		});
		await writeFile(join(repo, `stack-${index}.txt`), `${branch}\n`);
		git({
			repo,
			args: ["add", "."]
		});
		git({
			repo,
			args: [
				"commit",
				"-m",
				branch
			]
		});
	}
	git({
		repo,
		args: ["checkout", "stack/open"]
	});
	return {
		repo,
		mergedSha: git({
			repo,
			args: ["rev-parse", "stack/merged"]
		}),
		closedSha: git({
			repo,
			args: ["rev-parse", "stack/closed"]
		}),
		openSha: git({
			repo,
			args: ["rev-parse", "stack/open"]
		}),
		draftSha: git({
			repo,
			args: ["rev-parse", "stack/draft"]
		})
	};
}
const FORGE_FIXTURES = {
	gh: {
		fields: "number,state,headRefName,baseRefName",
		row: ({ number, state, head, base }) => ({
			number,
			state: state === "draft" ? "OPEN" : state.toUpperCase(),
			headRefName: head,
			baseRefName: base
		})
	},
	origin: {
		fields: "number,status,headRef,baseRef",
		row: ({ number, state, head, base }) => ({
			number,
			status: state,
			headRef: head,
			baseRef: base
		})
	}
};
function forgeRows(forge, prs) {
	return JSON.stringify(prs.map((pr) => FORGE_FIXTURES[forge].row(pr)));
}
async function withFakeForge({ directory, forge, operation, currentRows }) {
	const bin = join(directory, "bin");
	const outputPath = join(directory, "forge-output.txt");
	await mkdir(bin, { recursive: true });
	await writeFile(outputPath, `${currentRows ?? forgeRows(forge, [{
		number: 11,
		state: "open",
		head: "stack/open",
		base: "stack/closed"
	}])}\n`);
	const { fields } = FORGE_FIXTURES[forge];
	const list = (filter, branch) => `pr list ${filter} ${branch} --state all --json ${fields}`;
	const fake = join(bin, forge);
	await writeFile(fake, `#!/usr/bin/env node
const { readFileSync, realpathSync } = require("node:fs");
const args = process.argv.slice(2).join(" ");
const here = realpathSync(process.cwd());
const expectedCwd = ${JSON.stringify(realpathSync(join(directory, "repo")))};
if (here !== expectedCwd) {
  process.stderr.write(${JSON.stringify(`${forge} ran outside the fixture repo: `)} + here + "\\n");
  process.exit(2);
}
const expected = [
  ${JSON.stringify(list("--head", "stack/open"))},
  ${JSON.stringify(list("--head", "stack/closed"))},
  ${JSON.stringify(list("--head", "stack/merged"))},
  ${JSON.stringify(list("--base", "stack/open"))},
  ${JSON.stringify(list("--base", "stack/draft"))}
];
const answers = [
  () => readFileSync(${JSON.stringify(outputPath)}, "utf8"),
  () => ${JSON.stringify(`${forgeRows(forge, [{
		number: 13,
		state: "closed",
		head: "stack/closed",
		base: "stack/merged"
	}])}\n`)},
  () => ${JSON.stringify(`${forgeRows(forge, [{
		number: 10,
		state: "merged",
		head: "stack/merged",
		base: "main"
	}])}\n`)},
  () => ${JSON.stringify(`${forgeRows(forge, [{
		number: 14,
		state: "draft",
		head: "stack/draft",
		base: "stack/open"
	}, {
		number: 15,
		state: "closed",
		head: "stack/abandoned",
		base: "stack/open"
	}])}\n`)},
  () => ${JSON.stringify("[]\n")}
];
const index = expected.indexOf(args);
if (index === -1) {
  process.stderr.write(${JSON.stringify(`unexpected ${forge} arguments: `)} + args + "\\n");
  process.exit(2);
}
process.stdout.write(answers[index]());
`);
	await chmod(fake, 493);
	const originalPath = process.env.PATH;
	process.env.PATH = `${bin}:${originalPath ?? ""}`;
	try {
		return await operation();
	} finally {
		if (originalPath === void 0) delete process.env.PATH;
		else process.env.PATH = originalPath;
	}
}
function runCli(args, env = process.env) {
	const result = Bun.spawnSync([
		process.execPath,
		SCRIPT,
		...args
	], { env });
	return {
		code: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString()
	};
}
afterEach(async () => {
	for (const store of handles.splice(0).reverse()) await store.close();
	for (const directory of directories.splice(0)) await rm(directory, {
		recursive: true,
		force: true
	});
});
describe("Store", () => {
	it("initializes an idempotent plain-file store and releases its lock", async () => {
		const directory = await makeDirectory();
		const store = useStore(directory);
		expect(await store.init()).toEqual({ store: directory });
		const firstUnits = await readFile(join(directory, "units.tsv"), "utf8");
		const firstLedger = await readFile(join(directory, "ledger.tsv"), "utf8");
		expect(await store.init()).toEqual({ store: directory });
		expect(await readFile(join(directory, "units.tsv"), "utf8")).toBe(firstUnits);
		expect(await readFile(join(directory, "ledger.tsv"), "utf8")).toBe(firstLedger);
		expect((await readdir(directory)).sort()).toEqual([
			".orch.lock",
			"frontier.json",
			"gates.md",
			"inbox",
			"ledger.tsv",
			"preferences.md",
			"units.tsv"
		]);
		await store.close();
		expect(await readdir(directory)).not.toContain(".orch.lock");
	});
	it("composes unit add, set, get, list, and counts", async () => {
		const { store } = await initializedStore();
		expect(await store.units.add({
			id: "u1",
			track: "build",
			brief: "briefs/u1.md"
		})).toMatchObject({
			id: "u1",
			state: "pending"
		});
		expect(await store.units.add({
			id: "=SUM(A1)",
			track: "+build"
		})).toMatchObject({
			id: "'=SUM(A1)",
			track: "'+build"
		});
		const updated = await store.units.set({
			id: "u1",
			state: "done",
			branch: "poteto/u1",
			pr: 184530,
			sha: "abc123"
		});
		expect(updated).toEqual({
			id: "u1",
			track: "build",
			state: "done",
			branch: "poteto/u1",
			pr: "184530",
			sha: "abc123",
			brief: "briefs/u1.md"
		});
		expect(await store.units.get("u1")).toEqual(updated);
		expect(await store.units.list({
			state: "done",
			track: "build"
		})).toEqual([updated]);
		expect(await store.units.counts()).toEqual({
			done: 1,
			pending: 1
		});
		await expect(store.units.add({
			id: "u1",
			track: "build"
		})).rejects.toThrow("unit u1 already exists");
		await expect(store.units.set({
			id: "missing",
			state: "done"
		})).rejects.toBeInstanceOf(NotFoundError);
	});
	it("records, replaces, checks, and summarizes typed ledger verdicts", async () => {
		const { store } = await initializedStore();
		try {
			await store.ledger.check({
				pr: 184530,
				sha: "abc123"
			});
			throw new Error("expected ledger check to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(NotFoundError);
			if (error instanceof NotFoundError) expect(error.output).toEqual({
				compact: "NOT-VERIFIED",
				json: {
					pr: "184530",
					sha: "abc123",
					verdict: "NOT-VERIFIED"
				}
			});
		}
		expect(() => parseVerdict("looks-good")).toThrow("verdict must be");
		const recorded = await store.ledger.record({
			pr: 184530,
			sha: "abc123",
			verdict: "unit-test-verified",
			evidence: "reports/verify.md",
			verifier: "opus"
		});
		expect(await store.ledger.check({
			pr: 184530,
			sha: "abc123"
		})).toEqual(recorded);
		expect(await store.ledger.summary()).toEqual({ "unit-test-verified": 1 });
		await store.ledger.record({
			pr: 184530,
			sha: "abc123",
			verdict: "live-ui-verified",
			evidence: "reports/live.md"
		});
		expect(await store.ledger.summary()).toEqual({ "live-ui-verified": 1 });
	});
	it("pushes, peeks, and atomically drains inbox pointers", async () => {
		const { directory, store } = await initializedStore();
		const first = await store.inbox.push({
			agent: "worker-1",
			unit: "u1",
			status: "done",
			report: "reports/u1.md"
		});
		expect(first.pointer).toMatchObject({
			unit: "u1",
			status: "done"
		});
		expect(first.filename).toEndWith(".tsv");
		await store.inbox.push({
			agent: "worker-2",
			unit: "u2",
			status: "failed"
		});
		expect(await store.inbox.count()).toBe(2);
		expect(await store.inbox.peek()).toHaveLength(2);
		expect(await store.inbox.count()).toBe(2);
		expect(await store.inbox.drain()).toHaveLength(2);
		expect(await store.inbox.count()).toBe(0);
		expect(await readdir(join(directory, "inbox"))).toEqual([]);
		expect((await readdir(directory)).filter((name) => name.startsWith(".inbox-drain-"))).toEqual([]);
	});
	it("replaces a stale lock whose holder pid is dead", async () => {
		const { directory } = await initializedStore();
		const exited = Bun.spawn(["true"]);
		await exited.exited;
		await writeFile(join(directory, ".orch.lock"), `${exited.pid}\n`);
		const stale = [];
		const recovered = useStore(directory, { onStaleLock: (holder) => stale.push(holder) });
		expect(await recovered.units.add({
			id: "u1",
			track: "build"
		})).toMatchObject({ id: "u1" });
		expect(stale).toEqual([String(exited.pid)]);
		await recovered.close();
		expect(await readdir(directory)).not.toContain(".orch.lock");
	});
	it("blocks a writer and steals the pid lock only with force", async () => {
		const { directory, store } = await initializedStore();
		await store.close();
		await writeFile(join(directory, ".orch.lock"), `${process.pid}\n`);
		const blocked = useStore(directory);
		await expect(blocked.units.add({
			id: "u1",
			track: "build"
		})).rejects.toThrow(`store lock held by pid ${process.pid}`);
		const stolen = [];
		const forced = useStore(directory, {
			force: true,
			onLockStolen: (holder) => stolen.push(holder)
		});
		expect(await forced.units.add({
			id: "u1",
			track: "build"
		})).toMatchObject({ id: "u1" });
		expect(stolen).toEqual([String(process.pid)]);
		await forced.close();
		expect(await readdir(directory)).not.toContain(".orch.lock");
	});
	it("parks gates, stores standing orders, and renders status", async () => {
		const { directory, store } = await initializedStore();
		await store.units.add({
			id: "u1",
			track: "build"
		});
		expect(await store.gates.park({
			id: "release",
			question: "Ship now?",
			options: "ship,wait",
			defaultAnswer: "wait"
		})).toMatchObject({
			kind: "open",
			id: "release"
		});
		expect(await store.standing.add({ line: "Never force push." })).toEqual({
			number: 1,
			line: "Never force push."
		});
		const first = await store.status.render();
		expect(first.changed).toBe("first render");
		expect(first.summary.openGateIds).toEqual(["release"]);
		expect(await readFile(join(directory, "status.md"), "utf8")).toContain("| release | open | Ship now? |");
		expect((await store.status.render()).changed).toBe("no derived changes");
		expect(await store.gates.resolve({
			id: "release",
			answer: "ship"
		})).toMatchObject({
			kind: "resolved",
			answer: "ship"
		});
		expect((await store.status.render()).changed).toBe("open gates 1->0");
		expect(await store.gates.list()).toEqual([]);
		expect(await store.standing.show()).toEqual([{
			number: 1,
			line: "Never force push."
		}]);
	});
	for (const forge of ["gh", "origin"]) {
		it(`resolves the ordered frontier from the ${forge} base chain and validates an optional pin`, async () => {
			const { directory, store } = await initializedStore();
			const stack = await makeGitStack(directory);
			const forgeParams = forge === "gh" ? {} : { forge };
			await withFakeForge({
				directory,
				forge,
				operation: async () => {
					expect(await store.frontier.set({
						repo: stack.repo,
						...forgeParams
					})).toEqual({
						generation: 1,
						prs: [
							{
								pr: 10,
								branches: "stack/merged",
								sha: stack.mergedSha,
								state: "MERGED"
							},
							{
								pr: 13,
								branches: "stack/closed",
								sha: stack.closedSha,
								state: "CLOSED"
							},
							{
								pr: 11,
								branches: "stack/open",
								sha: stack.openSha,
								state: "OPEN"
							},
							{
								pr: 14,
								branches: "stack/draft",
								sha: stack.draftSha,
								state: "OPEN"
							}
						],
						lowestUnmerged: 11
					});
					expect((await store.frontier.set({
						repo: stack.repo,
						...forgeParams,
						prs: [
							10,
							13,
							11,
							14
						]
					})).generation).toBe(2);
					expect((await store.frontier.show()).generation).toBe(2);
					await expect(store.frontier.set({
						repo: stack.repo,
						...forgeParams,
						prs: [
							10,
							11,
							12
						]
					})).rejects.toThrow("frontier pin mismatch: missing from resolved chain: 12; extra in resolved chain: 13,14");
					await expect(store.frontier.set({
						repo: stack.repo,
						...forgeParams,
						prs: [
							13,
							10,
							11,
							14
						]
					})).rejects.toThrow("frontier pin mismatch: order differs: expected 13,10,11,14; resolved 10,13,11,14");
					await expect(store.frontier.set({
						repo: stack.repo,
						...forgeParams,
						prs: [10, 10]
					})).rejects.toThrow("--prs must not contain duplicates");
				}
			});
		});
		it(`rejects unparseable ${forge} output loudly`, async () => {
			const { directory, store } = await initializedStore();
			const stack = await makeGitStack(directory);
			await withFakeForge({
				directory,
				forge,
				currentRows: "this line is not forge output",
				operation: async () => {
					await expect(store.frontier.set({
						repo: stack.repo,
						forge
					})).rejects.toThrow(`${forge} pr list --head stack/open output is not valid JSON`);
				}
			});
		});
	}
	it("names the missing pull request when a chain branch has none", async () => {
		const { directory, store } = await initializedStore();
		const stack = await makeGitStack(directory);
		await withFakeForge({
			directory,
			forge: "gh",
			currentRows: "[]",
			operation: async () => {
				await expect(store.frontier.set({ repo: stack.repo })).rejects.toThrow("branch stack/open has no pull request; open one with gh pr create");
			}
		});
	});
	it("rejects malformed TSV, verdict, frontier, and inbox data", async () => {
		const { directory, store } = await initializedStore();
		await writeFile(join(directory, "units.tsv"), "wrong\n");
		await expect(store.units.list()).rejects.toThrow("units.tsv has an invalid header");
		await writeFile(join(directory, "units.tsv"), "id	track	state	branch	pr	sha	brief\nshort	row\n");
		await expect(store.units.list()).rejects.toThrow("units.tsv has a malformed row");
		await writeFile(join(directory, "ledger.tsv"), "pr	sha	verdict	evidence	verifier	ts\n1	sha	invalid	report	me	now\n");
		await expect(store.ledger.summary()).rejects.toThrow("ledger.tsv has invalid verdict invalid");
		await writeFile(join(directory, "frontier.json"), "{\"generation\":\"1\"}\n");
		await expect(store.frontier.show()).rejects.toThrow("frontier.json has an invalid shape");
		await writeFile(join(directory, "inbox", "bad.tsv"), "too	short\n");
		await expect(store.inbox.peek()).rejects.toThrow("inbox pointer bad.tsv is malformed");
	});
	it("rejects operations after close", async () => {
		const { store } = await initializedStore();
		await store.close();
		await expect(store.units.list()).rejects.toThrow("store is closed");
		await expect(store.status.render()).rejects.toBeInstanceOf(UserError);
	});
});
describe("orch CLI", () => {
	it("prints commander help and rejects invalid parsing with exit 1", async () => {
		const help = runCli(["--help"]);
		expect(help.code).toBe(0);
		expect(help.stdout).toContain("Commands:");
		expect(help.stdout).toContain("unit");
		expect(help.stdout).toContain("ledger");
		const frontierHelp = runCli([
			"frontier",
			"set",
			"--help"
		]);
		expect(frontierHelp.code).toBe(0);
		expect(frontierHelp.stdout).toContain("--repo <dir>");
		expect(frontierHelp.stdout).toContain("--forge <forge>");
		expect(frontierHelp.stdout).toContain("--prs <n,...>");
		const directory = await makeDirectory();
		const invalid = runCli([
			"--store",
			directory,
			"unit",
			"add",
			"u1"
		]);
		expect(invalid.code).toBe(1);
		expect(invalid.stderr).toContain("required option '--track <track>'");
		const badForge = runCli([
			"--store",
			directory,
			"frontier",
			"set",
			"--repo",
			directory,
			"--forge",
			"gt"
		]);
		expect(badForge.code).toBe(1);
		expect(badForge.stderr).toContain("Allowed choices are gh, origin");
	});
	it("accepts ORCH_STORE and emits complete JSON", async () => {
		const directory = await makeDirectory();
		const env = {
			...process.env,
			ORCH_STORE: directory
		};
		expect(runCli(["init"], env).code).toBe(0);
		const added = runCli([
			"unit",
			"add",
			"u1",
			"--track",
			"build",
			"--json"
		], env);
		expect(added.code).toBe(0);
		expect(JSON.parse(added.stdout)).toEqual({
			id: "u1",
			track: "build",
			state: "pending",
			branch: "",
			pr: "",
			sha: "",
			brief: ""
		});
	});
	it("maps user and not-found outcomes to the preserved exit codes", async () => {
		const directory = await makeDirectory();
		expect(runCli([
			"--store",
			directory,
			"init"
		]).code).toBe(0);
		const missingRepo = runCli([
			"--store",
			directory,
			"frontier",
			"set"
		]);
		expect(missingRepo.code).toBe(1);
		expect(missingRepo.stderr).toContain("set --repo <dir> or ORCH_REPO");
		const userError = runCli([
			"--store",
			directory,
			"unit",
			"add",
			"",
			"--track",
			"build"
		]);
		expect(userError.code).toBe(1);
		expect(userError.stderr).toContain("unit id must not be empty");
		const missingUnit = runCli([
			"--store",
			directory,
			"unit",
			"get",
			"missing"
		]);
		expect(missingUnit.code).toBe(2);
		expect(missingUnit.stderr).toContain("unit missing not found");
		const missingLedger = runCli([
			"--store",
			directory,
			"--json",
			"ledger",
			"check",
			"184530",
			"abc123"
		]);
		expect(missingLedger.code).toBe(2);
		expect(JSON.parse(missingLedger.stdout)).toEqual({
			pr: "184530",
			sha: "abc123",
			verdict: "NOT-VERIFIED"
		});
		expect(missingLedger.stderr).toBe("");
	});
});
//#endregion
export {};
