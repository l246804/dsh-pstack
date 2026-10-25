#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
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
//#region .runtime-sources/skills/poteto-mode/scripts/check-plan.test.ts
const checker = join(import.meta.dirname, "check-plan.mjs");
const rule = "Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.";
const validPlan = `# Demo

## How to read this
One box is one unit of work and names the evidence. Check a box only when its evidence exists. See playbooks/.
${rule}

## Program checklist
### Arm the program
### Spawn owners
### PR mechanics
### Verdict and merge
### Boot recipe
\`create_goal\` \`schedule_create\` status message

## PR 1
**Depends on.** None.
**Files.**
- [ ] Do the thing.
**Build.**
- [ ] Do the thing.
**You see.**
- [ ] Do the thing.
**Verify, unit.** ${rule}
- [ ] Check the thing.
**Verify, live.** ${rule} Ten lanes on \`example-model\` at the PR head
${Array.from({ length: 10 }, (_, i) => `- [ ] Lane ${i + 1}. Save \`lane-${i + 1}.png\`. Pass when evidence exists.`).join("\n")}
**Verify, perf.** ${rule}
- [ ] Metric. Recorded.
- [ ] Probe. Recorded.
- [ ] Baseline. Recorded.
- [ ] Rule. Recorded.
**Review gate.** None.
**Merge.**
- [ ] Merge when approved.

## Close the program
Close.

## Appendix Prototype evidence
Recorded.
`;
const runPlan = (example, expectedExit) => {
	const directory = mkdtempSync(join(tmpdir(), "check-plan-test-"));
	const file = join(directory, "plan.md");
	writeFileSync(file, validPlan + example);
	try {
		const result = spawnSync("node", [checker, file], { encoding: "utf8" });
		expect(result.status).toBe(expectedExit);
		return result;
	} finally {
		rmSync(directory, {
			recursive: true,
			force: true
		});
	}
};
test("accepts ordinary, indented, and longer closing fences", () => {
	for (const indent of [
		"",
		" ",
		"  ",
		"   "
	]) runPlan(`${indent}\`\`\`markdown\n## Example only\n${indent}\`\`\`\n`, 0);
	runPlan("```markdown\n## Example only\n````\n", 0);
});
test("accepts nested backticks and tilde info strings", () => {
	runPlan("````markdown\n```markdown\n## Example only\n```\n````\n", 0);
	runPlan("~~~markdown `info`\n## Example only\n ~~~\n", 0);
});
test("keeps mismatched, shorter, and suffixed closers inside the fence", () => {
	runPlan("````markdown\n~~~\n## Example only\n````\n", 0);
	runPlan("````markdown\n```\n## Example only\n````\n", 0);
	runPlan("````markdown\n``` info\n## Example only\n````\n", 0);
});
test("rejects headings and prose outside a proper close", () => {
	for (const suffix of ["  ", "	"]) {
		const heading = runPlan(`\`\`\`markdown\n## Example only\n\`\`\`${suffix}\n## Example only\n`, 1);
		expect(heading.stderr).toContain("\"## Example only\" after Close the program is not an appendix");
	}
	const prose = runPlan("```markdown\nThis prose has a mid-sentence colon: inside code\n```\nThis prose has a mid-sentence colon: bad.\n", 1);
	expect(prose.stderr).toContain("mid-sentence colon");
});
test("rejects backtick info strings containing a backtick", () => {
	const result = runPlan("```markdown `invalid`\n## Example only\n```\n", 1);
	expect(result.stderr).toContain("\"## Example only\" after Close the program is not an appendix");
});
//#endregion
export {};
