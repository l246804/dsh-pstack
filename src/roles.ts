/**
 * pstack role resolution.
 *
 * `~/.dsh/pstack-models.md` holds one role per line. The tool resolves a role
 * into a child LLM route at call time, so edits apply to the next delegation
 * without restarting the harness.
 */

export interface Route {
  readonly provider: string;
  readonly model: string;
  readonly reasoningEffort?: string;
}

export type RoleValue = "inherit-parent" | Route;
export type RoleTable = ReadonlyMap<string, readonly RoleValue[]>;

const INHERIT = new Set(["inherit-parent", "auto", "parent"]);
const EFFORTS = new Set(["max", "xhigh", "high", "medium", "low", "off"]);

/**
 * Parse the role file. Unknown lines are ignored so a user note cannot break
 * delegation. Values are comma-separated for panel roles.
 */
export function parseModelConfig(source: string): RoleTable {
  const table = new Map<string, RoleValue[]>();
  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const roles = line
      .slice(0, separator)
      .split(",")
      .map((role) => role.trim().toLowerCase())
      .filter(Boolean);
    if (roles.length === 0) continue;
    const values = line
      .slice(separator + 1)
      .split(",")
      .map((value) => parseValue(value.trim()))
      .filter((value): value is RoleValue => value !== undefined);
    if (values.length === 0) continue;
    for (const role of roles) table.set(role, values);
  }
  return table;
}

export function parseValue(value: string): RoleValue | undefined {
  if (!value) return undefined;
  if (INHERIT.has(value.toLowerCase())) return "inherit-parent";
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;

  const [route, ...rest] = tokens;
  if (!route) return undefined;
  const slash = route.indexOf("/");
  if (slash <= 0 || slash === route.length - 1) {
    // A bare model id with no provider cannot be routed safely; ask the harness
    // to inherit rather than guessing a provider.
    return "inherit-parent";
  }
  const provider = route.slice(0, slash);
  const model = route.slice(slash + 1);
  const effortToken = rest.find((token) => EFFORTS.has(token.toLowerCase()));
  return {
    provider,
    model,
    ...(effortToken ? { reasoningEffort: effortToken.toLowerCase() } : {}),
  };
}

/**
 * Resolve one role to the route its first entry names. A missing role, a
 * missing entry, or `inherit-parent` all return `undefined`, which tells the
 * caller to omit `agentOptions` and let the child inherit the parent route.
 */
export function resolveRole(table: RoleTable, role: string | undefined): Route | undefined {
  if (!role) return undefined;
  const key = role.trim().toLowerCase();
  const direct = table.get(key);
  const values = direct ?? findLongestRole(table, key);
  const first = values?.[0];
  return first && first !== "inherit-parent" ? first : undefined;
}

/** Panel roles fan out one child per entry; aliases count as entries. */
export function resolvePanel(table: RoleTable, role: string): readonly RoleValue[] {
  return table.get(role.trim().toLowerCase()) ?? [];
}

function findLongestRole(table: RoleTable, key: string): readonly RoleValue[] | undefined {
  let best: readonly RoleValue[] | undefined;
  let bestLength = 0;
  for (const [candidate, values] of table) {
    const parts = candidate.split(",").map((part) => part.trim());
    if (parts.includes(key) && candidate.length >= bestLength) {
      best = values;
      bestLength = candidate.length;
    }
  }
  return best;
}
