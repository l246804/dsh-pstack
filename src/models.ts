/**
 * The pstack role file: `$DSH_HOME/pstack-models.md`.
 *
 * `pstack_subagent` reads this file again on every delegation, so a change reaches
 * the next child and never a child that already started.
 *
 * Three states are kept apart on purpose, because they need different fixes:
 *
 * - the file does not exist: no policy is configured, so every role inherits the
 *   parent route;
 * - the file exists but cannot be read: a broken installation or permission
 *   problem, reported as an error and never treated as "no configuration";
 * - the file loads but a line is wrong: a typo in a key, an unknown retired role,
 *   or a malformed value is reported with the line number and the near misses.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  INHERIT_PARENT_ALIASES,
  PSTACK_MODELS_FILENAME,
  ROLE_MANIFEST,
  type RoleSpec,
} from "../scripts/role-manifest.ts";
import { normalizeRoleName, suggestRoles } from "./roles.ts";

/** One resolved child route. */
export type ChildRoute =
  | { readonly kind: "inherit" }
  | {
      readonly kind: "route";
      readonly provider: string;
      readonly model: string;
      readonly effort?: string;
    };

/** A syntactically valid line for a role the manifest knows. */
export interface RoleFileEntry {
  readonly line: number;
  /** Verbatim key text from the file. */
  readonly rawKey: string;
  /** Normalized key that matched the manifest. */
  readonly key: string;
  readonly spec: RoleSpec;
  /** Verbatim value text from the file. */
  readonly rawValue: string;
  readonly routes: readonly ChildRoute[];
}

/** A recoverable problem found while reading the file. */
export interface RoleFileIssue {
  /** 1-based line number, when the issue belongs to one line. */
  readonly line?: number;
  readonly message: string;
}

export type RoleFileRead =
  | { readonly status: "missing"; readonly path: string }
  | { readonly status: "unreadable"; readonly path: string; readonly reason: string }
  | {
      readonly status: "loaded";
      readonly path: string;
      /** The `# budget:` label the file records, when it has one. */
      readonly budget?: string;
      readonly roles: ReadonlyMap<string, RoleFileEntry>;
      readonly issues: readonly RoleFileIssue[];
    };

/** Absolute path of the role file for one DSH home. */
export function modelsFilePath(dshHome: string): string {
  return join(dshHome, PSTACK_MODELS_FILENAME);
}

/**
 * Resolve `$DSH_HOME` the way the Host does: the environment when set, else
 * `~/.dsh`.
 */
export function resolveDshHome(
  env: Readonly<Record<string, string | undefined>> = process.env,
  home: string = homedir(),
): string {
  const configured = env["DSH_HOME"];
  if (configured !== undefined && configured.trim() !== "") return configured;
  return join(home, ".dsh");
}

/** Read the role file. Never throws for a missing or unreadable file. */
export function readRoleFile(path: string): RoleFileRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { status: "missing", path };
    return { status: "unreadable", path, reason: describeError(error) };
  }
  return parseRoleFile(text, path);
}

/** Parse role-file text. Pure: no file system access. */
export function parseRoleFile(text: string, path: string): RoleFileRead {
  const issues: RoleFileIssue[] = [];
  const roles = new Map<string, RoleFileEntry>();
  const lines = stripFrontmatter(text).split("\n");
  let budget: string | undefined;

  lines.forEach((rawLine, index) => {
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

    const spec = findSpec(key);
    if (spec === undefined) {
      issues.push({
        line,
        message: unknownRoleMessage(rawKey, key),
      });
      return;
    }

    const parsed = parseRouteValue(rawValue);
    for (const issue of parsed.issues) issues.push({ line, message: `${rawKey}: ${issue}` });
    if (parsed.routes.length === 0) return;

    const previous = roles.get(spec.key);
    if (previous !== undefined) {
      issues.push({
        line,
        message: `role "${spec.key}" is already configured on line ${previous.line}; line ${line} wins`,
      });
    }
    roles.set(spec.key, { line, rawKey, key: spec.key, spec, rawValue, routes: parsed.routes });
  });

  return budget === undefined
    ? { status: "loaded", path, roles, issues }
    : { status: "loaded", path, budget, roles, issues };
}

export interface RouteParseResult {
  readonly routes: readonly ChildRoute[];
  readonly issues: readonly string[];
}

/** Parse a role value: one route, or a comma-separated list of routes. */
export function parseRouteValue(raw: string): RouteParseResult {
  const routes: ChildRoute[] = [];
  const issues: string[] = [];
  const segments = raw.split(",");

  segments.forEach((segment, index) => {
    const trimmed = segment.trim();
    if (trimmed === "") {
      // A single trailing comma is harmless; a hole in the middle is a typo.
      if (index !== segments.length - 1) {
        issues.push(`entry ${index + 1} of the list is empty`);
      }
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
  readonly route?: ChildRoute;
  readonly issue?: string;
}

/** Parse one entry of a role value. */
export function parseRoute(raw: string): SingleRouteParse {
  const value = raw.trim();
  if (value === "") {
    return { issue: "the value is empty" };
  }

  if (INHERIT_PARENT_ALIASES.includes(value.toLowerCase())) {
    return { route: { kind: "inherit" } };
  }

  const match = /^([^\s/,[]+)\/([^\s/,[\]]+)(?:\s+\[([^[\]]*)\])?$/.exec(value);
  if (match === null) {
    return {
      issue: `${JSON.stringify(value)} is not a route; use \`inherit-parent\`, \`auto\`, or \`<provider>/<model> [effort]\``,
    };
  }

  const provider = match[1] as string;
  const model = match[2] as string;
  const effort = match[3];

  if (effort === undefined) {
    return { route: { kind: "route", provider, model } };
  }
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
  /** Whether the role came from the file or from the inherit-parent fallback. */
  readonly configured: boolean;
  readonly routes: readonly ChildRoute[];
  /** How many entries the role holds, before selection. */
  readonly total: number;
  readonly roleIndex?: number;
  readonly issues: readonly string[];
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
 * The three auto-panel roles start one child per entry. Another list role selects
 * one entry, the first by default, and `roleIndex` chooses which. A single role
 * holds exactly one route and rejects `roleIndex`.
 */
export function selectRoleRoutes(
  spec: RoleSpec,
  entry: RoleFileEntry | undefined,
  roleIndex: number | undefined,
): RouteSelection {
  if (spec.shape === "single" && roleIndex !== undefined) {
    throw new RouteSelectionError(
      `role "${spec.key}" holds a single route, so \`roleIndex\` does not apply; drop \`roleIndex\` or use a list-valued role (${listRoleKeys().join(", ")})`,
    );
  }
  if (spec.autoPanel && roleIndex !== undefined) {
    throw new RouteSelectionError(
      `role "${spec.key}" is an automatic panel: it starts one child per entry, so \`roleIndex\` does not apply; configure the entries you want in ${PSTACK_MODELS_FILENAME}`,
    );
  }

  if (entry === undefined) {
    return {
      role: spec,
      mode: spec.autoPanel ? "panel" : "single",
      configured: false,
      routes: [{ kind: "inherit" }],
      total: 1,
      issues: [],
    };
  }

  if (spec.autoPanel) {
    return {
      role: spec,
      mode: "panel",
      configured: true,
      routes: entry.routes,
      total: entry.routes.length,
      issues: [],
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
      routes: [entry.routes[index] as ChildRoute],
      total: entry.routes.length,
      roleIndex: index,
      issues: [],
    };
  }

  return {
    role: spec,
    mode: "single",
    configured: true,
    routes: [entry.routes[0] as ChildRoute],
    total: entry.routes.length,
    issues: [],
  };
}

/** Keys of the list-valued roles, including the automatic panels. */
export function listRoleKeys(): readonly string[] {
  return ROLE_MANIFEST.filter((role) => role.shape === "list").map((role) => role.key);
}

function findSpec(key: string): RoleSpec | undefined {
  return ROLE_MANIFEST.find((role) => role.key === key);
}

function unknownRoleMessage(rawKey: string, key: string): string {
  const suggestions = suggestRoles(key);
  const hint =
    suggestions.length === 0
      ? "no role key is close to it"
      : `closest role keys: ${suggestions.map((candidate) => `"${candidate}"`).join(", ")}`;
  return `unknown role ${JSON.stringify(rawKey)} (${hint}). A line for a retired or misspelled role would otherwise be ignored, so it is reported instead.`;
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
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}
