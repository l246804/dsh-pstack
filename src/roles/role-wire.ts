/** Wire shapes shared by the role settings Host service and Client page. */

import { isRoleKey, ROLE_SHAPES, type RoleShape } from "./role-manifest.ts";
import { parseRouteEntry, type Route } from "./route.ts";
import { WireTypeError, optionalString, parseRecord } from "../lib/wire-error.ts";

export { parseCatalogueResult } from "../models/catalogue.ts";
export { WireTypeError } from "../lib/wire-error.ts";

export type RouteView = Route;

export interface RoleView {
  readonly key: string;
  readonly shape: RoleShape;
  readonly configured: boolean;
  readonly routes: readonly RouteView[];
  readonly issues: readonly string[];
}

export interface RoleFileIssueView {
  readonly message: string;
}

export interface RoleFileSnapshot {
  readonly path: string;
  readonly status: "missing" | "loaded" | "unreadable";
  readonly reason?: string;
  readonly budget?: string;
  readonly roles: readonly RoleView[];
  readonly issues: readonly RoleFileIssueView[];
  readonly canSave: boolean;
}

export interface SaveRoleRequest {
  readonly key: string;
  readonly routes: readonly RouteView[];
}

export type SaveRoleResult =
  | { readonly ok: true; readonly snapshot: RoleFileSnapshot }
  | { readonly ok: false; readonly reason: string };

export type BudgetApplyResult = SaveRoleResult;

function parseRouteView(value: unknown, path: string): RouteView {
  const parsed = parseRouteEntry(value);
  if (parsed.route === undefined) throw new WireTypeError(path, parsed.issue);
  return parsed.route;
}

/** Parse one save request. An empty route list removes the role line. */
export function parseSaveRoleRequest(value: unknown): SaveRoleRequest {
  const record = parseRecord(value, "request");
  if (typeof record["key"] !== "string" || record["key"].trim() === "") {
    throw new WireTypeError("request.key", "a non-empty string");
  }
  if (!Array.isArray(record["routes"])) {
    throw new WireTypeError("request.routes", "an array");
  }
  return {
    key: record["key"],
    routes: record["routes"].map((route, index) =>
      parseRouteView(route, `request.routes[${index}]`),
    ),
  };
}

function parseRoleFileIssue(value: unknown, path: string): RoleFileIssueView {
  const record = parseRecord(value, path);
  if (typeof record["message"] !== "string") {
    throw new WireTypeError(`${path}.message`, "a string");
  }
  return { message: record["message"] };
}

function parseRoleView(value: unknown, index: number): RoleView {
  const path = `snapshot.roles[${index}]`;
  const record = parseRecord(value, path);
  if (typeof record["key"] !== "string" || !isRoleKey(record["key"])) {
    throw new WireTypeError(`${path}.key`, "a role in the manifest");
  }
  if (
    typeof record["shape"] !== "string" ||
    !(ROLE_SHAPES as readonly string[]).includes(record["shape"])
  ) {
    throw new WireTypeError(`${path}.shape`, '"single" or "list"');
  }
  if (typeof record["configured"] !== "boolean") {
    throw new WireTypeError(`${path}.configured`, "a boolean");
  }
  if (!Array.isArray(record["routes"]) || !Array.isArray(record["issues"])) {
    throw new WireTypeError(path, "routes and issues arrays");
  }
  return {
    key: record["key"],
    shape: record["shape"] as RoleShape,
    configured: record["configured"],
    routes: record["routes"].map((route, routeIndex) =>
      parseRouteView(route, `${path}.routes[${routeIndex}]`),
    ),
    issues: record["issues"].map((issue, issueIndex) => {
      if (typeof issue !== "string") {
        throw new WireTypeError(`${path}.issues[${issueIndex}]`, "a string");
      }
      return issue;
    }),
  };
}

/** Parse one role-file snapshot returned by the Host. */
export function parseRoleFileSnapshot(value: unknown): RoleFileSnapshot {
  const record = parseRecord(value, "snapshot");
  const status = record["status"];
  if (status !== "missing" && status !== "loaded" && status !== "unreadable") {
    throw new WireTypeError("snapshot.status", '"missing", "loaded", or "unreadable"');
  }
  if (typeof record["path"] !== "string") {
    throw new WireTypeError("snapshot.path", "a string");
  }
  if (typeof record["canSave"] !== "boolean") {
    throw new WireTypeError("snapshot.canSave", "a boolean");
  }
  if (!Array.isArray(record["roles"]) || !Array.isArray(record["issues"])) {
    throw new WireTypeError("snapshot", "roles and issues arrays");
  }
  const reason = optionalString(record, "reason", "snapshot");
  const budget = optionalString(record, "budget", "snapshot");
  return {
    path: record["path"],
    status,
    ...(reason === undefined ? {} : { reason }),
    ...(budget === undefined ? {} : { budget }),
    roles: record["roles"].map((role, index) => parseRoleView(role, index)),
    issues: record["issues"].map((issue, index) =>
      parseRoleFileIssue(issue, `snapshot.issues[${index}]`),
    ),
    canSave: record["canSave"],
  };
}

function parseSnapshotResult(value: unknown): SaveRoleResult {
  const record = parseRecord(value, "result");
  if (record["ok"] === true)
    return { ok: true, snapshot: parseRoleFileSnapshot(record["snapshot"]) };
  if (record["ok"] === false && typeof record["reason"] === "string") {
    return { ok: false, reason: record["reason"] };
  }
  throw new WireTypeError("result", "a successful snapshot or a refusal reason");
}

/** Parse one role-save result returned by the Host. */
export const parseSaveRoleResult = parseSnapshotResult;

/** Parse one budget-apply result returned by the Host. */
export const parseBudgetApplyResult = parseSnapshotResult;
