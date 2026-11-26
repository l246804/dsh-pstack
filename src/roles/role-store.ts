/**
 * Typed `$DSH_HOME/pstack/models.json` role file: read, parse, serialize, write.
 *
 * Two views of one file live here. The semantic view (`RoleConfiguration`)
 * parses each route into a `Route` and reports issues for the settings page and
 * the delegator. The editable view (`RoleFileDocument`) keeps the structured
 * routes so a save round-trips them unchanged. Both views handle only the
 * current schema version; `compat/migrate-pstack-home` upgrades a legacy `.mdc`
 * or an older JSON version once at plugin startup. Reading is pure: a missing
 * file means every role inherits the parent route, while an unreadable file fails
 * loudly instead of behaving like a fresh install.
 */

import { readFileSync } from "node:fs";

import { writeFileAtomically } from "../lib/atomic-write.ts";
import { describeError } from "../lib/errors.ts";
import { normalizeBudgetValue } from "./budget.ts";
import { findRole, isRetiredRoleKey } from "./role-manifest.ts";
import { parseRouteEntry, validateRoleRouteShape, type Route } from "./route.ts";

export type { Route } from "./route.ts";

/** One configured role as the semantic view sees it. */
export interface RoleEntry {
  readonly key: string;
  readonly routes: readonly Route[];
  readonly issues: readonly string[];
}

/** A file-level issue. JSON has no line numbers, so none are invented. */
export interface RoleFileIssue {
  readonly message: string;
}

/** Parsed role-file state. */
export type RoleConfiguration =
  | { readonly status: "missing"; readonly path: string }
  | { readonly status: "unreadable"; readonly path: string; readonly reason: string }
  | {
      readonly status: "loaded";
      readonly path: string;
      readonly budget?: string;
      readonly roles: ReadonlyMap<string, RoleEntry>;
      readonly issues: readonly RoleFileIssue[];
    };

/** The current role-file schema version. Version 1 stored provider/model strings. */
export const ROLE_FILE_VERSION = 2;

/** The document shape accepted by {@link serializeRoleDocument}. */
export interface RoleFileDocumentLike {
  readonly version: number;
  readonly budget?: string;
  readonly roles: Record<string, readonly Route[]>;
}

/** The editable JSON shape: version, optional budget, structured routes per role. */
export interface RoleFileDocument extends RoleFileDocumentLike {
  readonly version: typeof ROLE_FILE_VERSION;
}

/** An empty document for the first save on a missing home. */
export function emptyRoleDocument(): RoleFileDocument {
  return { version: ROLE_FILE_VERSION, roles: {} };
}

/** Read the version, budget, and roles map. Only the current version is accepted. */
function readRoleDocumentShape(text: string): {
  budget?: string;
  rawRoles: Record<string, unknown>;
} {
  const raw = parseJsonObject(text);
  const version = raw["version"];
  if (version !== ROLE_FILE_VERSION) {
    throw new Error(`unsupported role file version ${JSON.stringify(raw["version"])}`);
  }
  const budget = raw["budget"];
  if (budget !== undefined && typeof budget !== "string") {
    throw new Error("the role file budget must be a string when present");
  }
  const rawRoles = raw["roles"] ?? {};
  if (typeof rawRoles !== "object" || rawRoles === null || Array.isArray(rawRoles)) {
    throw new Error("the role file roles must be an object");
  }
  return {
    ...(budget === undefined ? {} : { budget }),
    rawRoles: rawRoles as Record<string, unknown>,
  };
}

/** Parse an editable document, omitting the logical role a save will replace. */
export function parseRoleDocument(text: string, replacingRole?: string): RoleFileDocument {
  const { budget, rawRoles } = readRoleDocumentShape(text);
  const roles: Record<string, readonly Route[]> = {};
  for (const [key, value] of Object.entries(rawRoles)) {
    if (isRetiredRoleKey(key)) continue;
    if (replacingRole !== undefined && findRole(key)?.key === replacingRole) continue;
    if (!Array.isArray(value)) {
      throw new Error(`role ${JSON.stringify(key)} routes must be an array of route entries`);
    }
    roles[key] = value.map((entry) => {
      const parsed = parseRouteEntry(entry);
      if (parsed.route === undefined) {
        throw new Error(`role ${JSON.stringify(key)}: ${parsed.issue}`);
      }
      return parsed.route;
    });
  }
  return {
    version: ROLE_FILE_VERSION,
    ...(budget === undefined ? {} : { budget: normalizeBudgetValue(budget) }),
    roles,
  };
}

/** Render an editable role document as stable, pretty-printed JSON. */
export function serializeRoleDocument(document: RoleFileDocumentLike): string {
  const roles: Record<string, readonly Route[]> = {};
  for (const [key, routes] of Object.entries(document.roles)) roles[key] = [...routes];
  return `${JSON.stringify(
    {
      version: ROLE_FILE_VERSION,
      ...(document.budget === undefined ? {} : { budget: document.budget }),
      roles,
    },
    null,
    2,
  )}\n`;
}

/** Parse a JSON role file into its semantic view. Throws only on an invalid top-level shape. */
export function parseRoleConfiguration(text: string, path: string): RoleConfiguration {
  const { budget, rawRoles } = readRoleDocumentShape(text);

  const roles = new Map<string, RoleEntry>();
  const issues: RoleFileIssue[] = [];
  for (const [rawKey, rawValue] of Object.entries(rawRoles)) {
    const spec = findRole(rawKey);
    if (spec === undefined) {
      if (isRetiredRoleKey(rawKey)) continue;
      issues.push({ message: `unknown pstack role ${JSON.stringify(rawKey)}` });
      continue;
    }
    if (!Array.isArray(rawValue)) {
      issues.push({ message: `${spec.key}: routes must be an array of route entries` });
      continue;
    }
    if (rawValue.length === 0) {
      issues.push({ message: `${spec.key}: routes are empty` });
      continue;
    }
    const routes: Route[] = [];
    const entryIssues: string[] = [];
    rawValue.forEach((entry, index) => {
      const parsed = parseRouteEntry(entry);
      if (parsed.route === undefined) entryIssues.push(`entry ${index + 1} ${parsed.issue}`);
      else routes.push(parsed.route);
    });
    const shapeIssue = validateRoleRouteShape(spec, routes);
    if (shapeIssue !== undefined) entryIssues.push(shapeIssue);
    for (const issue of entryIssues) issues.push({ message: `${spec.key}: ${issue}` });
    if (roles.has(spec.key)) {
      issues.push({
        message: `role ${JSON.stringify(spec.key)} is configured twice; the later entry wins`,
      });
    }
    roles.set(spec.key, { key: spec.key, routes, issues: entryIssues });
  }

  return {
    status: "loaded",
    path,
    ...(budget === undefined ? {} : { budget: normalizeBudgetValue(budget) }),
    roles,
    issues,
  };
}

/** Read the role file without throwing or writing. */
export function readRoleConfiguration(path: string): RoleConfiguration {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing", path };
    return { status: "unreadable", path, reason: describeError(error) };
  }
  try {
    return parseRoleConfiguration(text, path);
  } catch (error) {
    return { status: "unreadable", path, reason: describeError(error) };
  }
}

/** Atomically write an editable role document. */
export function writeRoleDocument(path: string, document: RoleFileDocument): void {
  writeFileAtomically(path, serializeRoleDocument(document));
}

function parseJsonObject(text: string): Record<string, unknown> {
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("the role file must be a JSON object");
  }
  return raw as Record<string, unknown>;
}
