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
function raw(value) {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}
function missing(path, value) {
	throw new WatcherQueryError({
		kind: "missing-key",
		retryable: true,
		detail: value === void 0 ? `missing ${path}` : `invalid ${path}: ${raw(value)}`,
		...value === void 0 ? {} : { rawValue: raw(value) }
	});
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value, path) {
	if (!isRecord(value)) missing(path, value);
	return value;
}
function list(value, path) {
	if (!Array.isArray(value)) missing(path, value);
	return value;
}
function at(value, path) {
	let current = value;
	for (const key of path) {
		const object = record(current, path.join("."));
		if (!(key in object)) missing(path.join("."));
		current = object[key];
	}
	return current;
}
function string(value, path) {
	if (typeof value !== "string") missing(path, value);
	return value;
}
const optionalString = (value, path) => value === null ? null : string(value, path);
function enumValue(value, values, path) {
	if (typeof value === "string") {
		for (const candidate of values) if (candidate === value) return candidate;
	}
	return missing(path, value);
}
const nullableEnum = (value, values, path) => value === null ? null : enumValue(value, values, path);
const MERGE_STATES = [
	"BEHIND",
	"BLOCKED",
	"CLEAN",
	"CONFLICTING",
	"DIRTY",
	"DRAFT",
	"HAS_HOOKS",
	"UNKNOWN",
	"UNSTABLE"
];
const REVIEW_DECISIONS = [
	"APPROVED",
	"CHANGES_REQUESTED",
	"REVIEW_REQUIRED"
];
const reviewDecision = (value) => nullableEnum(value === "" ? null : value, REVIEW_DECISIONS, "pull request.reviewDecision");
function checkDetails(value, nameKey) {
	return {
		name: string(value[nameKey], nameKey),
		description: typeof value.description === "string" ? value.description : "",
		link: typeof value.link === "string" ? value.link : typeof value.detailsUrl === "string" ? value.detailsUrl : "",
		workflow: typeof value.workflow === "string" ? value.workflow : ""
	};
}
function parseFastCheck(value) {
	const object = record(value, "check");
	const details = checkDetails(object, "name");
	const state = string(object.state, "check.state").toUpperCase();
	const bucket = string(object.bucket, "check.bucket");
	if (state === "ACTION_REQUIRED") return gateOr("failed", details, state);
	if (bucket === "fail" || ["FAILURE", "ERROR"].includes(state)) return {
		...details,
		kind: "failed",
		reportedState: state
	};
	if (bucket === "pending") return gateOr("pending", details, state);
	if (bucket === "pass") return {
		...details,
		kind: "passed",
		reportedState: state
	};
	if (bucket === "skipping") return {
		...details,
		kind: "skipped",
		reportedState: state
	};
	return {
		...details,
		kind: "failed",
		reportedState: state
	};
}
function gateOr(kind, details, reportedState) {
	return details.name === "Code Review Gate" ? {
		...details,
		kind: "code-review-gate",
		name: "Code Review Gate",
		reportedState
	} : {
		...details,
		kind,
		reportedState
	};
}
function mapRollupNode(value) {
	const object = record(value, "rollup node");
	const typename = object.__typename;
	if (typename !== "CheckRun" && typename !== "StatusContext") return null;
	const details = checkDetails(object, typename === "CheckRun" ? "name" : "context");
	const link = typeof object.targetUrl === "string" ? object.targetUrl : details.link;
	if (typename === "CheckRun") {
		const status = typeof object.status === "string" ? object.status.toUpperCase() : "";
		const conclusion = typeof object.conclusion === "string" ? object.conclusion.toUpperCase() : "";
		if (status !== "COMPLETED") return gateOr("pending", {
			...details,
			link
		}, "PENDING");
		if (conclusion === "SUCCESS") return {
			...details,
			link,
			kind: "passed",
			reportedState: "SUCCESS"
		};
		if (conclusion === "NEUTRAL" || conclusion === "SKIPPED") return {
			...details,
			link,
			kind: "skipped",
			reportedState: conclusion
		};
		if (conclusion === "ACTION_REQUIRED") return gateOr("failed", {
			...details,
			link
		}, conclusion);
		return {
			...details,
			link,
			kind: "failed",
			reportedState: "FAILURE"
		};
	}
	const state = typeof object.state === "string" ? object.state.toUpperCase() : "";
	if (state === "PENDING" || state === "EXPECTED") return gateOr("pending", {
		...details,
		link
	}, "PENDING");
	return state === "SUCCESS" ? {
		...details,
		link,
		kind: "passed",
		reportedState: state
	} : {
		...details,
		link,
		kind: "failed",
		reportedState: state || "FAILURE"
	};
}
function parseComment(value) {
	const object = record(value, "review comment");
	const author = object.author === null ? null : record(object.author, "review comment.author");
	return {
		authorLogin: author === null ? null : optionalString(author.login, "review comment.author.login"),
		body: string(object.body, "review comment.body"),
		path: optionalString(object.path, "review comment.path"),
		line: object.line === null ? null : Number.isInteger(object.line) ? Number(object.line) : missing("review comment.line", object.line),
		createdAt: string(object.createdAt, "review comment.createdAt")
	};
}
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
function parseReviewThreadPage(value) {
	const reviewThreads = record(at(value, [
		"data",
		"repository",
		"pullRequest",
		"reviewThreads"
	]), "reviewThreads");
	const nodes = list(reviewThreads.nodes, "reviewThreads.nodes");
	const threads = [];
	for (const node of nodes) {
		const thread = record(node, "review thread");
		if (typeof thread.isResolved !== "boolean") missing("review thread.isResolved", thread.isResolved);
		const comments = list(at(thread, ["comments", "nodes"]), "review thread.comments.nodes");
		threads.push({
			id: string(thread.id, "review thread.id"),
			firstComment: comments.length === 0 ? null : parseComment(comments[0]),
			resolved: thread.isResolved
		});
	}
	const page = record(reviewThreads.pageInfo, "reviewThreads.pageInfo");
	if (typeof page.hasNextPage !== "boolean") missing("reviewThreads.pageInfo.hasNextPage", page.hasNextPage);
	const cursor = optionalString(page.endCursor, "reviewThreads.pageInfo.endCursor");
	return {
		threads,
		endCursor: page.hasNextPage && cursor ? cursor : null
	};
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
function parsePullRequest(value, context) {
	const object = record(value, "pull request");
	if (typeof object.isDraft !== "boolean") missing("pull request.isDraft", object.isDraft);
	return {
		context,
		mergeable: enumValue(object.mergeable, [
			"MERGEABLE",
			"CONFLICTING",
			"UNKNOWN"
		], "pull request.mergeable"),
		mergeStateStatus: enumValue(object.mergeStateStatus, MERGE_STATES, "pull request.mergeStateStatus"),
		reviewDecision: reviewDecision(object.reviewDecision),
		headRefOid: optionalString(object.headRefOid, "pull request.headRefOid"),
		headRefName: string(object.headRefName, "pull request.headRefName"),
		baseRefName: string(object.baseRefName, "pull request.baseRefName"),
		state: enumValue(object.state, [
			"OPEN",
			"CLOSED",
			"MERGED"
		], "pull request.state"),
		mergedAt: optionalString(object.mergedAt, "pull request.mergedAt"),
		isDraft: object.isDraft
	};
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
async function resolveContext(args) {
	if (args.pr !== null && args.owner !== null && args.repo !== null) return {
		owner: args.owner,
		repo: args.repo,
		number: args.pr
	};
	if (args.pr !== null) {
		const origin = await args.reader.originRepo();
		if (origin !== null) return {
			owner: args.owner ?? origin.owner,
			repo: args.repo ?? origin.repo,
			number: args.pr
		};
	}
	const inferred = await args.reader.currentPr(args.pr);
	return {
		owner: args.owner ?? inferred.owner,
		repo: args.repo ?? inferred.repo,
		number: args.pr ?? inferred.number
	};
}
function orderStack(context, open) {
	const byNumber = new Map(open.map((pr) => [pr.number, pr]));
	const byHead = new Map(open.map((pr) => [pr.headRefName, pr]));
	const children = /* @__PURE__ */ new Map();
	for (const pr of open) children.set(pr.baseRefName, [...children.get(pr.baseRefName) ?? [], pr]);
	for (const values of children.values()) values.sort((a, b) => a.number - b.number);
	const start = byNumber.get(context.number);
	if (start === void 0) return [context];
	const down = [];
	let current = start;
	while (byHead.has(current.baseRefName)) {
		const parent = byHead.get(current.baseRefName);
		if (parent === void 0) break;
		down.push(parent);
		current = parent;
	}
	const seen = /* @__PURE__ */ new Set([...down.map((pr) => pr.number), start.number]);
	const up = [];
	const visit = (parent) => {
		for (const child of children.get(parent.headRefName) ?? []) {
			if (seen.has(child.number)) continue;
			seen.add(child.number);
			up.push(child);
			visit(child);
		}
	};
	visit(start);
	return nonEmpty([
		...down.reverse(),
		start,
		...up
	].map((pr) => ({
		...context,
		number: pr.number
	}))) ?? [context];
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
//#region .runtime-sources/skills/poteto-mode/scripts/watch-pr/github.test.ts
const context = {
	owner: "owner",
	repo: "repo",
	number: parsePrNumber(42)
};
describe("checks fallback chain", () => {
	it("uses a non-empty fast-path result without a rollup query", async () => {
		const reader = fakeReader({ fastPath: {
			kind: "checks",
			checks: [passingCheck("fast")]
		} });
		const read = await resolveChecks(reader, context);
		expect(read.source).toBe("gh-pr-checks");
		expect(read.checks.map((check) => check.name)).toEqual(["fast"]);
		expect(reader.calls).toEqual(["checksFastPath"]);
	});
	it("paginates GraphQL when the fast path is unusable", async () => {
		const reader = fakeReader({
			fastPath: {
				kind: "unusable",
				exitCode: 8,
				stderr: ""
			},
			rollupPages: [{
				checks: [passingCheck("first")],
				endCursor: "next"
			}, {
				checks: [failedCheck("second")],
				endCursor: null
			}]
		});
		const read = await resolveChecks(reader, context);
		expect(read.source).toBe("graphql-rollup");
		expect(read.checks.map((check) => check.name)).toEqual(["first", "second"]);
		expect(reader.calls).toEqual([
			"checksFastPath",
			"checkRollupPage:null",
			"checkRollupPage:next"
		]);
	});
	it("falls back when valid fast-path JSON represented an empty list", async () => {
		const reader = fakeReader({
			fastPath: {
				kind: "checks",
				checks: []
			},
			rollupPages: [{
				checks: [pendingCheck("fallback")],
				endCursor: null
			}]
		});
		expect((await resolveChecks(reader, context)).checks[0].name).toBe("fallback");
		expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
	});
	it("fails closed when both paths are empty", async () => {
		const reader = fakeReader({ fastPath: {
			kind: "unusable",
			exitCode: 8,
			stderr: "credential cannot read checks"
		} });
		await expect(resolveChecks(reader, context)).rejects.toBeInstanceOf(ChecksUnavailable);
		expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
	});
});
describe("rollup node mapping", () => {
	it("maps terminal and non-terminal CheckRun states fail closed", () => {
		for (const [status, conclusion, kind, reportedState] of [
			[
				"IN_PROGRESS",
				null,
				"pending",
				"PENDING"
			],
			[
				"COMPLETED",
				"SUCCESS",
				"passed",
				"SUCCESS"
			],
			[
				"COMPLETED",
				"NEUTRAL",
				"skipped",
				"NEUTRAL"
			],
			[
				"COMPLETED",
				"SKIPPED",
				"skipped",
				"SKIPPED"
			],
			[
				"COMPLETED",
				"ACTION_REQUIRED",
				"failed",
				"ACTION_REQUIRED"
			],
			[
				"COMPLETED",
				"TIMED_OUT",
				"failed",
				"FAILURE"
			],
			[
				"COMPLETED",
				"FUTURE_VALUE",
				"failed",
				"FAILURE"
			]
		]) expect(mapRollupNode({
			__typename: "CheckRun",
			name: "ci",
			status,
			conclusion
		})).toMatchObject({
			kind,
			reportedState
		});
	});
	it("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
		expect(mapRollupNode({
			__typename: "CheckRun",
			name: "Code Review Gate",
			status: "IN_PROGRESS",
			conclusion: null
		})).toMatchObject({ kind: "code-review-gate" });
		expect(mapRollupNode({
			__typename: "StatusContext",
			context: "Code Review Gate",
			state: "PENDING"
		})).toMatchObject({ kind: "code-review-gate" });
	});
	it("classifies a Code Review Gate waiting on an owner approval as the gate", () => {
		expect(mapRollupNode({
			__typename: "CheckRun",
			name: "Code Review Gate",
			status: "COMPLETED",
			conclusion: "ACTION_REQUIRED",
			description: "1 of 2 policies"
		})).toMatchObject({
			kind: "code-review-gate",
			reportedState: "ACTION_REQUIRED"
		});
	});
	it("classifies a fast-path Code Review Gate waiting on an owner approval as the gate", () => {
		expect(parseFastCheck({
			name: "Code Review Gate",
			state: "ACTION_REQUIRED",
			bucket: "fail"
		})).toMatchObject({
			kind: "code-review-gate",
			reportedState: "ACTION_REQUIRED"
		});
		expect(parseFastCheck({
			name: "ci",
			state: "ACTION_REQUIRED",
			bucket: "fail"
		})).toMatchObject({
			kind: "failed",
			reportedState: "ACTION_REQUIRED"
		});
	});
	it("maps StatusContext states and drops unknown typenames", () => {
		expect(mapRollupNode({
			__typename: "StatusContext",
			context: "ci",
			state: "EXPECTED"
		})).toMatchObject({
			kind: "pending",
			reportedState: "PENDING"
		});
		expect(mapRollupNode({
			__typename: "StatusContext",
			context: "ci",
			state: "FUTURE_VALUE"
		})).toMatchObject({
			kind: "failed",
			reportedState: "FUTURE_VALUE"
		});
		expect(mapRollupNode({ __typename: "FutureNode" })).toBeNull();
	});
});
describe("closed enum parsing", () => {
	const rawPullRequest = {
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
	it("accepts mergeStateStatus CONFLICTING", () => {
		expect(parsePullRequest({
			...rawPullRequest,
			mergeStateStatus: "CONFLICTING"
		}, context).mergeStateStatus).toBe("CONFLICTING");
	});
	it("reads gh's empty reviewDecision as no decision rather than a parse failure", () => {
		expect(parsePullRequest({
			...rawPullRequest,
			reviewDecision: ""
		}, context).reviewDecision).toBeNull();
	});
	it("still rejects an unknown reviewDecision", () => {
		expect(() => parsePullRequest({
			...rawPullRequest,
			reviewDecision: "MAYBE"
		}, context)).toThrow(WatcherQueryError);
	});
	it("rejects unknown enum values as retryable errors carrying the raw value", () => {
		try {
			parsePullRequest({
				...rawPullRequest,
				mergeStateStatus: "FUTURE_STATE"
			}, context);
			throw new Error("expected parser to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(WatcherQueryError);
			if (!(error instanceof WatcherQueryError)) throw error;
			expect(error.failure).toMatchObject({
				kind: "missing-key",
				retryable: true,
				rawValue: "\"FUTURE_STATE\""
			});
		}
	});
});
it("annotates Bugbot threads with distinct review-pass counts", () => {
	const threads = buildReviewThreads(parseReviewThreadPage({ data: { repository: { pullRequest: { reviewThreads: {
		pageInfo: {
			hasNextPage: false,
			endCursor: null
		},
		nodes: [
			{
				id: "one",
				isResolved: false,
				comments: { nodes: [{
					body: "RUN_ID: run-1",
					createdAt: "now",
					path: "a.ts",
					line: 1,
					author: { login: "bugbot" }
				}] }
			},
			{
				id: "two",
				isResolved: false,
				comments: { nodes: [{
					body: "CURSOR_AUTOMATION_ID: run-2 severity high",
					createdAt: "now",
					path: null,
					line: null,
					author: { login: "cursor" }
				}] }
			},
			{
				id: "resolved",
				isResolved: true,
				comments: { nodes: [{
					body: "RUN_ID: run-3",
					createdAt: "now",
					path: null,
					line: null,
					author: { login: "bugbot" }
				}] }
			}
		]
	} } } } }).threads);
	expect(threads).toHaveLength(2);
	expect(threads.map((thread) => thread.isBugbot)).toEqual([true, true]);
	expect(threads.map((thread) => thread.bugbotReviewPasses)).toEqual([3, 3]);
});
describe("review thread pagination", () => {
	const thread = (id, resolved = false) => ({
		id,
		firstComment: {
			authorLogin: "someone",
			body: "please fix",
			path: "a.ts",
			line: 1,
			createdAt: "now"
		},
		resolved
	});
	it("keeps walking pages until the cursor is exhausted", async () => {
		const reader = fakeReader({ threadPages: [
			{
				threads: [thread("one")],
				endCursor: "next"
			},
			{
				threads: [thread("two")],
				endCursor: "last"
			},
			{
				threads: [thread("three")],
				endCursor: null
			}
		] });
		const threads = await resolveReviewThreads(reader, context);
		expect(threads.map((item) => item.id)).toEqual([
			"one",
			"two",
			"three"
		]);
		expect(reader.calls).toEqual([
			"reviewThreadPage:null",
			"reviewThreadPage:next",
			"reviewThreadPage:last"
		]);
	});
	it("sees an unresolved thread that sits past the first page", async () => {
		const threads = await resolveReviewThreads(fakeReader({ threadPages: [{
			threads: [thread("early", true)],
			endCursor: "next"
		}, {
			threads: [thread("late")],
			endCursor: null
		}] }), context);
		expect(threads.map((item) => item.id)).toEqual(["late"]);
	});
	it("stops after a single page when the cursor is exhausted", async () => {
		const reader = fakeReader({ threadPages: [{
			threads: [thread("only")],
			endCursor: null
		}] });
		expect((await resolveReviewThreads(reader, context)).length).toBe(1);
		expect(reader.calls).toEqual(["reviewThreadPage:null"]);
	});
	it("counts Bugbot review passes across every page", async () => {
		const bugbot = (id, runId) => ({
			id,
			firstComment: {
				authorLogin: "bugbot",
				body: `RUN_ID: ${runId}`,
				path: "a.ts",
				line: 1,
				createdAt: "now"
			},
			resolved: false
		});
		const threads = await resolveReviewThreads(fakeReader({ threadPages: [{
			threads: [bugbot("one", "run-1")],
			endCursor: "next"
		}, {
			threads: [bugbot("two", "run-2")],
			endCursor: null
		}] }), context);
		expect(threads.map((item) => item.bugbotReviewPasses)).toEqual([2, 2]);
	});
	it("drops resolved threads from later pages too", async () => {
		const reader = fakeReader({ threadPages: [{
			threads: [thread("one")],
			endCursor: "next"
		}, {
			threads: [thread("two", true)],
			endCursor: null
		}] });
		expect((await resolveReviewThreads(reader, context)).map((item) => item.id)).toEqual(["one"]);
	});
	it("rejects a page that omits pageInfo instead of assuming one page", async () => {
		const response = { data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } };
		expect(() => parseReviewThreadPage(response)).toThrow(WatcherQueryError);
	});
});
describe("context and stack discovery", () => {
	it("returns a fully explicit context without any reader call", async () => {
		const reader = fakeReader();
		expect(await resolveContext({
			reader,
			owner: "explicit",
			repo: "repo",
			pr: context.number
		})).toEqual({
			owner: "explicit",
			repo: "repo",
			number: context.number
		});
		expect(reader.calls).toEqual([]);
	});
	it("uses the local origin before currentPr for an explicit number", async () => {
		const reader = fakeReader({ origin: {
			owner: "local",
			repo: "checkout"
		} });
		expect(await resolveContext({
			reader,
			owner: null,
			repo: null,
			pr: context.number
		})).toEqual({
			owner: "local",
			repo: "checkout",
			number: context.number
		});
		expect(reader.calls).toEqual(["originRepo"]);
	});
	it("orders the connected stack bottom-to-top", () => {
		const ordered = orderStack(context, [
			{
				number: parsePrNumber(41),
				headRefName: "base-feature",
				baseRefName: "main"
			},
			{
				number: context.number,
				headRefName: "feature",
				baseRefName: "base-feature"
			},
			{
				number: parsePrNumber(43),
				headRefName: "upstack",
				baseRefName: "feature"
			}
		]);
		expect(ordered.map((item) => Number(item.number))).toEqual([
			41,
			42,
			43
		]);
	});
});
//#endregion
export {};
