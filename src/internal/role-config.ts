/**
 * The pstack role configuration: `$DSH_HOME/pstack-models.md`.
 *
 * `pstack_subagent` reads this file again on every delegation, so a change reaches the
 * next child and never a child that already started.
 *
 * Three states stay apart because each needs a different fix: the file is missing (no
 * policy, so every role inherits the parent route), unreadable (a broken install, never
 * treated as "no configuration"), or loaded with per-line issues reported by line.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  INHERIT_PARENT_ALIASES,
  PSTACK_MODELS_FILENAME,
  ROLE_MANIFEST,
  findRoleSpec,
  type RoleSpec,
} from "./role-manifest.ts";

/** One resolved child route. */
export type Route =
  | { readonly kind: "inherit" }
  | {
      readonly kind: "route";
      readonly provider: string;
      readonly model: string;
      readonly effort?: string;
    };

/** One recognized role line and the configuration problems its delegation must reject. */
export interface RoleEntry {
  readonly line: number;
  readonly rawKey: string;
  readonly key: string;
  readonly spec: RoleSpec;
  readonly routes: readonly Route[];
  readonly issues: readonly string[];
}

export interface RoleConfigurationIssue {
  readonly line?: number;
  readonly message: string;
}

/** The parsed role file. */
export type RoleConfiguration =
  | { readonly status: "missing"; readonly path: string }
  | { readonly status: "unreadable"; readonly path: string; readonly reason: string }
  | {
      readonly status: "loaded";
      readonly path: string;
      readonly budget?: string;
      readonly roles: ReadonlyMap<string, RoleEntry>;
      readonly issues: readonly RoleConfigurationIssue[];
    };

/** Absolute path of the role file for one DSH home. */
export function modelsFilePath(dshHome: string): string {
  return join(dshHome, PSTACK_MODELS_FILENAME);
}

/** Resolve `$DSH_HOME` the way the Host does: the environment when set, else `~/.dsh`. */
export function resolveDshHome(
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): string {
  const configured = env["DSH_HOME"];
  const path =
    configured !== undefined && configured.trim() !== "" ? configured : join(home, ".dsh");
  const expanded =
    path === "~"
      ? home
      : path.startsWith("~/") || path.startsWith("~\\")
        ? join(home, path.slice(2))
        : path;
  return resolve(expanded);
}

/** Read the role file. Never throws for a missing or unreadable file. */
export function readRoleConfiguration(path: string): RoleConfiguration {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { status: "missing", path };
    return { status: "unreadable", path, reason: describeError(error) };
  }
  return parseRoleConfiguration(text, path);
}

/** Parse role-file text. Pure: no file system access. */
export function parseRoleConfiguration(text: string, path: string): RoleConfiguration {
  const issues: RoleConfigurationIssue[] = [];
  const roles = new Map<string, RoleEntry>();
  let budget: string | undefined;

  stripFrontmatter(text)
    .split("\n")
    .forEach((rawLine, index) => {
      const line = index + 1;
      const trimmed = rawLine.trim();
      if (trimmed === "") return;

      if (trimmed.startsWith("#")) {
        const match = /^#\s*budget:\s*(.+)$/i.exec(trimmed);
        if (match !== null) budget = (match[1] as string).trim();
        return;
      }

      const separator = trimmed.indexOf(":");
      if (separator === -1) {
        issues.push({
          line,
          message: `expected \`<role>: <value>\`, found ${JSON.stringify(trimmed)}`,
        });
        return;
      }

      const rawKey = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      const key = normalizeRoleName(rawKey);
      if (key === "") {
        issues.push({ line, message: "the role key is empty" });
        return;
      }

      const spec = findRoleSpec(key);
      if (spec === undefined) {
        issues.push({ line, message: unknownRoleMessage(rawKey, key) });
        return;
      }

      const parsed = parseRouteValue(rawValue);
      const entryIssues = [...parsed.issues];
      if (spec.shape === "single" && parsed.routes.length > 1) {
        entryIssues.push("a single-route role cannot hold a comma-separated list");
      }
      for (const issue of entryIssues) issues.push({ line, message: `${rawKey}: ${issue}` });
      if (parsed.routes.length === 0) return;

      const previous = roles.get(spec.key);
      if (previous !== undefined) {
        issues.push({
          line,
          message: `role "${spec.key}" is already configured on line ${previous.line}; line ${line} wins`,
        });
      }
      roles.set(spec.key, {
        line,
        rawKey,
        key: spec.key,
        spec,
        routes: parsed.routes,
        issues: entryIssues,
      });
    });

  return budget === undefined
    ? { status: "loaded", path, roles, issues }
    : { status: "loaded", path, budget, roles, issues };
}

export interface RouteParseResult {
  readonly routes: readonly Route[];
  readonly issues: readonly string[];
}

/** Parse a role value: one route, or a comma-separated list of routes. */
export function parseRouteValue(raw: string): RouteParseResult {
  const routes: Route[] = [];
  const issues: string[] = [];
  const segments = raw.split(",");

  segments.forEach((segment, index) => {
    const trimmed = segment.trim();
    if (trimmed === "") {
      if (index !== segments.length - 1) issues.push(`entry ${index + 1} of the list is empty`);
      return;
    }
    const parsed = parseRoute(trimmed);
    if (parsed.route === undefined) {
      issues.push(parsed.issue as string);
      return;
    }
    routes.push(parsed.route);
  });

  if (routes.length === 0 && issues.length === 0) {
    issues.push(
      "the value is empty; use `inherit-parent`, `auto`, or `<provider>/<model> [effort]`",
    );
  }
  return { routes, issues };
}

export interface SingleRouteParse {
  readonly route?: Route;
  readonly issue?: string;
}

/** Parse one entry of a role value. */
export function parseRoute(raw: string): SingleRouteParse {
  const value = raw.trim();
  if (value === "") return { issue: "the value is empty" };

  if (INHERIT_PARENT_ALIASES.includes(value.toLowerCase())) {
    return { route: { kind: "inherit" } };
  }

  // Split at the first `/`: a model id may carry its own vendor prefix, so
  // `gateway/vendor-a/model-x` is provider `gateway` and model `vendor-a/model-x`.
  // The model is one or more non-empty segments, so `provider//model` is rejected
  // here with a line number instead of at the first delegation.
  const match = /^([^\s/,[]+)\/([^\s/,[\]]+(?:\/[^\s/,[\]]+)*)(?:\s+\[([^[\]]*)\])?$/.exec(value);
  if (match === null) {
    return {
      issue: `${JSON.stringify(value)} is not a route; use \`inherit-parent\`, \`auto\`, or \`<provider>/<model> [effort]\``,
    };
  }

  const provider = match[1] as string;
  const model = match[2] as string;
  const effort = match[3];

  if (effort === undefined) return { route: { kind: "route", provider, model } };
  const trimmedEffort = effort.trim();
  if (trimmedEffort === "") {
    return {
      issue: `${JSON.stringify(value)} has empty brackets; write \`<provider>/<model> [effort]\` or drop the brackets`,
    };
  }
  if (/\s/.test(trimmedEffort)) {
    return {
      issue: `${JSON.stringify(value)} has a multi-word effort; an effort is one adapter-owned token`,
    };
  }
  return { route: { kind: "route", provider, model, effort: trimmedEffort } };
}

/** How one role's value expands into children. */
export type RouteSelectionMode = "single" | "panel" | "selected";

export interface RouteSelection {
  readonly role: RoleSpec;
  readonly mode: RouteSelectionMode;
  /** Whether the role came from the file or the inherit-parent fallback. */
  readonly configured: boolean;
  readonly routes: readonly Route[];
  /** How many entries the role holds, before selection. */
  readonly total: number;
  readonly roleIndex?: number;
}

/** Raised when a role's configured list cannot be selected from. */
export class RouteSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteSelectionError";
  }
}

/**
 * Expand one role into the routes this call starts.
 *
 * Automatic panels start one child per entry. Another list role selects one entry, the
 * first by default; `roleIndex` chooses which. A single role holds exactly one route and
 * rejects `roleIndex`.
 */
export function selectRoleRoutes(
  spec: RoleSpec,
  entry: RoleEntry | undefined,
  roleIndex: number | undefined,
): RouteSelection {
  if (spec.shape === "single" && roleIndex !== undefined) {
    throw new RouteSelectionError(
      `role "${spec.key}" holds a single route, so \`roleIndex\` does not apply; drop \`roleIndex\` or use a list-valued role (${listRoleKeys().join(", ")})`,
    );
  }
  if (spec.autoPanel && roleIndex !== undefined) {
    throw new RouteSelectionError(
      `role "${spec.key}" is an automatic panel: it starts one child per entry, so \`roleIndex\` does not apply`,
    );
  }

  if (entry === undefined) {
    return {
      role: spec,
      mode: spec.autoPanel ? "panel" : "single",
      configured: false,
      routes: [{ kind: "inherit" }],
      total: 1,
    };
  }
  if (entry.issues.length > 0) {
    throw new RouteSelectionError(
      `role "${spec.key}" has invalid configuration on line ${entry.line}: ${entry.issues.join("; ")}. Fix the role file before delegating.`,
    );
  }

  if (spec.autoPanel) {
    return {
      role: spec,
      mode: "panel",
      configured: true,
      routes: entry.routes,
      total: entry.routes.length,
    };
  }

  if (spec.shape === "list") {
    const index = roleIndex ?? 0;
    if (index >= entry.routes.length) {
      throw new RouteSelectionError(
        `role "${spec.key}" has ${entry.routes.length} entr${entry.routes.length === 1 ? "y" : "ies"}, so \`roleIndex\` ${index} is out of range; valid indexes are ${entry.routes
          .map((_route, position) => position)
          .join(", ")}`,
      );
    }
    return {
      role: spec,
      mode: "selected",
      configured: true,
      routes: [entry.routes[index] as Route],
      total: entry.routes.length,
      roleIndex: index,
    };
  }

  return {
    role: spec,
    mode: "single",
    configured: true,
    routes: [entry.routes[0] as Route],
    total: entry.routes.length,
  };
}

/** Keys of the list-valued roles, including the automatic panels. */
export function listRoleKeys(): readonly string[] {
  return ROLE_MANIFEST.filter((role) => role.shape === "list").map((role) => role.key);
}

/** Raised when a role name does not match the manifest. */
export class RoleNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleNameError";
  }
}

/** Normalize a role name for lookup. Case, spacing, spacing around a comma, and a trailing colon are formatting. */
export function normalizeRoleName(raw: string): string {
  return raw
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/:+$/, "")
    .trim();
}

/** Resolve a role name, or throw a diagnostic that names the near misses. */
export function requireRole(raw: string): RoleSpec {
  const spec = findRoleSpec(normalizeRoleName(raw));
  if (spec !== undefined) return spec;
  const suggestions = suggestRoles(raw);
  const hint =
    suggestions.length === 0
      ? "No role key is close to it."
      : `Closest role keys: ${suggestions.map((key) => `"${key}"`).join(", ")}.`;
  throw new RoleNameError(
    `unknown pstack role ${JSON.stringify(raw)}. ${hint} Role names come from the role manifest, not from free text: pass the exact key, or omit \`role\` to inherit the parent route.`,
  );
}

function suggestRoles(raw: string, limit = 3): readonly string[] {
  const target = normalizeRoleName(raw);
  if (target === "") return [];
  const scored = ROLE_MANIFEST.map((role) => {
    const shared = sharedTokenCount(target, role.key);
    const distance = editDistance(target, role.key);
    const contains = role.key.includes(target) || target.includes(role.key);
    const score =
      (contains ? 1000 : 0) + shared * 100 - distance + Math.min(role.key.length, target.length);
    return { key: role.key, score, distance, shared, contains };
  }).filter((candidate) => candidate.contains || candidate.shared > 0 || candidate.distance <= 4);
  return scored
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((candidate) => candidate.key);
}

function unknownRoleMessage(rawKey: string, key: string): string {
  const suggestions = suggestRoles(key);
  const hint =
    suggestions.length === 0
      ? "no role key is close to it"
      : `closest role keys: ${suggestions.map((candidate) => `"${candidate}"`).join(", ")}`;
  return `unknown role ${JSON.stringify(rawKey)} (${hint}). A line for a retired or misspelled role is reported rather than ignored.`;
}

function sharedTokenCount(left: string, right: string): number {
  const rightTokens = new Set(tokenize(right));
  return [...new Set(tokenize(left))].filter((token) => rightTokens.has(token)).length;
}

function tokenize(value: string): readonly string[] {
  return value.split(/[^a-z0-9]+/).filter((token) => token !== "");
}

/** Levenshtein distance, iterative with one row of state. */
function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left === "") return right.length;
  if (right === "") return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current: number[] = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution =
        (previous[column - 1] as number) + (left[row - 1] === right[column - 1] ? 0 : 1);
      const deletion = (previous[column] as number) + 1;
      const insertion = (current[column - 1] as number) + 1;
      current.push(Math.min(substitution, deletion, insertion));
    }
    previous = current;
  }
  return previous[right.length] as number;
}

function stripFrontmatter(text: string): string {
  const normalized = text.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n")) return normalized;
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return normalized;
  const after = normalized.indexOf("\n", end + 1);
  return after === -1 ? "" : normalized.slice(after + 1);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}
