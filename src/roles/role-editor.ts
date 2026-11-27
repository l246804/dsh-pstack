/**
 * Role-file editing behind the settings page.
 *
 * A save changes or removes one logical role and preserves every other role and
 * the budget. The editor mutates the JSON document, validates concrete routes
 * against the live model catalogue before the first byte is written, and leaves
 * a rejected save's file unchanged.
 */

import { readFileSync } from "node:fs";

import type { LlmRuntime } from "@deepseek-ai/dsh-llm";

import { collectCatalogue } from "../models.ts";
import { describeError } from "../lib/errors.ts";
import { isBudgetRowBlocked, planBudget, type BudgetApplyRequest } from "./budget.ts";
import { ROLE_MANIFEST, findRole } from "./role-manifest.ts";
import { routesEqual, validateRoleRouteShape, type Route } from "./route.ts";
import {
  emptyRoleDocument,
  parseRoleConfiguration,
  parseRoleDocument,
  readRoleConfiguration,
  ROLE_FILE_VERSION,
  serializeRoleDocument,
  writeRoleDocument,
  type RoleConfiguration,
  type RoleEntry,
  type RoleFileDocument,
} from "./role-store.ts";
import {
  type BudgetApplyResult,
  type RoleFileSnapshot,
  type RoleView,
  type SaveRoleRequest,
  type SaveRoleResult,
} from "./role-wire.ts";

/** A catalogue stand-in for saves that never consult the model directory. */
const EMPTY_CATALOGUE = { providers: [], truncated: false } as const;

/** Project one parsed file onto the manifest. */
export function snapshotFromConfiguration(config: RoleConfiguration): RoleFileSnapshot {
  if (config.status === "unreadable") {
    return {
      path: config.path,
      status: "unreadable",
      reason: config.reason,
      roles: ROLE_MANIFEST.map((role) => roleView(role.key, role.shape, undefined)),
      issues: [],
      canSave: false,
    };
  }
  if (config.status === "missing") {
    return {
      path: config.path,
      status: "missing",
      roles: ROLE_MANIFEST.map((role) => roleView(role.key, role.shape, undefined)),
      issues: [],
      canSave: true,
    };
  }
  return {
    path: config.path,
    status: "loaded",
    ...(config.budget === undefined ? {} : { budget: config.budget }),
    roles: ROLE_MANIFEST.map((role) => roleView(role.key, role.shape, config.roles.get(role.key))),
    issues: config.issues.map((issue) => ({ message: issue.message })),
    canSave: true,
  };
}

function roleView(key: string, shape: "single" | "list", entry: RoleEntry | undefined): RoleView {
  return {
    key,
    shape,
    configured: entry !== undefined,
    routes: entry === undefined ? [] : [...entry.routes],
    issues: entry === undefined ? [] : [...entry.issues],
  };
}

/** Validate a save against the manifest and the live model catalogue. */
export function validateSaveRequest(
  request: SaveRoleRequest,
  catalogue: Awaited<ReturnType<typeof collectCatalogue>>,
): { ok: true; key: string; routes: readonly Route[] } | { ok: false; reason: string } {
  const spec = findRole(request.key);
  if (spec === undefined)
    return { ok: false, reason: `unknown pstack role ${JSON.stringify(request.key)}` };
  const shapeIssue = validateRoleRouteShape(spec, request.routes);
  if (shapeIssue !== undefined) {
    return { ok: false, reason: shapeIssue };
  }
  if (request.routes.length === 0) return { ok: true, key: spec.key, routes: [] };
  for (const route of request.routes) {
    if (route.kind === "inherit") continue;
    const { provider, model, effort } = route;
    const providerEntry = catalogue.providers.find((entry) => entry.provider === provider);
    if (providerEntry === undefined) {
      return {
        ok: false,
        reason: `provider ${JSON.stringify(provider)} is not in the live model directory`,
      };
    }
    if (providerEntry.error !== undefined) {
      return {
        ok: false,
        reason: `provider ${JSON.stringify(provider)} failed discovery: ${providerEntry.error}`,
      };
    }
    const modelEntry = providerEntry.models.find((entry) => entry.id === model);
    if (modelEntry === undefined) {
      return {
        ok: false,
        reason: `provider ${JSON.stringify(provider)} does not advertise ${JSON.stringify(model)}`,
      };
    }
    if (modelEntry.error !== undefined) {
      return {
        ok: false,
        reason: `model ${JSON.stringify(`${provider}/${model}`)} failed discovery: ${modelEntry.error}`,
      };
    }
    if (effort !== undefined && !modelEntry.efforts.includes(effort)) {
      return {
        ok: false,
        reason: `model ${JSON.stringify(`${provider}/${model}`)} does not advertise effort ${JSON.stringify(effort)}`,
      };
    }
  }
  return { ok: true, key: spec.key, routes: request.routes };
}

/** A parsed editable document plus the bytes it came from. */
type EditableRoleFile =
  | {
      readonly ok: true;
      readonly current: RoleConfiguration;
      readonly text: string;
      readonly document: RoleFileDocument;
    }
  | { readonly ok: false; readonly result: SaveRoleResult };

/** Read and parse the editable view, reporting the same refusals as a save. */
function readEditableRoleFile(path: string, replacingRole?: string): EditableRoleFile {
  const current = readRoleConfiguration(path);
  if (current.status === "unreadable") {
    return {
      ok: false,
      result: { ok: false, reason: `the role file is unreadable: ${current.reason}` },
    };
  }
  if (current.status === "missing") {
    return { ok: true, current, text: "", document: emptyRoleDocument() };
  }
  try {
    const text = readFileSync(path, "utf8");
    return { ok: true, current, text, document: parseRoleDocument(text, replacingRole) };
  } catch (error) {
    return {
      ok: false,
      result: { ok: false, reason: `the role file could not be edited: ${describeError(error)}` },
    };
  }
}

/** Save one role and return the reloaded snapshot. */
export async function saveRoleConfiguration(
  path: string,
  request: SaveRoleRequest,
  llm: LlmRuntime,
  signal: AbortSignal,
): Promise<SaveRoleResult> {
  signal.throwIfAborted();
  const initial = readRoleConfiguration(path);
  if (initial.status === "unreadable") {
    return { ok: false, reason: `the role file is unreadable: ${initial.reason}` };
  }

  let validation: ReturnType<typeof validateSaveRequest>;
  if (request.routes.length === 0 || request.routes.every((route) => route.kind === "inherit")) {
    validation = validateSaveRequest(request, EMPTY_CATALOGUE);
  } else {
    let catalogue: Awaited<ReturnType<typeof collectCatalogue>>;
    try {
      catalogue = await collectCatalogue(llm, undefined, signal);
    } catch (error) {
      signal.throwIfAborted();
      return {
        ok: false,
        reason: `the model catalogue could not be loaded: ${describeError(error)}`,
      };
    }
    signal.throwIfAborted();
    validation = validateSaveRequest(request, catalogue);
  }
  if (!validation.ok) return validation;
  const key = validation.key;
  const nextRoutes = validation.routes;

  // Re-read after the catalogue await so a concurrent writer is not clobbered.
  const editable = readEditableRoleFile(path, key);
  if (!editable.ok) return editable.result;
  const current = editable.current;
  if (current.status === "missing" && nextRoutes.length === 0) {
    return { ok: true, snapshot: snapshotFromConfiguration(current) };
  }
  const { text, document } = editable;

  const roles = { ...document.roles };
  if (nextRoutes.length > 0) roles[key] = [...nextRoutes];
  const updated: RoleFileDocument = {
    version: ROLE_FILE_VERSION,
    ...(document.budget === undefined ? {} : { budget: document.budget }),
    roles,
  };
  const next = serializeRoleDocument(updated);
  if (current.status === "loaded" && next === text) {
    return { ok: true, snapshot: snapshotFromConfiguration(current) };
  }

  try {
    writeRoleDocument(path, updated);
  } catch (error) {
    return { ok: false, reason: `the role file could not be written: ${describeError(error)}` };
  }
  return { ok: true, snapshot: snapshotFromConfiguration(parseRoleConfiguration(next, path)) };
}

/** Apply one global budget target to the role file in a single atomic write. */
export async function saveBudgetConfiguration(
  path: string,
  request: BudgetApplyRequest,
  llm: LlmRuntime,
  signal: AbortSignal,
): Promise<BudgetApplyResult> {
  signal.throwIfAborted();
  const initial = readRoleConfiguration(path);
  if (initial.status === "unreadable") {
    return { ok: false, reason: `the role file is unreadable: ${initial.reason}` };
  }

  let catalogue: Awaited<ReturnType<typeof collectCatalogue>>;
  try {
    catalogue = await collectCatalogue(llm, undefined, signal);
  } catch (error) {
    signal.throwIfAborted();
    return {
      ok: false,
      reason: `the model catalogue could not be loaded: ${describeError(error)}`,
    };
  }
  signal.throwIfAborted();

  const editable = readEditableRoleFile(path);
  if (!editable.ok) return editable.result;
  const current = editable.current;
  const { text, document } = editable;

  try {
    const inputs = ROLE_MANIFEST.map((spec) => {
      const entry = current.status === "loaded" ? current.roles.get(spec.key) : undefined;
      return {
        key: spec.key,
        configured: entry !== undefined,
        routes: entry?.routes ?? [{ kind: "inherit" as const, alias: "inherit-parent" as const }],
        hasIssues: (entry?.issues.length ?? 0) > 0,
      };
    });
    const plan = planBudget(inputs, catalogue, request);
    const blocked = plan.rows.filter(isBudgetRowBlocked);
    if (blocked.length > 0) {
      return {
        ok: false,
        reason: `the budget needs attention for: ${blocked.map((row) => row.key).join(", ")}`,
      };
    }

    const roles = { ...document.roles };
    for (const row of plan.rows) {
      if (row.status === "skipped") continue;
      if (routesEqual(row.routes, row.previous)) continue;
      for (const key of Object.keys(roles)) {
        if (findRole(key)?.key === row.key) delete roles[key];
      }
      if (row.routes.length > 0) roles[row.key] = [...row.routes];
    }
    const updated: RoleFileDocument = { version: ROLE_FILE_VERSION, budget: plan.budget, roles };
    const next = serializeRoleDocument(updated);
    if (current.status === "loaded" && next === text) {
      return { ok: true, snapshot: snapshotFromConfiguration(current) };
    }
    writeRoleDocument(path, updated);
    return { ok: true, snapshot: snapshotFromConfiguration(parseRoleConfiguration(next, path)) };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  }
}
