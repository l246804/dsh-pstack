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

import { inspect } from "node:util";

/** Raised by every failing assertion. */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

function display(value: unknown): string {
  if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
  return inspect(value, { depth: 3, breakLength: 120, maxArrayLength: 20 });
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/** Structural equality for the shapes the ported tests compare. */
export function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date || right instanceof Date) {
    return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  // Only plain objects compare structurally. A class instance is not equal to a
  // different instance, which matches what these tests assert with toBeInstanceOf.
  const leftProto = Object.getPrototypeOf(left);
  const rightProto = Object.getPrototypeOf(right);
  if (leftProto !== rightProto) return false;
  if (leftProto !== Object.prototype && leftProto !== null) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

function contains(haystack: unknown, needle: unknown): boolean {
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
function matchesObject(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((item, index) => matchesObject(actual[index], item));
  }
  if (expected instanceof Date) return deepEqual(actual, expected);
  if (expected === null || typeof expected !== "object") return deepEqual(actual, expected);
  if (actual === null || typeof actual !== "object") return false;
  return Object.entries(expected).every(([key, value]) =>
    matchesObject((actual as Record<string, unknown>)[key], value),
  );
}

function thrownBy(call: () => unknown): { thrown: true; error: unknown } | { thrown: false } {
  try {
    call();
    return { thrown: false };
  } catch (error) {
    return { thrown: true, error };
  }
}

/** One side of a comparison. `negate` swaps pass and fail. */
export interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toContain(expected: unknown): void;
  toMatch(expected: RegExp | string): void;
  toThrow(expected?: RegExp | string | (new (...args: never[]) => Error)): void;
  toBeNull(): void;
  toBeInstanceOf(expected: new (...args: never[]) => unknown): void;
  toHaveLength(expected: number): void;
  toEndWith(expected: string): void;
  toMatchObject(expected: object): void;
}

/**
 * What `expect(x).not` returns.
 *
 * `not` is a property on the object `expect(x)` returned, not on `expect` itself,
 * so it has to be declared on the matcher set. It is also bidirectional in Bun and
 * Vitest, which is why `.not.not.toBe` and `.rejects.not.toThrow` both exist; the
 * same two hops are offered here so a ported assertion never has to be rewritten.
 */
export interface NegatedMatchers extends Matchers {
  readonly not: Matchers;
  readonly rejects: AsyncMatchers;
  readonly resolves: AsyncMatchers;
}

/** A resolved matcher set, with the same chaining `bun:test` allows. */
export type ResolvedMatchers = Matchers & NegatedMatchers;

/** The promise-returning matcher set produced by `rejects` / `resolves`. */
export interface AsyncMatchers {
  toBe(expected: unknown): Promise<void>;
  toEqual(expected: unknown): Promise<void>;
  toContain(expected: unknown): Promise<void>;
  toMatch(expected: RegExp | string): Promise<void>;
  toThrow(expected?: RegExp | string | (new (...args: never[]) => Error)): Promise<void>;
  toBeNull(): Promise<void>;
  toBeInstanceOf(expected: new (...args: never[]) => unknown): Promise<void>;
  toHaveLength(expected: number): Promise<void>;
  toEndWith(expected: string): Promise<void>;
  toMatchObject(expected: object): Promise<void>;
  /** Asserts the settled value does *not* match. */
  readonly not: AsyncMatchers;
}

function buildMatchers(actual: unknown, negate: boolean): ResolvedMatchers {
  /**
   * Fail when `ok` is not what the matcher asked for.
   *
   * `negate` inverts the requirement, so `.not.toContain(x)` passes on a haystack
   * that does not contain `x` and fails when it does.
   */
  const check = (ok: boolean, matcher: string, expected: unknown): void => {
    if (ok === !negate) return;
    const relation = negate ? `not to ${matcher}` : matcher;
    throw new AssertionError(`expected ${display(actual)} ${relation} ${display(expected)}`);
  };

  const checkPlain = (ok: boolean, matcher: string): void => {
    if (ok === !negate) return;
    throw new AssertionError(`expected ${display(actual)} ${negate ? `not to ${matcher}` : matcher}`);
  };

  const matchers: Matchers = {
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
      check(
        typeof expected === "string" ? text.includes(expected) : expected.test(text),
        "toMatch",
        expected,
      );
    },
    toThrow(expected) {
      if (typeof actual !== "function") {
        throw new AssertionError(`toThrow needs a function, received ${display(actual)}`);
      }
      const result = thrownBy(actual as () => unknown);
      if (!result.thrown) {
        // `.not.toThrow()` is the assertion that the call returned normally.
        checkPlain(false, "toThrow");
        return;
      }
      if (expected === undefined) {
        checkPlain(true, "toThrow");
        return;
      }
      const message = messageOf(result.error);
      const ok =
        typeof expected === "string"
          ? message.includes(expected)
          : expected instanceof RegExp
            ? expected.test(message)
            : result.error instanceof expected;
      check(ok, "toThrow", expected);
    },
    toBeNull() {
      checkPlain(actual === null, "toBeNull");
    },
    toBeInstanceOf(expected) {
      check(actual instanceof expected, "toBeInstanceOf", expected);
    },
    toHaveLength(expected) {
      const length = (actual as { length?: unknown } | null | undefined)?.length;
      check(length === expected, "toHaveLength", expected);
    },
    toEndWith(expected) {
      check(String(actual).endsWith(expected), "toEndWith", expected);
    },
    toMatchObject(expected) {
      check(matchesObject(actual, expected), "toMatchObject", expected);
    },
  };

  // `not` is a property of the returned object, and it flips the same set, so
  // `expect(x).not.toContain(y)` and `expect(x).not.not.toContain(y)` both work.
  // These are defined as accessors rather than assigned: `Object.assign` reads a
  // getter while copying, which would build the next `not` immediately and
  // recurse forever.
  // Each hop passes this set's negate state through unchanged. `.not` flips it
  // once, so `expect(p).not.rejects.toThrow()` asks for a resolution and
  // `expect(p).rejects.toThrow()` asks for a rejection.
  Object.defineProperties(matchers, {
    not: {
      get: (): ResolvedMatchers => buildMatchers(actual, !negate),
      enumerable: true,
    },
    rejects: {
      get: (): AsyncMatchers => buildAsyncMatchers(actual, "rejects", negate),
      enumerable: true,
    },
    resolves: {
      get: (): AsyncMatchers => buildAsyncMatchers(actual, "resolves", negate),
      enumerable: true,
    },
  });
  return matchers as ResolvedMatchers;
}

/**
 * Compare against a settled promise.
 *
 * `rejects` reads the rejection reason and fails when the promise resolved;
 * `resolves` is the mirror. Each matcher awaits the settlement, which is what
 * makes `await expect(promise).rejects.toThrow(...)` wait before it compares.
 */
function buildAsyncMatchers(
  actual: unknown,
  mode: "rejects" | "resolves",
  negate: boolean,
): AsyncMatchers {
  const then = (actual as PromiseLike<unknown> | null | undefined)?.then;
  if (typeof then !== "function") {
    throw new AssertionError(`expected a promise, received ${display(actual)}`);
  }
  const wantRejection = mode === "rejects" !== negate;

  const settle = async (): Promise<unknown> => {
    let resolved: { value: unknown } | undefined;
    let rejected: { error: unknown } | undefined;
    await Promise.resolve(actual as PromiseLike<unknown>).then(
      (value) => {
        resolved = { value };
      },
      (error: unknown) => {
        rejected = { error };
      },
    );
    if (wantRejection) {
      if (resolved !== undefined) {
        throw new AssertionError(
          `expected the promise to reject, it resolved to ${display(resolved.value)}`,
        );
      }
      return rejected?.error;
    }
    if (rejected !== undefined) {
      throw new AssertionError(
        `expected the promise to resolve, it rejected with ${messageOf(rejected.error)}`,
      );
    }
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
  const wrap = async (name: string, expected?: unknown): Promise<void> => {
    const subject = await settle();
    if (name === "toThrow") {
      buildMatchers(
        () => {
          throw subject;
        },
        false,
      ).toThrow(expected as RegExp | undefined);
      return;
    }
    if (name === "toBeNull") {
      buildMatchers(subject, false).toBeNull();
      return;
    }
    const matchers = buildMatchers(subject, false) as unknown as Record<
      string,
      (value: unknown) => void
    >;
    const matcher = matchers[name];
    if (typeof matcher !== "function") {
      throw new AssertionError(`unknown matcher ${name}`);
    }
    matcher.call(matchers, expected);
  };

  const matchers: Record<string, unknown> = {
    toBe: (expected: unknown) => wrap("toBe", expected),
    toEqual: (expected: unknown) => wrap("toEqual", expected),
    toContain: (expected: unknown) => wrap("toContain", expected),
    toMatch: (expected: unknown) => wrap("toMatch", expected),
    toThrow: (expected?: unknown) => wrap("toThrow", expected),
    toBeNull: () => wrap("toBeNull"),
    toBeInstanceOf: (expected: unknown) => wrap("toBeInstanceOf", expected),
    toHaveLength: (expected: unknown) => wrap("toHaveLength", expected),
    toEndWith: (expected: unknown) => wrap("toEndWith", expected),
    toMatchObject: (expected: unknown) => wrap("toMatchObject", expected),
  };

  // `.rejects.not.toThrow(...)` is the assertion that it resolved instead. The
  // hop is an accessor for the same reason as the synchronous set: assigning it
  // would build the next `not` during construction.
  Object.defineProperty(matchers, "not", {
    get: (): AsyncMatchers => buildAsyncMatchers(actual, mode, !negate),
    enumerable: true,
  });
  return matchers as unknown as AsyncMatchers;
}

export interface Expect {
  (actual: unknown): ResolvedMatchers;
  /** Flips every matcher on this call. */
  readonly not: (actual: unknown) => ResolvedMatchers;
  /** Asserts the promise rejects, then matches the reason. */
  readonly rejects: (actual: unknown) => AsyncMatchers;
  /** Asserts the promise resolves, then matches the value. */
  readonly resolves: (actual: unknown) => AsyncMatchers;
}

export const expect: Expect = Object.assign(
  (actual: unknown): ResolvedMatchers => buildMatchers(actual, false),
  {
    not: (actual: unknown): ResolvedMatchers => buildMatchers(actual, true),
    rejects: (actual: unknown): AsyncMatchers => buildAsyncMatchers(actual, "rejects", false),
    resolves: (actual: unknown): AsyncMatchers => buildAsyncMatchers(actual, "resolves", false),
  },
) as Expect;
