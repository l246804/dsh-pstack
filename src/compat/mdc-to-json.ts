/**
 * The legacy `pstack-models.mdc` line format, migrated to the JSON role file.
 *
 * Detects the line grammar, parses it into structured routes, writes the current
 * JSON version, then deletes the `.mdc`. Nothing here runs once a `.json` exists.
 */

import { readFileSync, rmSync } from "node:fs";

import { writeFileAtomically } from "../lib/atomic-write.ts";
import { findRole } from "../roles/role-manifest.ts";
import { validateRoleRouteShape, type Route } from "../roles/route.ts";
import { isRetiredRoleKey } from "./role-values.ts";
import { ROLE_FILE_VERSION, serializeRoleDocument } from "../roles/role-store.ts";
import { parseLegacyRouteValue } from "./legacy-route.ts";

/** One file-level problem found while parsing the legacy line format. */
export interface LegacyRoleFileIssue {
  readonly message: string;
}

/** The semantic view of a legacy role file: budget value plus parsed routes. */
export interface LegacyRoleFile {
  readonly budget?: string;
  readonly roles: ReadonlyMap<string, readonly Route[]>;
  readonly issues: readonly LegacyRoleFileIssue[];
}

/** The single matcher for a `# budget:` line. Captures the value after the colon. */
export const BUDGET_LINE = /^[ \t]*#[ \t]*budget[ \t]*:[ \t]*(.*)$/i;

/** Return the value after `# budget:`, or `undefined` when the line is not a budget line. */
export function budgetLineValue(line: string): string | undefined {
  const match = BUDGET_LINE.exec(line);
  return match === null ? undefined : (match[1] ?? "").trim();
}

/** Drop the YAML frontmatter the Cursor rule format puts above the role lines. */
function stripFrontmatter(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return text;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return end === -1 ? text : lines.slice(end + 1).join("\n");
}

/** Parse the legacy line grammar. Pure: no filesystem access. */
export function parseLegacyRoleFileText(text: string): LegacyRoleFile {
  const roles = new Map<string, readonly Route[]>();
  const issues: LegacyRoleFileIssue[] = [];
  let budget: string | undefined;

  if (text !== "") {
    for (const rawLine of stripFrontmatter(text).split(/\r?\n/)) {
      const trimmed = rawLine.trim();
      if (trimmed === "") continue;
      if (trimmed.startsWith("#")) {
        const value = budgetLineValue(rawLine);
        if (value !== undefined && value !== "") budget = value;
        continue;
      }

      const colon = rawLine.indexOf(":");
      if (colon === -1) {
        issues.push({ message: `expected \`<role>: <value>\`, found ${JSON.stringify(trimmed)}` });
        continue;
      }
      const rawKey = rawLine.slice(0, colon).trim();
      if (rawKey === "") {
        issues.push({ message: "the role key is empty" });
        continue;
      }
      const spec = findRole(rawKey);
      if (spec === undefined) {
        if (isRetiredRoleKey(rawKey)) continue;
        issues.push({ message: `unknown pstack role ${JSON.stringify(rawKey)}` });
        continue;
      }

      const parsed = parseLegacyRouteValue(rawLine.slice(colon + 1));
      const entryIssues = [...parsed.issues];
      const shapeIssue = validateRoleRouteShape(spec, parsed.routes);
      if (shapeIssue !== undefined) entryIssues.push(shapeIssue);
      for (const issue of entryIssues) issues.push({ message: `${rawKey}: ${issue}` });
      if (parsed.routes.length === 0) continue;
      roles.set(spec.key, parsed.routes);
    }
  }

  return { ...(budget === undefined ? {} : { budget }), roles, issues };
}

/**
 * Parse `mdcPath`, write the current JSON version at `jsonPath`, then delete the
 * `.mdc`. Throws on a parse issue or write failure; the startup migration treats
 * that as best effort and leaves the legacy file in place.
 */
export function migrateMdcToJson(mdcPath: string, jsonPath: string): void {
  const parsed = parseLegacyRoleFileText(readFileSync(mdcPath, "utf8"));
  if (parsed.issues.length > 0) throw new Error(parsed.issues[0]!.message);
  const roles: Record<string, readonly Route[]> = {};
  for (const [key, routes] of parsed.roles) roles[key] = [...routes];
  writeFileAtomically(
    jsonPath,
    serializeRoleDocument({
      version: ROLE_FILE_VERSION,
      ...(parsed.budget === undefined ? {} : { budget: parsed.budget }),
      roles,
    }),
  );
  rmSync(mdcPath, { force: true });
}
