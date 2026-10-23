/**
 * pstack role resolution.
 *
 * `~/.dsh/pstack-models.md` holds one role per line. The tool resolves a role
 * into a child LLM route at call time, so edits apply to the next delegation
 * without restarting the harness.
 *
 * Parsing never throws. A typo in one line must not break delegation, but it
 * must also not disappear: `parseModelConfigWithIssues` collects `issues` and
 * the parser keeps them so a caller can report the line that is wrong.
 */

export interface Route {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}

export type RoleValue = "inherit-parent" | Route;
export type RoleTable = ReadonlyMap<string, readonly RoleValue[]>;

/** A problem in the role file, tied to the line that caused it. */
export interface RoleIssue {
  /** 1-based line number in `pstack-models.md`. */
  readonly line: number;
  readonly message: string;
}

export interface ParsedModelConfig {
  readonly table: RoleTable;
  readonly issues: readonly RoleIssue[];
}

const INHERIT = new Set(["inherit-parent", "auto", "parent"]);

/**
 * Reasoning efforts DSH understands, widest first. A token outside this set is
 * reported rather than dropped: a route that silently loses `xhigh` looks
 * configured and is not.
 */
export const REASONING_EFFORTS = [
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "off",
] as const;
const EFFORTS = new Set<string>(REASONING_EFFORTS);

/**
 * Register the role names on one line.
 *
 * The whole left side is always stored as one key, so
 * `reflect judgment, divergent, synthesizer` stays addressable as written.
 * When the comma list is a genuine group (`feature, refactoring`), each part is
 * stored too, so a caller can name just one of them. Both spellings therefore
 * work, and neither can shadow the other: the full key is a different string.
 */
function splitRoles(left: string): string[] {
  const whole = left.trim().toLowerCase().replace(/\s+/g, " ");
  if (!whole) return [];
  const parts = left
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return parts.length > 1 ? [whole, ...parts] : [whole];
}

export function parseModelConfigWithIssues(source: string): ParsedModelConfig {
  const table = new Map<string, RoleValue[]>();
  const issues: RoleIssue[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const lineNumber = index + 1;
    const separator = line.indexOf(":");
    if (separator === -1) {
      issues.push({
        line: lineNumber,
        message: `expected "role: value", got ${JSON.stringify(line)}`,
      });
      continue;
    }
    const roles = splitRoles(line.slice(0, separator));
    if (roles.length === 0) {
      issues.push({ line: lineNumber, message: "no role name before the colon" });
      continue;
    }

    const values: RoleValue[] = [];
    for (const entry of line.slice(separator + 1).split(",")) {
      const parsed = parseValue(entry.trim(), lineNumber, issues);
      if (parsed !== undefined) values.push(parsed);
    }
    if (values.length === 0) {
      issues.push({ line: lineNumber, message: `no usable value for ${roles.join(", ")}` });
      continue;
    }
    for (const role of roles) table.set(role, values);
  }

  return { table, issues };
}

/** Parse without the diagnostics. Kept for callers that only need the table. */
export function parseModelConfig(source: string): RoleTable {
  return parseModelConfigWithIssues(source).table;
}

export function parseValue(
  value: string,
  line = 0,
  issues: RoleIssue[] = [],
): RoleValue | undefined {
  if (!value) return undefined;
  if (INHERIT.has(value.toLowerCase())) return "inherit-parent";
  const tokens = value.split(/\s+/).filter(Boolean);
  const [route, ...rest] = tokens;
  if (!route) return undefined;

  const slash = route.indexOf("/");
  if (slash <= 0 || slash === route.length - 1) {
    // A bare model id with no provider cannot be routed safely; ask the harness
    // to inherit rather than guessing a provider.
    issues.push({
      line,
      message: `"${route}" is not <provider>/<model>, so this role inherits the parent route`,
    });
    return "inherit-parent";
  }

  let reasoningEffort: string | undefined;
  for (const token of rest) {
    if (EFFORTS.has(token.toLowerCase())) {
      reasoningEffort = token.toLowerCase();
      continue;
    }
    issues.push({
      line,
      message: `unknown effort "${token}"; expected one of ${REASONING_EFFORTS.join(", ")}`,
    });
  }

  return {
    provider: route.slice(0, slash),
    model: route.slice(slash + 1),
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

/** How a role name was matched, so the caller can report a near miss. */
export interface RoleMatch {
  /** The key exactly as it appears in the file, after lowercasing. */
  readonly key: string;
  readonly values: readonly RoleValue[];
  /** True when the key came from a shared `a, b: value` line. */
  readonly fromList: boolean;
}

/**
 * Look a role up by name.
 *
 * The parser stores both the whole left side of a line and, when the comma list
 * is a genuine group, each part. So a direct map hit is the only match worth
 * making. Matching is exact on purpose: a near miss such as `how` against
 * `how explorer` must not resolve, because picking a route the user did not name
 * changes both cost and model without saying so. `findNearMisses` reports those
 * for a human instead.
 */
export function lookupRole(table: RoleTable, role: string | undefined): RoleMatch | undefined {
  if (!role) return undefined;
  const key = role.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return undefined;

  const values = table.get(key);
  if (!values) return undefined;
  // `fromList` is informational: a key containing a comma came from a shared
  // line, which is how a panel role is spelled.
  return { key, values, fromList: key.includes(",") };
}

/**
 * Configured role names a caller could have meant. Used to explain a miss, not
 * to resolve one: `how` is a near miss for `how explorer`, and quietly running
 * on the explorer route would look configured while being wrong.
 */
export function findNearMisses(table: RoleTable, role: string): string[] {
  const key = role.trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return [];
  const hits: string[] = [];
  for (const candidate of table.keys()) {
    if (candidate === key) continue;
    if (candidate.includes(key) || key.includes(candidate)) {
      hits.push(candidate);
      continue;
    }
    // A shared line stores its parts separately too, so compare against those
    // as well: `how` should surface both `how explorer` and `how explainer`.
    for (const part of candidate.split(",").map((item) => item.trim())) {
      if (part === key) continue;
      if (part.includes(key) || key.includes(part)) {
        hits.push(candidate);
        break;
      }
    }
  }
  return [...new Set(hits)];
}

/**
 * Resolve one role to a route.
 *
 * `index` selects a panel entry and wraps, so a caller that spawns more
 * children than the list has entries still gets a deterministic route. A
 * missing role or an `inherit-parent` entry both return `undefined`, which
 * tells the caller to omit `agentOptions` and inherit.
 */
export function resolveRole(
  table: RoleTable,
  role: string | undefined,
  index = 0,
): Route | undefined {
  const values = lookupRole(table, role)?.values;
  if (!values || values.length === 0) return undefined;
  const value = values[Math.abs(index) % values.length];
  return value && value !== "inherit-parent" ? value : undefined;
}

/** Every entry for a panel role. An empty list means the role is not configured. */
export function resolvePanel(table: RoleTable, role: string): readonly RoleValue[] {
  return lookupRole(table, role)?.values ?? [];
}
