#!/usr/bin/env node
import { describe, it } from "node:test";
import { inspect } from "node:util";
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
//#region .runtime-sources/skills/poteto-mode/scripts/watch-pr/types.ts
function nonEmpty(items) {
	return items.length === 0 ? null : [items[0], ...items.slice(1)];
}
function parsePrNumber(value, label = "PR number") {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
	return value;
}
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/watch-pr/github.ts
var WatcherQueryError = class extends Error {
	failure;
	constructor(failure) {
		super(failure.detail);
		this.name = "WatcherQueryError";
		this.failure = failure;
	}
};
var ChecksUnavailable = class extends WatcherQueryError {
	constructor(detail) {
		super({
			kind: "checks-unavailable",
			retryable: true,
			detail
		});
		this.name = "ChecksUnavailable";
	}
};
const firstLine = (value) => value.trim().split(/\r?\n/, 1)[0]?.slice(0, 240) ?? "";
function isBugbot(comment) {
	if (comment === null) return false;
	const author = (comment.authorLogin ?? "").toLowerCase();
	const body = comment.body.toLowerCase();
	return author.includes("bugbot") || author === "cursor" && [
		"bugbot",
		"cursor_automation_id",
		"agentic security review",
		"description start",
		"severity"
	].some((token) => body.includes(token));
}
function passKey(comment) {
	if (comment === null) return null;
	for (const pattern of [/RUN_ID:\s*([a-zA-Z0-9_.:-]+)/, /CURSOR_AUTOMATION_ID:\s*([a-zA-Z0-9_.:-]+)/]) {
		const match = pattern.exec(comment.body);
		if (match?.[1]) return match[1];
	}
	return null;
}
function buildReviewThreads(threads) {
	const keys = /* @__PURE__ */ new Set();
	let keyless = false;
	for (const thread of threads) {
		if (!isBugbot(thread.firstComment)) continue;
		const key = passKey(thread.firstComment);
		if (key === null) keyless = true;
		else keys.add(key);
	}
	const passes = keys.size > 0 ? keys.size : keyless ? 1 : 0;
	return threads.filter((thread) => !thread.resolved).map(({ id, firstComment }) => ({
		id,
		firstComment,
		isBugbot: isBugbot(firstComment),
		bugbotReviewPasses: passes
	}));
}
async function resolveChecks(reader, context) {
	const fast = await reader.checksFastPath(context);
	const direct = fast.kind === "checks" ? nonEmpty(fast.checks) : null;
	if (direct !== null) return {
		source: "gh-pr-checks",
		checks: direct
	};
	const checks = [];
	let after = null;
	do {
		const page = await reader.checkRollupPage(context, after);
		checks.push(...page.checks);
		after = page.endCursor;
	} while (after !== null);
	const fallback = nonEmpty(checks);
	if (fallback !== null) return {
		source: "graphql-rollup",
		checks: fallback
	};
	throw new ChecksUnavailable(`could not read PR checks: ${fast.kind === "unusable" ? `fast path exit=${fast.exitCode}; GraphQL rollup was empty${firstLine(fast.stderr) ? `; ${firstLine(fast.stderr)}` : ""}` : "fast path and GraphQL rollup were empty"}`);
}
async function resolveReviewThreads(reader, context) {
	const threads = [];
	let after = null;
	do {
		const page = await reader.reviewThreadPage(context, after);
		threads.push(...page.threads);
		after = page.endCursor;
	} while (after !== null);
	return buildReviewThreads(threads);
}
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/watch-pr/policy.ts
function assessGitHubMerge(args) {
	if (args.mergeStateStatus === "BLOCKED") {
		if (args.headRollupState === "ERROR" || args.headRollupState === "FAILURE") return {
			kind: "refused",
			mergeStateStatus: args.mergeStateStatus,
			headRollupState: args.headRollupState
		};
		return {
			kind: "allowed",
			basis: "rollup",
			mergeStateStatus: args.mergeStateStatus,
			headRollupState: args.headRollupState
		};
	}
	return {
		kind: "allowed",
		basis: "merge-state",
		mergeStateStatus: args.mergeStateStatus,
		headRollupState: args.headRollupState
	};
}
async function mergeAssessment(reader, facts) {
	const commits = await reader.commitRollups(facts.context);
	const headRollupState = facts.headRefOid === null ? null : commits.find((commit) => commit.oid === facts.headRefOid)?.state ?? null;
	return {
		hadPreviousPassingCi: commits.some((commit) => commit.oid !== facts.headRefOid && commit.state === "SUCCESS"),
		github: assessGitHubMerge({
			mergeStateStatus: facts.mergeStateStatus,
			headRollupState
		})
	};
}
const AUTOMATION_TOKENS = [
	"bugbot",
	"security review",
	"pr review automation",
	"review automation"
];
async function readSnapshot(args) {
	const facts = await args.reader.pullRequest(args.context);
	if (facts.state === "MERGED" || facts.mergedAt !== null) return {
		kind: "merged",
		context: args.context,
		facts
	};
	if (facts.state === "CLOSED") return {
		kind: "closed",
		context: args.context,
		facts
	};
	const threads = await resolveReviewThreads(args.reader, args.context);
	const checks = await resolveChecks(args.reader, args.context);
	const failed = nonEmpty(checks.checks.filter((check) => check.kind === "failed"));
	const pending = nonEmpty(checks.checks.filter((check) => check.kind === "pending"));
	let ci;
	if (failed === null && pending !== null && args.pendingHistory === "omit") ci = {
		kind: "ci-pending",
		source: checks.source,
		all: checks.checks,
		failed: [],
		pending,
		hadPreviousPassingCi: false
	};
	else {
		const merge = await mergeAssessment(args.reader, facts);
		const base = {
			source: checks.source,
			all: checks.checks,
			hadPreviousPassingCi: merge.hadPreviousPassingCi
		};
		if (failed !== null) ci = {
			...base,
			kind: "ci-failing",
			failed,
			pending: pending ?? [],
			github: merge.github
		};
		else if (merge.github.kind === "refused") ci = {
			...base,
			kind: "ci-github-rejected",
			failed: [],
			pending: pending ?? [],
			github: merge.github
		};
		else if (pending !== null) ci = {
			...base,
			kind: "ci-pending",
			failed: [],
			pending
		};
		else ci = {
			...base,
			kind: "ci-clean",
			failed: [],
			pending: [],
			github: merge.github
		};
	}
	return {
		kind: "open",
		context: args.context,
		facts,
		threads,
		ci,
		reviewAutomationRunning: checks.checks.some((check) => check.kind === "pending" && AUTOMATION_TOKENS.some((token) => check.name.toLowerCase().includes(token)))
	};
}
const conflictBlocker = (row) => row.kind === "open" && (row.facts.mergeable === "CONFLICTING" || row.facts.mergeStateStatus === "DIRTY" || row.facts.mergeStateStatus === "CONFLICTING") ? {
	kind: "merge-conflicts",
	pr: row.context,
	facts: row.facts
} : null;
function threadBlocker(row) {
	if (row.kind !== "open") return null;
	const threads = nonEmpty(row.threads);
	return threads === null ? null : {
		kind: "review-threads",
		pr: row.context,
		threads
	};
}
const ciBlocker = (row) => row.kind === "open" && (row.ci.kind === "ci-failing" || row.ci.kind === "ci-github-rejected") ? {
	kind: "failing-checks",
	pr: row.context,
	ci: row.ci
} : null;
function gateReason(row, allowDraft) {
	if (row.kind === "merged") return null;
	if (row.kind === "closed") return "closed-without-merge";
	if (row.facts.isDraft && !allowDraft) return "draft-pr";
	return row.facts.reviewDecision === "CHANGES_REQUESTED" ? "changes-requested" : null;
}
function gateBlocker(row, allowDraft) {
	const reason = gateReason(row, allowDraft);
	return reason === null || reason === "draft-pr" && row.kind === "open" && row.ci.kind === "ci-pending" ? null : {
		kind: "merge-gate",
		pr: row.context,
		reason
	};
}
function readyContribution(row, allowDraft) {
	if (row.kind === "merged") return {
		kind: "merged-pr",
		context: row.context,
		mergedAt: row.facts.mergedAt
	};
	if (row.kind !== "open" || row.ci.kind !== "ci-clean" || row.threads.length !== 0 || conflictBlocker(row) !== null || gateReason(row, allowDraft) !== null) return null;
	const reviewDecision = row.facts.reviewDecision;
	if (reviewDecision === "CHANGES_REQUESTED") return null;
	return {
		kind: "ready-pr",
		context: row.context,
		proof: {
			mergeability: "clear",
			threads: [],
			ci: row.ci,
			gate: {
				state: "OPEN",
				reviewDecision,
				draft: row.facts.isDraft ? "draft-allowed" : "not-draft"
			}
		}
	};
}
function classifyPr(row, allowDraft = false) {
	for (const blocker of [
		conflictBlocker(row),
		threadBlocker(row),
		ciBlocker(row),
		gateBlocker(row, allowDraft)
	]) if (blocker !== null) return {
		kind: "blocker",
		blocker
	};
	if (row.kind === "open" && row.ci.kind === "ci-pending") return {
		kind: "waiting",
		frontier: row.context,
		pending: row.ci.pending
	};
	const ready = readyContribution(row, allowDraft);
	if (ready === null) throw new Error("snapshot has no classified decision");
	return ready.kind === "merged-pr" ? {
		kind: "merged",
		pr: ready
	} : {
		kind: "ready",
		pr: ready
	};
}
function selectTierMajorStackDecision(rows, allowDraft = false) {
	for (const tier of [
		conflictBlocker,
		threadBlocker,
		ciBlocker
	]) for (const row of rows) {
		const blocker = tier(row);
		if (blocker !== null) return {
			kind: "blocker",
			blocker
		};
	}
	for (const row of rows) {
		const blocker = gateBlocker(row, allowDraft);
		if (blocker !== null) return {
			kind: "blocker",
			blocker
		};
	}
	for (const row of rows) if (row.kind === "open" && row.ci.kind === "ci-pending") return {
		kind: "waiting",
		frontier: row.context,
		pending: row.ci.pending
	};
	const prs = nonEmpty(rows.map((row) => readyContribution(row, allowDraft)).filter((row) => row !== null));
	if (prs === null || prs.length !== rows.length) throw new Error("stack has no classified decision");
	return {
		kind: "clear",
		prs
	};
}
const queryBackoffSeconds = (interval, failures) => Math.min(Math.max(interval, 60) * 2 ** (failures - 1), 300);
function verdictFactory(clock, mode) {
	let sequence = 0;
	function stamp(payload, override) {
		return {
			schemaVersion: 1,
			sequence: sequence += 1,
			observedAt: clock.observedAt(),
			mode: override ?? mode,
			...payload
		};
	}
	return stamp;
}
function blockerVerdict(stamp, blocker) {
	switch (blocker.kind) {
		case "merge-conflicts": return stamp({
			kind: "BLOCKER",
			terminal: true,
			exitCode: 2,
			blocker
		});
		case "review-threads": return stamp({
			kind: "BLOCKER",
			terminal: true,
			exitCode: 3,
			blocker
		});
		case "failing-checks": return stamp({
			kind: "BLOCKER",
			terminal: true,
			exitCode: 4,
			blocker
		});
		case "merge-gate": return stamp({
			kind: "BLOCKER",
			terminal: true,
			exitCode: 6,
			blocker
		});
		default: return blocker;
	}
}
function statusQueryVerdict(stamp, failures, failure) {
	return stamp({
		kind: "BLOCKER",
		terminal: true,
		exitCode: 7,
		blocker: {
			kind: "status-query",
			failures,
			failure
		}
	});
}
const deadlinePassed = (started, options, now) => options.timeout > 0 && now - started >= options.timeout;
async function pollUntilTerminal(args) {
	let failures = 0;
	const started = args.dependencies.clock.now();
	while (true) {
		let result;
		try {
			result = await args.step();
			failures = 0;
		} catch (error) {
			if (!(error instanceof WatcherQueryError)) throw error;
			failures += 1;
			if (!error.failure.retryable || failures >= args.options.maxQueryErrors) return statusQueryVerdict(args.stamp, failures, error.failure);
			const retryInSeconds = queryBackoffSeconds(args.options.interval, failures);
			args.dependencies.emit(args.stamp({
				kind: "RETRY",
				terminal: false,
				failure: error.failure,
				consecutiveFailures: failures,
				retryInSeconds
			}));
			if (deadlinePassed(started, args.options, args.dependencies.clock.now())) return args.stamp({
				kind: "TIMEOUT",
				terminal: true,
				exitCode: 5,
				reason: {
					kind: "status-unavailable",
					failure: error.failure
				}
			});
			await args.dependencies.clock.sleep(retryInSeconds);
			continue;
		}
		if (result.kind === "terminal") return result.verdict;
		if (result.kind === "sleep") {
			if (result.onDeadline !== void 0 && deadlinePassed(started, args.options, args.dependencies.clock.now())) return result.onDeadline();
			await args.dependencies.clock.sleep(result.seconds);
		}
	}
}
const createQueueState = (queue, now) => ({
	queue,
	snapshots: /* @__PURE__ */ new Map(),
	work: {
		kind: "whole-stack-sweep",
		remaining: queue
	},
	nextSweepAt: now,
	frontier: null,
	lastWaitKey: null,
	startedAt: now
});
const orderedRows = (state) => state.queue.flatMap((context) => {
	const row = state.snapshots.get(context.number);
	return row === void 0 ? [] : [row];
});
const activeRows = (state) => orderedRows(state).filter((row) => row.kind !== "merged");
function planQueue(state, now) {
	if (state.work !== null) return state;
	if (state.snapshots.size === 0 || now >= state.nextSweepAt) {
		const remaining = nonEmpty(state.queue.filter((context) => state.snapshots.get(context.number)?.kind !== "merged"));
		if (remaining !== null) return {
			...state,
			work: {
				kind: "whole-stack-sweep",
				remaining
			}
		};
	}
	const frontier = activeRows(state)[0]?.context;
	return frontier === void 0 ? state : {
		...state,
		work: {
			kind: "frontier-poll",
			frontier
		}
	};
}
function applyQueueSnapshot(state, snapshot, now, options) {
	if (state.work === null) throw new Error("queue has no read in flight");
	const snapshots = new Map(state.snapshots);
	snapshots.set(snapshot.context.number, snapshot);
	const base = {
		...state,
		snapshots
	};
	if (state.work.kind === "frontier-poll") return {
		state: {
			...base,
			work: null
		},
		completedSweepRows: null
	};
	const [head, ...tail] = state.work.remaining;
	if (head.number !== snapshot.context.number) throw new Error("snapshot does not match sweep head");
	const remaining = nonEmpty(tail);
	if (remaining !== null) return {
		state: {
			...base,
			work: {
				kind: "whole-stack-sweep",
				remaining
			}
		},
		completedSweepRows: null
	};
	const rows = nonEmpty(state.queue.flatMap((context) => {
		const row = snapshots.get(context.number);
		return row === void 0 ? [] : [row];
	}));
	if (rows === null || rows.length !== state.queue.length) throw new Error("sweep completed without every snapshot");
	return {
		state: {
			...base,
			work: null,
			nextSweepAt: now + options.sweepInterval
		},
		completedSweepRows: rows
	};
}
function evaluateQueue(state, now, options) {
	const active = activeRows(state);
	if (active.length === 0) {
		const merged = nonEmpty(orderedRows(state).flatMap((row) => row.kind === "merged" ? [{
			kind: "merged-pr",
			context: row.context,
			mergedAt: row.facts.mergedAt
		}] : []));
		if (merged === null) throw new Error("empty queue cannot complete");
		return {
			kind: "complete",
			state,
			merged
		};
	}
	const rows = nonEmpty(active);
	if (rows === null) throw new Error("active queue cannot be empty");
	const decision = selectTierMajorStackDecision(rows, options.allowDraft);
	if (decision.kind === "blocker") return {
		kind: "blocker",
		state,
		blocker: decision.blocker
	};
	const frontier = rows[0].context;
	if (state.frontier !== null && state.frontier.number !== frontier.number) return {
		kind: "advance",
		state: {
			...state,
			frontier,
			lastWaitKey: null
		},
		merged: state.frontier,
		frontier,
		remaining: active.length
	};
	if (deadlinePassed(state.startedAt, options, now)) return {
		kind: "timeout",
		state: {
			...state,
			frontier
		},
		frontier,
		unmergedCount: active.length
	};
	const row = rows[0];
	const pending = row.kind === "open" && row.ci.kind === "ci-pending" ? row.ci.pending : null;
	const reason = pending === null ? {
		kind: "merge-queue",
		unmergedCount: active.length
	} : {
		kind: "pending-checks",
		pending
	};
	const key = reason.kind === "pending-checks" ? `pending:${frontier.number}:${reason.pending.length}` : `queue:${frontier.number}:${reason.unmergedCount}`;
	return {
		kind: "waiting",
		state: {
			...state,
			frontier,
			lastWaitKey: key
		},
		frontier,
		reason,
		emit: state.lastWaitKey !== key
	};
}
async function runQueued(args) {
	let state = createQueueState(args.contexts, args.dependencies.clock.now());
	const stamp = verdictFactory(args.dependencies.clock, "queued-stack");
	args.dependencies.emit(stamp({
		kind: "QUEUE",
		terminal: false,
		queue: args.contexts
	}));
	const step = async () => {
		state = planQueue(state, args.dependencies.clock.now());
		if (state.work === null) {
			const complete = evaluateQueue(state, args.dependencies.clock.now(), args.options);
			if (complete.kind !== "complete") throw new Error("queue has no work while active");
			return {
				kind: "terminal",
				verdict: stamp({
					kind: "COMPLETE",
					terminal: true,
					exitCode: 0,
					queue: state.queue,
					merged: complete.merged
				})
			};
		}
		const context = state.work.kind === "whole-stack-sweep" ? state.work.remaining[0] : state.work.frontier;
		const snapshot = await readSnapshot({
			reader: args.dependencies.reader,
			context,
			pendingHistory: "omit",
			allowDraft: args.options.allowDraft
		});
		const applied = applyQueueSnapshot(state, snapshot, args.dependencies.clock.now(), args.options);
		state = applied.state;
		if (applied.completedSweepRows !== null) args.dependencies.emit(stamp({
			kind: "STATUS",
			terminal: false,
			reason: "whole-stack-sweep",
			rows: applied.completedSweepRows
		}));
		if (state.work !== null) return { kind: "continue" };
		const evaluation = evaluateQueue(state, args.dependencies.clock.now(), args.options);
		state = evaluation.state;
		switch (evaluation.kind) {
			case "complete": return {
				kind: "terminal",
				verdict: stamp({
					kind: "COMPLETE",
					terminal: true,
					exitCode: 0,
					queue: state.queue,
					merged: evaluation.merged
				})
			};
			case "blocker": return {
				kind: "terminal",
				verdict: blockerVerdict(stamp, evaluation.blocker)
			};
			case "advance":
				args.dependencies.emit(stamp({
					kind: "ADVANCE",
					terminal: false,
					merged: evaluation.merged,
					frontier: evaluation.frontier,
					remaining: evaluation.remaining
				}));
				return { kind: "continue" };
			case "timeout": return {
				kind: "terminal",
				verdict: stamp({
					kind: "TIMEOUT",
					terminal: true,
					exitCode: 5,
					reason: {
						kind: "queued-stack",
						frontier: evaluation.frontier,
						unmergedCount: evaluation.unmergedCount
					}
				})
			};
			case "waiting":
				if (evaluation.emit) args.dependencies.emit(stamp({
					kind: "WAITING",
					terminal: false,
					frontier: evaluation.frontier,
					reason: evaluation.reason
				}));
				return {
					kind: "sleep",
					seconds: args.options.interval
				};
			default: return evaluation;
		}
	};
	return pollUntilTerminal({
		dependencies: args.dependencies,
		options: args.options,
		stamp,
		step
	});
}
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/watch-pr/fakes.test-helper.ts
function toRawThread(thread) {
	return {
		id: thread.id,
		firstComment: thread.firstComment,
		resolved: false
	};
}
function passingCheck(name = "ci") {
	return {
		kind: "passed",
		name,
		reportedState: "SUCCESS",
		description: "",
		link: "",
		workflow: ""
	};
}
function pendingCheck(name = "ci") {
	return {
		kind: "pending",
		name,
		reportedState: "PENDING",
		description: "",
		link: "",
		workflow: ""
	};
}
function failedCheck(name = "ci") {
	return {
		kind: "failed",
		name,
		reportedState: "FAILURE",
		description: "",
		link: "",
		workflow: ""
	};
}
function fakeReader(options = {}) {
	const calls = [];
	const context = options.current ?? {
		owner: "owner",
		repo: "repo",
		number: parsePrNumber(1)
	};
	const defaults = {
		context,
		mergeable: "MERGEABLE",
		mergeStateStatus: "CLEAN",
		reviewDecision: "APPROVED",
		headRefOid: "head",
		headRefName: "feature",
		baseRefName: "main",
		state: "OPEN",
		mergedAt: null,
		isDraft: false
	};
	let page = 0;
	let threadPage = 0;
	return {
		calls,
		async originRepo() {
			calls.push("originRepo");
			return options.origin === void 0 ? {
				owner: "owner",
				repo: "repo"
			} : options.origin;
		},
		async currentPr(pr) {
			calls.push("currentPr");
			return {
				...context,
				number: pr ?? context.number
			};
		},
		async pullRequest(requested) {
			calls.push("pullRequest");
			return {
				...defaults,
				...options.facts,
				context: requested
			};
		},
		async openPullRequests() {
			calls.push("openPullRequests");
			return options.openPullRequests ?? [];
		},
		async checksFastPath() {
			calls.push("checksFastPath");
			return options.fastPath ?? {
				kind: "checks",
				checks: [passingCheck()]
			};
		},
		async checkRollupPage(_requested, after) {
			calls.push(`checkRollupPage:${after ?? "null"}`);
			return options.rollupPages?.[page++] ?? {
				checks: [],
				endCursor: null
			};
		},
		async reviewThreadPage(_requested, after) {
			calls.push(`reviewThreadPage:${after ?? "null"}`);
			return options.threadPages?.[threadPage++] ?? {
				threads: (options.threads ?? []).map(toRawThread),
				endCursor: null
			};
		},
		async commitRollups() {
			calls.push("commitRollups");
			return options.commitRollups ?? [{
				oid: "head",
				state: "SUCCESS"
			}];
		}
	};
}
//#endregion
//#region .runtime-sources/skills/poteto-mode/scripts/watch-pr/policy.test.ts
const context = (number) => ({
	owner: "owner",
	repo: "repo",
	number: parsePrNumber(number)
});
const options = {
	interval: 10,
	sweepInterval: 300,
	timeout: 0,
	maxQueryErrors: 5,
	allowDraft: false
};
describe("readiness truth table", () => {
	it("covers every specified row and every UNKNOWN rollup value", () => {
		for (const [mergeStateStatus, headRollupState, expected] of [
			[
				"BLOCKED",
				"FAILURE",
				"refused"
			],
			[
				"BLOCKED",
				"ERROR",
				"refused"
			],
			[
				"BLOCKED",
				"PENDING",
				"allowed"
			],
			[
				"UNSTABLE",
				"FAILURE",
				"allowed"
			],
			[
				"UNKNOWN",
				"ERROR",
				"allowed"
			],
			[
				"UNKNOWN",
				"EXPECTED",
				"allowed"
			],
			[
				"UNKNOWN",
				"FAILURE",
				"allowed"
			],
			[
				"UNKNOWN",
				"PENDING",
				"allowed"
			],
			[
				"UNKNOWN",
				"SUCCESS",
				"allowed"
			],
			[
				"UNKNOWN",
				null,
				"allowed"
			],
			[
				"CLEAN",
				"SUCCESS",
				"allowed"
			]
		]) expect(assessGitHubMerge({
			mergeStateStatus,
			headRollupState
		}).kind).toBe(expected);
	});
	it("turns a clean visible list plus GitHub refusal into an explicit CI blocker", async () => {
		const snapshot = await readSnapshot({
			reader: fakeReader({
				facts: { mergeStateStatus: "BLOCKED" },
				fastPath: {
					kind: "checks",
					checks: [passingCheck()]
				},
				commitRollups: [{
					oid: "head",
					state: "FAILURE"
				}]
			}),
			context: context(1),
			pendingHistory: "include",
			allowDraft: false
		});
		expect(snapshot.kind).toBe("open");
		if (snapshot.kind !== "open") throw new Error("expected open snapshot");
		expect(snapshot.ci.kind).toBe("ci-github-rejected");
		expect(classifyPr(snapshot)).toMatchObject({
			kind: "blocker",
			blocker: { kind: "failing-checks" }
		});
	});
});
describe("snapshot query planning", () => {
	it("does not query commit rollups while queued checks are pending", async () => {
		const reader = fakeReader({ fastPath: {
			kind: "checks",
			checks: [pendingCheck()]
		} });
		const snapshot = await readSnapshot({
			reader,
			context: context(2),
			pendingHistory: "omit",
			allowDraft: false
		});
		expect(snapshot.kind).toBe("open");
		if (snapshot.kind !== "open") throw new Error("expected open snapshot");
		expect(snapshot.ci.kind).toBe("ci-pending");
		expect(reader.calls).toEqual([
			"pullRequest",
			"reviewThreadPage:null",
			"checksFastPath"
		]);
	});
	it("queries rollups for settled and failed lists", async () => {
		const settled = fakeReader();
		await readSnapshot({
			reader: settled,
			context: context(3),
			pendingHistory: "omit",
			allowDraft: false
		});
		expect(settled.calls).toContain("commitRollups");
		const failed = fakeReader({ fastPath: {
			kind: "checks",
			checks: [failedCheck()]
		} });
		await readSnapshot({
			reader: failed,
			context: context(4),
			pendingHistory: "omit",
			allowDraft: false
		});
		expect(failed.calls).toContain("commitRollups");
	});
	it("short-circuits merged rows before threads and checks", async () => {
		const reader = fakeReader({ facts: {
			state: "MERGED",
			mergedAt: "2026-07-26T00:00:00Z"
		} });
		expect((await readSnapshot({
			reader,
			context: context(5),
			pendingHistory: "include",
			allowDraft: false
		})).kind).toBe("merged");
		expect(reader.calls).toEqual(["pullRequest"]);
	});
});
it("scans stacks tier-major so an upstack conflict outranks frontier CI", async () => {
	const decision = selectTierMajorStackDecision([await readSnapshot({
		reader: fakeReader({
			fastPath: {
				kind: "checks",
				checks: [failedCheck()]
			},
			commitRollups: [{
				oid: "head",
				state: "FAILURE"
			}]
		}),
		context: context(10),
		pendingHistory: "omit",
		allowDraft: false
	}), await readSnapshot({
		reader: fakeReader({ facts: { mergeable: "CONFLICTING" } }),
		context: context(11),
		pendingHistory: "omit",
		allowDraft: false
	})]);
	expect(decision).toMatchObject({
		kind: "blocker",
		blocker: {
			kind: "merge-conflicts",
			pr: { number: 11 }
		}
	});
});
it("attributes a stack wait to the PR whose checks are pending, not the bottom", async () => {
	const decision = selectTierMajorStackDecision([await readSnapshot({
		reader: fakeReader(),
		context: context(20),
		pendingHistory: "omit",
		allowDraft: false
	}), await readSnapshot({
		reader: fakeReader({ fastPath: {
			kind: "checks",
			checks: [pendingCheck("upstack-build")]
		} }),
		context: context(21),
		pendingHistory: "omit",
		allowDraft: false
	})]);
	expect(decision).toMatchObject({
		kind: "waiting",
		frontier: { number: 21 },
		pending: [{ name: "upstack-build" }]
	});
});
it("waits on a draft while checks are pending, then reports the draft gate", async () => {
	const pending = await readSnapshot({
		reader: fakeReader({
			facts: { isDraft: true },
			fastPath: {
				kind: "checks",
				checks: [pendingCheck()]
			}
		}),
		context: context(12),
		pendingHistory: "omit",
		allowDraft: false
	});
	expect(classifyPr(pending).kind).toBe("waiting");
	const settled = await readSnapshot({
		reader: fakeReader({ facts: { isDraft: true } }),
		context: context(12),
		pendingHistory: "omit",
		allowDraft: false
	});
	expect(classifyPr(settled)).toMatchObject({
		kind: "blocker",
		blocker: {
			kind: "merge-gate",
			reason: "draft-pr"
		}
	});
});
describe("queued-stack cadence", () => {
	async function openSnapshot(pr) {
		return readSnapshot({
			reader: fakeReader(),
			context: pr,
			pendingHistory: "omit",
			allowDraft: false
		});
	}
	it("drops a sweep head only after its snapshot succeeds", async () => {
		const queue = [
			context(20),
			context(21),
			context(22)
		];
		let state = createQueueState(queue, 0);
		const first = await openSnapshot(queue[0]);
		state = applyQueueSnapshot(state, first, 0, options).state;
		expect(state.work).toMatchObject({
			kind: "whole-stack-sweep",
			remaining: [{ number: 21 }, { number: 22 }]
		});
		const second = await openSnapshot(queue[1]);
		state = applyQueueSnapshot(state, second, 60, options).state;
		expect(state.work).toMatchObject({
			kind: "whole-stack-sweep",
			remaining: [{ number: 22 }]
		});
	});
	it("resumes the sweep at the PR whose read failed", async () => {
		const middle = context(21);
		const base = fakeReader();
		let failNext = true;
		const timeline = [];
		const reader = {
			...base,
			async pullRequest(pr) {
				if (pr.number === middle.number && failNext) {
					failNext = false;
					timeline.push(`fail:${pr.number}`);
					throw new WatcherQueryError({
						kind: "command-exit",
						retryable: true,
						detail: "rate limited",
						code: 1
					});
				}
				timeline.push(`read:${pr.number}`);
				return base.pullRequest(pr);
			}
		};
		let now = 0;
		let sleeps = 0;
		const running = runQueued({
			dependencies: {
				reader,
				clock: {
					now: () => now,
					observedAt: () => "2026-07-26T00:00:00.000Z",
					async sleep(seconds) {
						timeline.push("sleep");
						now += seconds;
						sleeps += 1;
						if (sleeps === 2) throw new Error("stop after resume proof");
					}
				},
				emit(verdict) {
					timeline.push(`emit:${verdict.kind}`);
				}
			},
			contexts: [
				context(20),
				middle,
				context(22)
			],
			options
		});
		await expect(running).rejects.toThrow("stop after resume proof");
		expect(timeline).toEqual([
			"emit:QUEUE",
			"read:20",
			"fail:21",
			"emit:RETRY",
			"sleep",
			"read:21",
			"read:22",
			"emit:STATUS",
			"emit:WAITING",
			"sleep"
		]);
	});
	it("emits a completed sweep only after its final successful snapshot", async () => {
		const queue = [context(30), context(31)];
		let state = createQueueState(queue, 0);
		const first = applyQueueSnapshot(state, await openSnapshot(queue[0]), 0, options);
		expect(first.completedSweepRows).toBeNull();
		state = first.state;
		const second = applyQueueSnapshot(state, await openSnapshot(queue[1]), 5, options);
		expect(second.completedSweepRows?.map((row) => Number(row.context.number))).toEqual([30, 31]);
		expect(second.state.nextSweepAt).toBe(305);
	});
	it("ADVANCE continues directly to the new frontier without sleeping", async () => {
		const one = context(40);
		const two = context(41);
		const base = fakeReader();
		const reads = /* @__PURE__ */ new Map();
		const timeline = [];
		const reader = {
			...base,
			async pullRequest(pr) {
				timeline.push(`read:${pr.number}`);
				const facts = await base.pullRequest(pr);
				const count = (reads.get(pr.number) ?? 0) + 1;
				reads.set(pr.number, count);
				return pr.number === one.number && count > 1 ? {
					...facts,
					state: "MERGED",
					mergedAt: "2026-07-26T00:00:00Z"
				} : facts;
			}
		};
		let now = 0;
		let sleeps = 0;
		const emitted = [];
		const running = runQueued({
			dependencies: {
				reader,
				clock: {
					now: () => now,
					observedAt: () => "2026-07-26T00:00:00.000Z",
					async sleep(seconds) {
						timeline.push("sleep");
						now += seconds;
						sleeps += 1;
						if (sleeps === 2) throw new Error("stop after advance proof");
					}
				},
				emit(verdict) {
					emitted.push(verdict);
					timeline.push(`emit:${verdict.kind}`);
				}
			},
			contexts: [one, two],
			options
		});
		await expect(running).rejects.toThrow("stop after advance proof");
		expect(emitted.some((event) => event.kind === "ADVANCE")).toBe(true);
		const firstSleep = timeline.indexOf("sleep");
		expect(timeline.slice(firstSleep, firstSleep + 5)).toEqual([
			"sleep",
			"read:40",
			"emit:ADVANCE",
			"read:41",
			"emit:WAITING"
		]);
	});
	it("deduplicates identical waits and schedules the next due sweep", async () => {
		const queue = [context(50)];
		let state = createQueueState(queue, 0);
		state = applyQueueSnapshot(state, await openSnapshot(queue[0]), 0, options).state;
		const first = evaluateQueue(state, 0, options);
		expect(first.kind).toBe("waiting");
		if (first.kind !== "waiting") throw new Error("expected waiting");
		expect(first.emit).toBe(true);
		const second = evaluateQueue(first.state, 10, options);
		expect(second.kind).toBe("waiting");
		if (second.kind !== "waiting") throw new Error("expected waiting");
		expect(second.emit).toBe(false);
		expect(planQueue(second.state, 300).work?.kind).toBe("whole-stack-sweep");
	});
});
it("uses the specified retry floor and cap", () => {
	expect(queryBackoffSeconds(1, 1)).toBe(60);
	expect(queryBackoffSeconds(1, 2)).toBe(120);
	expect(queryBackoffSeconds(60, 4)).toBe(300);
});
//#endregion
export {};
