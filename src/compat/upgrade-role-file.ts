/**
 * Upgrade one JSON role file to the current version in place. Each legacy JSON
 * shape lives in its own migration module; the `.mdc` line format is migrated by
 * `compat/mdc-to-json.ts` before this runs.
 */

import { existsSync, readFileSync } from "node:fs";

import { writeFileAtomically } from "../lib/atomic-write.ts";
import { describeError } from "../lib/errors.ts";
import { normalizeBudgetValue, isRetiredRoleKey } from "./role-values.ts";
import { ROLE_FILE_VERSION, serializeRoleDocument } from "../roles/role-store.ts";
import { parseRouteEntry, type Route } from "../roles/route.ts";
import { upgradeVersionOneRoles } from "./version-1-to-2.ts";

/** Result of checking and upgrading one role file in place. */
export type RoleFileUpgrade =
  | { readonly status: "current" }
  | { readonly status: "migrated" }
  | { readonly status: "missing" }
  | { readonly status: "unreadable"; readonly reason: string };

/**
 * Upgrade a JSON role file in place. A `version: 1` document is rewritten with
 * structured routes; a current-version document is sanitized (retired roles and
 * budget labels dropped); an unknown version is unreadable. The file always ends
 * up at the current version, or the result reports why not.
 */
export function upgradeRoleFile(jsonPath: string): RoleFileUpgrade {
  if (!existsSync(jsonPath)) return { status: "missing" };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  } catch (error) {
    return { status: "unreadable", reason: describeError(error) };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { status: "unreadable", reason: "the role file must be a JSON object" };
  }
  const record = raw as Record<string, unknown>;
  const version = record["version"];
  if (version === ROLE_FILE_VERSION) {
    const sanitized = sanitizeCurrentRoleFile(record);
    if (sanitized === undefined || !sanitized.changed) return { status: "current" };
    try {
      writeFileAtomically(
        jsonPath,
        serializeRoleDocument({
          version: ROLE_FILE_VERSION,
          ...(sanitized.budget === undefined ? {} : { budget: sanitized.budget }),
          roles: sanitized.roles,
        }),
      );
      return { status: "migrated" };
    } catch (error) {
      return { status: "unreadable", reason: describeError(error) };
    }
  }
  if (version !== 1) {
    return {
      status: "unreadable",
      reason: `unsupported role file version ${JSON.stringify(version)}`,
    };
  }
  try {
    const upgraded = upgradeVersionOneRoles(record["roles"]);
    const budget = record["budget"];
    if (budget !== undefined && typeof budget !== "string") {
      return { status: "unreadable", reason: "the role file budget must be a string" };
    }
    const sanitized = sanitizeCurrentRoleFile({
      roles: upgraded,
      ...(budget === undefined ? {} : { budget }),
    });
    if (sanitized === undefined) {
      return { status: "unreadable", reason: "the role file roles must be an object" };
    }
    writeFileAtomically(
      jsonPath,
      serializeRoleDocument({
        version: ROLE_FILE_VERSION,
        ...(sanitized.budget === undefined ? {} : { budget: sanitized.budget }),
        roles: sanitized.roles,
      }),
    );
    return { status: "migrated" };
  } catch (error) {
    return { status: "unreadable", reason: describeError(error) };
  }
}

/**
 * A current-version file can still carry retired role keys or a retired budget
 * label. Drop the retired keys and remap the budget so the file matches the
 * current manifest. Returns `undefined` when the shape is not safe to rewrite, so
 * the normal reader reports the issue instead.
 */
function sanitizeCurrentRoleFile(record: Record<string, unknown>):
  | {
      readonly changed: boolean;
      readonly budget?: string;
      readonly roles: Record<string, readonly Route[]>;
    }
  | undefined {
  const rawRoles = record["roles"] ?? {};
  if (typeof rawRoles !== "object" || rawRoles === null || Array.isArray(rawRoles)) {
    return undefined;
  }
  const roles: Record<string, readonly Route[]> = {};
  let changed = false;
  for (const [key, value] of Object.entries(rawRoles as Record<string, unknown>)) {
    if (!Array.isArray(value)) return undefined;
    if (isRetiredRoleKey(key)) {
      changed = true;
      continue;
    }
    const routes: Route[] = [];
    for (const entry of value) {
      const parsed = parseRouteEntry(entry);
      if (parsed.route === undefined) return undefined;
      routes.push(parsed.route);
    }
    roles[key] = routes;
  }
  const rawBudget = record["budget"];
  if (rawBudget !== undefined && typeof rawBudget !== "string") return undefined;
  const budget = normalizeBudgetValue(rawBudget);
  if (budget !== rawBudget) changed = true;
  return { changed, ...(budget === undefined ? {} : { budget }), roles };
}
