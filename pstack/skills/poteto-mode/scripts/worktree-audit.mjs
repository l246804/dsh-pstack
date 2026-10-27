#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
//#region .runtime-sources/skills/poteto-mode/scripts/worktree-audit.ts
/**
* Read-only worktree prune audit.
*
* A Node replacement for the upstream `scripts/worktree-audit.sh`. The shell
* script's job was to classify every git worktree by size, age, merge state,
* uncommitted work, remote/PR state, and the newest supplied session, then print
* one TSV table sorted by size with a suggested bucket. That job is unchanged; what
* changed is the toolchain. This file runs under Node alone, needs no `bash`, no
* `jq`, and no `awk`, and reads the caller's session JSON with `JSON.parse`.
*
* Behaviour kept deliberately identical, because the playbook and the tests name
* the columns:
*
* - The header is `# base: <ref>` then one TSV header line, written once.
* - Columns are SIZE, AGE, MERGED, DIRTY, REMOTE, PR, LAST_CHAT, PINNED, BUCKET,
*   WORKTREE, in that order.
* - The main worktree is never a candidate. Only `git worktree list` provides
*   paths; nothing is hand-typed.
* - `MERGED` is `YES` only when the worktree HEAD is an ancestor of the base.
*   Squash merges are not ancestors, so the PR state is the real signal there.
* - `DIRTY` counts tracked edits as `wip:<n>` and untracked-only as `scratch:<n>`,
*   with `clean` for neither.
* - `REMOTE` is `pushed`, `ahead<n>`, `detached`, or `no-remote`.
* - `PR` is `#<number>/<state>` from the forge, or `-`.
* - `PINNED` is always `unknown`: this host exposes no pinned-state source, so the
*   user's own set decides and the script says so instead of guessing.
* - `BUCKET` is `hold-wip`, `hold-open-pr`, `unknown-usage`, `verify-recent-chat`,
*   `safe`, or `review`. An unknown usage signal never reaches `safe`.
* - Rows are sorted by SIZE descending, then kept in the order they were produced.
* - The session store is never scanned. `--sessions` is the only usage input, and
*   without it the LAST_CHAT column is `-` and the bucket is `unknown-usage`.
*/
/** The shape `--sessions` takes, repeated in every message about it. */
const SESSIONS_SHAPE = "a JSON array of {\"sessionId\",\"cwd\",\"lastEventTime\"} objects";
const PINNED = "unknown";
const HEADER = [
	"SIZE",
	"AGE",
	"MERGED",
	"DIRTY",
	"REMOTE",
	"PR",
	"LAST_CHAT",
	"PINNED",
	"BUCKET",
	"WORKTREE"
];
/** The bucket for a worktree whose usage signal is missing. */
const UNKNOWN_USAGE_BUCKET = "unknown-usage";
/** Raised for a usage problem; the caller prints the message and exits nonzero. */
var AuditError = class extends Error {
	exitCode;
	constructor(message, exitCode = 1) {
		super(message);
		this.name = "AuditError";
		this.exitCode = exitCode;
	}
};
/** How many days a worktree may be untouched and still count as recent. */
const RECENT_DAYS = 4;
/**
* Run git, returning stdout, or `undefined` when it fails.
*
* The shell script wrote `2>/dev/null` on most calls and branched on the exit
* status, so a failure is a normal value here rather than an exception.
*/
function git(repo, args) {
	try {
		return execFileSync("git", [
			"-C",
			repo,
			...args
		], {
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			maxBuffer: 33554432
		});
	} catch {
		return;
	}
}
/** Run git without `-C`, for commands that must see the real repository root. */
function gitHere(cwd, args) {
	try {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			maxBuffer: 33554432
		});
	} catch {
		return;
	}
}
/** `git worktree list --porcelain`, parsed into worktree paths in order. */
function worktreePaths(repo) {
	const out = git(repo, [
		"worktree",
		"list",
		"--porcelain"
	]);
	if (out === void 0) return [];
	return out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9));
}
/**
* Human size, matching `du -h`.
*
* GNU `du -h` divides by 1024, promotes the unit when the value reaches 1024, and
* prints one decimal below ten and a rounded integer at or above ten. Verified
* against `du` on this host: 8.0K for 4096 bytes, 12K for 8192, 1.1M for 1 MiB,
* 513M for 512 MiB. Reproducing the format keeps the column comparable with the
* numbers the playbook quotes and removes the dependency on `du` and `awk`.
*/
function formatSize(bytes) {
	const units = [
		"B",
		"K",
		"M",
		"G",
		"T",
		"P"
	];
	if (bytes < 1024) return `${bytes}B`;
	let value = bytes / 1024;
	let unit = 1;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const suffix = units[unit];
	return `${value < 10 ? value.toFixed(1) : String(Math.round(value))}${suffix}`;
}
/**
* Directory size in bytes as `du -s` counts it: allocated blocks, directories
* included.
*
* Three details make this match `du`, and each was checked against it on this host:
*
* - `stat.blocks` is in 512-byte units, not bytes.
* - A directory consumes blocks of its own, so its `blocks` counts too. Skipping
*   them reads one 4 KiB block low per directory.
* - `.git` here is a file in a linked worktree, not a directory, so it contributes
*   its own block and nothing is traversed through it.
*
* That block accounting is the point of the column: the playbook quotes the space
* `du` reports before deleting. A symlink contributes its own block and is never
* traversed, matching `du` without `-L`.
*/
function directorySize(root) {
	let total = 0;
	const pending = [root];
	while (pending.length > 0) {
		const current = pending.pop();
		let details;
		try {
			details = statSync(current, { throwIfNoEntry: false });
		} catch {
			continue;
		}
		if (details === void 0) continue;
		total += details.blocks === void 0 ? details.size : details.blocks * 512;
		if (!details.isDirectory()) continue;
		let names;
		try {
			names = readdirSync(current);
		} catch {
			continue;
		}
		for (const name of names) pending.push(resolve(current, name));
	}
	return total;
}
/** `SIZE` as `du -sh` would print it, or `-` when the directory is gone. */
function sizeColumn(worktree) {
	try {
		if (!statSync(worktree).isDirectory()) return "-";
	} catch {
		return "-";
	}
	return formatSize(directorySize(worktree));
}
/** `AGE` as `<n>d`, or `?` when the HEAD time is unavailable. */
function ageColumn(headTimestamp, now) {
	if (!(headTimestamp > 0)) return "?";
	return `${Math.floor((now - headTimestamp) / 86400)}d`;
}
/**
* `DIRTY` for one worktree.
*
* `git status --porcelain` marks untracked entries with `??`. Anything else is
* tracked work, which is what a human has to look at before deleting.
*/
function dirtyColumn(porcelain) {
	const lines = porcelain.split("\n").filter((line) => line !== "");
	if (lines.length === 0) return "clean";
	const tracked = lines.filter((line) => !line.startsWith("??"));
	if (tracked.length > 0) return `wip:${tracked.length}`;
	return `scratch:${lines.filter((line) => line.startsWith("??")).length}`;
}
/** `MERGED` for one worktree, from whether HEAD is an ancestor of the base. */
function mergedColumn(isAncestor) {
	return isAncestor ? "YES" : "no";
}
/** `REMOTE` for one worktree. */
function remoteColumn(input) {
	if (input.branch === void 0 || input.branch === "") return "detached";
	if (!input.hasRemote) return "no-remote";
	if (input.remoteSha !== void 0 && input.head !== void 0 && input.remoteSha === input.head) return "pushed";
	return `ahead${input.aheadCount ?? 0}`;
}
/** `PR` for one branch, matching the first entry the forge reported for it. */
function prColumn(branch, prs) {
	if (branch === void 0 || branch === "") return "-";
	const hit = prs.find((pr) => pr.head === branch);
	return hit === void 0 ? "-" : `#${hit.number}/${hit.state}`;
}
/**
* Whether a session's recorded cwd is this worktree or a directory below it.
*
* Both sides go through `resolve` before comparing. `git worktree list` returns
* platform separators while a session's `cwd` may have been written by a different
* source, so on Windows `C:\repo\wt` and `C:/repo/wt` name the same checkout but are
* different strings. The old comparison hardcoded `/`, so it matched nothing there:
* every `LAST_CHAT` was `-` and every bucket silently degraded to `unknown-usage`.
*
* `resolve` also normalises trailing separators and `..` segments, so neither can
* make one path look like an ancestor of the other by accident.
*/
function sameOrInside(cwd, worktree) {
	const child = resolve(cwd);
	const parent = resolve(worktree);
	return child === parent || child.startsWith(`${parent}${sep}`);
}
/** The newest supplied session whose cwd is this worktree or below it. */
function lastSession(worktree, sessions) {
	if (sessions === void 0 || sessions.length === 0) return void 0;
	const matches = sessions.filter((session) => sameOrInside(session.cwd ?? "", worktree));
	if (matches.length === 0) return void 0;
	return matches.toSorted((left, right) => (left.lastEventTime ?? 0) - (right.lastEventTime ?? 0))[matches.length - 1];
}
/** `LAST_CHAT` for one worktree. */
function lastChatColumn(session) {
	return session === void 0 ? "-" : session.sessionId ?? "unknown";
}
/** Whether a session counts as recent for the bucket decision. */
function isRecent(session, now) {
	const time = session?.lastEventTime ?? 0;
	if (!(time > 0)) return false;
	return Math.floor((now - time) / 86400) <= 4;
}
/**
* The suggested bucket.
*
* Uncommitted tracked work outranks everything, then an open PR, then the usage
* signal. An unknown usage signal never reaches `safe`: without the caller's
* session input the bucket stays `unknown-usage`, and the playbook asks the user.
*/
function bucketFor(input) {
	if (input.dirty.startsWith("wip:")) return "hold-wip";
	if (input.pr.endsWith("/open") || input.pr.endsWith("/draft")) return "hold-open-pr";
	if (!input.usageKnown) return UNKNOWN_USAGE_BUCKET;
	if (input.usedRecently) return "verify-recent-chat";
	if (input.merged === "YES" || input.pr !== "-") return "safe";
	return "review";
}
/**
* Read this user's PRs from whichever forge CLI can answer.
*
* `origin` reports `status`, `gh` reports `state`; both are normalized to a
* lowercase `state` here. An unreachable forge is an empty list, not an error: the
* PR column is one signal among several and a first pass may run offline.
*/
function readForgePrs(cwd, run = execFileSync) {
	const origin = tryJson(run, cwd, "origin", [
		"pr",
		"list",
		"--author",
		"@me",
		"--state",
		"all",
		"--limit",
		"1000",
		"--json",
		"number,status,headRef"
	]);
	if (origin !== void 0) return normalizeOrigin(origin);
	const gh = tryJson(run, cwd, "gh", [
		"pr",
		"list",
		"--author",
		"@me",
		"--state",
		"all",
		"--limit",
		"1000",
		"--json",
		"number,state,headRefName"
	]);
	if (gh !== void 0) return normalizeGh(gh);
	return [];
}
function tryJson(run, cwd, command, args) {
	try {
		const out = run(command, args, {
			cwd,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			],
			maxBuffer: 33554432
		});
		return JSON.parse(out);
	} catch {
		return;
	}
}
/** `[{number, status, headRef}]` from the `origin` CLI. */
function normalizeOrigin(raw) {
	if (!Array.isArray(raw)) return [];
	const prs = [];
	for (const entry of raw) {
		if (entry === null || typeof entry !== "object") continue;
		const record = entry;
		const number = record["number"];
		const head = record["headRef"];
		if (typeof number !== "number" || typeof head !== "string") continue;
		prs.push({
			number,
			state: String(record["status"] ?? ""),
			head
		});
	}
	return prs;
}
/** `[{number, state, headRefName}]` from the `gh` CLI, with a lowercase state. */
function normalizeGh(raw) {
	if (!Array.isArray(raw)) return [];
	const prs = [];
	for (const entry of raw) {
		if (entry === null || typeof entry !== "object") continue;
		const record = entry;
		const number = record["number"];
		const head = record["headRefName"];
		if (typeof number !== "number" || typeof head !== "string") continue;
		prs.push({
			number,
			state: String(record["state"] ?? "").toLowerCase(),
			head
		});
	}
	return prs;
}
/**
* Pick the base ref when the caller gave no `-b`.
*
* `origin/HEAD`, then `origin/main`, then `origin/master`, matching the shell
* script. An empty result means no base exists and the caller must pass one.
*/
function resolveBase(repo) {
	const candidates = [];
	const head = git(repo, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD"
	]);
	if (head !== void 0) candidates.push(head.trim());
	candidates.push("origin/main", "origin/master");
	return candidates.find((candidate) => candidate !== "" && git(repo, [
		"rev-parse",
		"--verify",
		"--quiet",
		`${candidate}^{commit}`
	]) !== void 0);
}
/** Build one row. Every column is a pure function so each has a unit test. */
function buildRow(worktree, context) {
	const head = git(worktree, ["rev-parse", "HEAD"])?.trim();
	const headTimestamp = Number(git(worktree, [
		"log",
		"-1",
		"--format=%ct",
		"HEAD"
	])?.trim() ?? 0);
	const isAncestor = head !== void 0 && head !== "" && head !== "0" ? git(worktree, [
		"merge-base",
		"--is-ancestor",
		head,
		context.base
	]) !== void 0 : false;
	const dirty = dirtyColumn(git(worktree, ["status", "--porcelain"]) ?? "");
	const branchText = git(worktree, [
		"symbolic-ref",
		"--quiet",
		"--short",
		"HEAD"
	]);
	const branch = branchText === void 0 ? "" : branchText.trim();
	const hasRemote = branch !== "" && git(worktree, [
		"show-ref",
		"--verify",
		"--quiet",
		`refs/remotes/origin/${branch}`
	]) !== void 0;
	const remoteSha = hasRemote ? git(worktree, ["rev-parse", `origin/${branch}`])?.trim() : void 0;
	const aheadText = hasRemote ? git(worktree, [
		"rev-list",
		"--count",
		`origin/${branch}..HEAD`
	]) : void 0;
	const remote = remoteColumn({
		branch: branch === "" ? void 0 : branch,
		hasRemote,
		remoteSha,
		head: head?.trim(),
		aheadCount: aheadText === void 0 ? void 0 : Number(aheadText.trim())
	});
	const pr = prColumn(branch === "" ? void 0 : branch, context.prs);
	const session = lastSession(worktree, context.sessions);
	const usageKnown = session !== void 0;
	const sessionsProvided = context.sessions !== void 0;
	const bucket = bucketFor({
		dirty,
		pr,
		merged: mergedColumn(isAncestor),
		usageKnown,
		usedRecently: isRecent(session, context.now)
	});
	return {
		size: sizeColumn(worktree),
		age: ageColumn(headTimestamp, context.now),
		merged: mergedColumn(isAncestor),
		dirty,
		remote,
		pr,
		lastChat: lastChatColumn(session),
		pinned: PINNED,
		bucket,
		note: usageNote({
			usageKnown,
			sessionsProvided
		}),
		worktree
	};
}
/**
* Why a row's usage signal is what it is.
*
* Both "nobody supplied a session list" and "a list was supplied but it never
* mentioned this worktree" produce the `unknown-usage` bucket, and the caller has
* to fix a different thing in each case: build the list, or widen it. Collapsing
* them would lose that distinction, which is the only diagnostic the row carries.
*/
function usageNote(input) {
	if (input.usageKnown) return void 0;
	return input.sessionsProvided ? "no session in the supplied list touched this worktree" : "no session list supplied";
}
/** Sort rows by SIZE descending, preserving the original order on a tie. */
function sortRows(rows) {
	const sizeOf = (row) => {
		const match = /^([\d.]+)([BKMGTP]?)$/.exec(row.size);
		if (match === null) return 0;
		return Number(match[1]) * 1024 ** ({
			"": 0,
			B: 0,
			K: 1,
			M: 2,
			G: 3,
			T: 4,
			P: 5
		}[match[2]] ?? 0);
	};
	return rows.map((row, index) => ({
		row,
		index
	})).sort((left, right) => sizeOf(right.row) - sizeOf(left.row) || left.index - right.index).map((entry) => entry.row);
}
/** Render the whole table, header included. */
function renderTable(rows, base) {
	const lines = [`# base: ${base}`, HEADER.join("	")];
	for (const row of rows) lines.push([
		row.size,
		row.age,
		row.merged,
		row.dirty,
		row.remote,
		row.pr,
		row.lastChat,
		row.pinned,
		row.bucket,
		row.worktree
	].join("	"));
	const notes = rows.filter((row) => row.note !== void 0);
	if (notes.length > 0) {
		lines.push("# usage signal unknown for:");
		for (const row of notes) lines.push(`#   ${row.worktree}: ${row.note}`);
	}
	return `${lines.join("\n")}\n`;
}
/**
* Read and validate the `--sessions` file.
*
* The shell version required a JSON array via `jq -e 'type == "array"'` and pinned
* the path before changing directory. Both hold here: the path is resolved before
* any `git -C`, and a non-array is an error rather than an empty list, because a
* silently ignored usage signal would quietly turn every bucket into
* `unknown-usage`.
*
* Every element is checked, not filtered. The array is a projection the caller
* builds from `pstack_history` results, so a malformed entry is a real mistake; the
* previous `filter` dropped such entries and let the row fall through to
* `unknown-usage`, which is exactly the silent data loss the paragraph above says
* this function refuses to do.
*/
function readSessionsFile(path) {
	const absolute = isAbsolute(path) ? path : resolve(process.cwd(), path);
	let text;
	try {
		text = readFileSync(absolute, "utf8");
	} catch {
		throw new AuditError(`cannot read sessions file: ${path}`);
	}
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new AuditError(`sessions file must be ${SESSIONS_SHAPE}: ${path}`);
	}
	if (!Array.isArray(parsed)) throw new AuditError(`sessions file must be ${SESSIONS_SHAPE}: ${path}. Build it from pstack_history results; the history page itself is not an array.`);
	return parsed.map((entry, index) => {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new AuditError(`sessions[${index}] must be an object, got ${JSON.stringify(entry)?.slice(0, 60) ?? "undefined"}`);
		const { sessionId, cwd, lastEventTime } = entry;
		if (typeof sessionId !== "string" || sessionId === "") throw new AuditError(`sessions[${index}].sessionId must be a non-empty string`);
		if (cwd !== void 0 && cwd !== null && typeof cwd !== "string") throw new AuditError(`sessions[${index}].cwd must be a string or null`);
		if (lastEventTime !== void 0 && typeof lastEventTime !== "number") throw new AuditError(`sessions[${index}].lastEventTime must be a number`);
		return {
			sessionId,
			...cwd === void 0 ? {} : { cwd },
			...lastEventTime === void 0 ? {} : { lastEventTime }
		};
	});
}
/** Usage text, kept close to the shell script's help. */
const USAGE = [
	"Usage: worktree-audit.mjs [-b|--base <ref>] [-s|--sessions <json>] [repo-path]",
	"  repo-path defaults to the current repo.",
	"  -b sets the ref the MERGED column checks against (e.g. origin/integration).",
	"  Without it the base is origin/HEAD, then origin/main, then origin/master.",
	"  -s takes the JSON you produced with `pstack_history`, an array of",
	"  {\"sessionId\",\"cwd\",\"lastEventTime\"}. This script never reads the session",
	"  store, so without it LAST_CHAT is \"-\" and the bucket is unknown-usage.",
	"  PINNED is always \"unknown\": this host exposes no pinned-state source, so the",
	"  user's own set decides.",
	""
].join("\n");
/**
* Parse the command line.
*
* An unknown option and a missing argument value both exit 2, as the shell script
* did; an unreadable sessions file and a missing base exit 1.
*/
function parseArgs(argv) {
	let base;
	let sessions;
	const positional = [];
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "-h" || argument === "--help") return { help: true };
		if (argument === "-b" || argument === "--base") {
			const value = argv[index + 1];
			if (value === void 0) throw new AuditError(`${argument} needs a ref`, 2);
			base = value;
			index += 1;
			continue;
		}
		if (argument === "-s" || argument === "--sessions") {
			const value = argv[index + 1];
			if (value === void 0) throw new AuditError(`${argument} needs a JSON file`, 2);
			sessions = value;
			index += 1;
			continue;
		}
		if (argument.startsWith("-")) throw new AuditError(`unknown option: ${argument}`, 2);
		positional.push(argument);
	}
	if (positional.length > 1) throw new AuditError(`expected at most one repo path, received ${positional.length}`, 2);
	return {
		...base === void 0 ? {} : { base },
		...sessions === void 0 ? {} : { sessions },
		...positional[0] === void 0 ? {} : { repo: positional[0] },
		help: false
	};
}
/** Run the audit. Returns the process exit code. */
function main(argv, io = {
	stdout: (value) => process.stdout.write(value),
	stderr: (value) => process.stderr.write(value)
}, options = {}) {
	try {
		const args = parseArgs(argv);
		if (args.help) {
			io.stdout(USAGE);
			return 0;
		}
		const sessions = args.sessions === void 0 ? void 0 : readSessionsFile(args.sessions);
		const cwd = options.cwd ?? process.cwd();
		const repo = args.repo ?? gitHere(cwd, ["rev-parse", "--show-toplevel"])?.trim() ?? (() => {
			throw new AuditError("not in a git repo; pass a repo path");
		})();
		if (git(repo, ["rev-parse", "--git-dir"]) === void 0) throw new AuditError(`not a git repo: ${repo}`);
		const paths = worktreePaths(repo);
		const mainWorktree = paths[0];
		if (mainWorktree === void 0) throw new AuditError(`not a git repo: ${repo}`);
		let base = args.base;
		if (base === void 0) {
			base = resolveBase(repo);
			if (base === void 0) throw new AuditError("no base ref (origin/HEAD, origin/main, origin/master all missing); pass -b <ref>");
			io.stderr(`warn: no -b given; MERGED checks against ${base}\n`);
		}
		if (base.startsWith("origin/")) {
			if (git(repo, [
				"fetch",
				"origin",
				`+refs/heads/${base.slice(7)}:refs/remotes/${base}`,
				"--quiet"
			]) === void 0) io.stderr(`warn: could not fetch ${base}; merged column may be stale\n`);
		}
		if (git(repo, [
			"rev-parse",
			"--verify",
			"--quiet",
			`${base}^{commit}`
		]) === void 0) throw new AuditError(`base ref not found: ${base}`);
		const prs = readForgePrs(repo);
		const now = options.now ?? Math.floor(Date.now() / 1e3);
		const context = {
			base,
			repo,
			mainWorktree,
			prs,
			sessions,
			now
		};
		const rows = paths.filter((path) => path !== mainWorktree).map((path) => buildRow(path, context));
		io.stdout(renderTable(sortRows(rows), base));
		return 0;
	} catch (error) {
		if (error instanceof AuditError) {
			io.stderr(`error: ${error.message}\n`);
			return error.exitCode;
		}
		const message = error instanceof Error ? error.message : String(error);
		io.stderr(`error: ${message}\n`);
		return 1;
	}
}
const entryPoint = process.argv[1];
if (entryPoint !== void 0 && resolve(entryPoint) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
//#endregion
export { AuditError, HEADER, PINNED, RECENT_DAYS, UNKNOWN_USAGE_BUCKET, USAGE, ageColumn, bucketFor, buildRow, dirtyColumn, formatSize, isRecent, lastChatColumn, lastSession, main, mergedColumn, normalizeGh, normalizeOrigin, parseArgs, prColumn, readForgePrs, readSessionsFile, remoteColumn, renderTable, resolveBase, sameOrInside, sizeColumn, sortRows, usageNote, worktreePaths };
