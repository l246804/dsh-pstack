/** Budget planning and wire parsing for global reasoning targets. */

import type { CatalogueResult, ModelEntry } from "../models/catalogue.ts";
import type { Route } from "./route.ts";
import { WireTypeError } from "../lib/wire-error.ts";

export const BUDGET_TIERS = ["large", "medium", "small"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

/** Upstream caps every role at xhigh, so no budget target is above it. */
export const BUDGET_TARGETS: Record<BudgetTier, string> = {
  large: "xhigh",
  medium: "high",
  small: "medium",
};

/** Retired tier labels still found in older role files, remapped to the current tier. */
const LEGACY_BUDGET_TIERS: Record<string, BudgetTier> = { unlimited: "large" };

const EFFORT_LADDER = ["off", "low", "medium", "high", "xhigh", "max"] as const;

export type BudgetScope = "concrete" | "unconfigured";

export type BudgetPlanErrorCode =
  | "no-default-model"
  | "provider-not-found"
  | "provider-discovery"
  | "model-not-found"
  | "model-discovery";

export class BudgetPlanError extends Error {
  constructor(
    readonly code: BudgetPlanErrorCode,
    readonly detail?: string,
  ) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "BudgetPlanError";
  }
}

export interface BudgetModelChoice {
  readonly provider: string;
  readonly model: string;
}

export interface BudgetApplyRequest {
  readonly tier: BudgetTier;
  readonly scope: BudgetScope;
  readonly defaultModel?: BudgetModelChoice;
}

export interface BudgetRoleInput {
  readonly key: string;
  readonly configured: boolean;
  readonly routes: readonly Route[];
  /** The role line carries parse issues; the plan must not rewrite it. */
  readonly hasIssues?: boolean;
}

export type BudgetRowStatus =
  | "changed"
  | "unchanged"
  | "fallback"
  | "needs-choice"
  | "custom"
  | "unsupported"
  | "skipped";

export type BudgetDetail =
  | { readonly kind: "fallback"; readonly effort: string }
  | { readonly kind: "needs-choice" }
  | { readonly kind: "custom" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "missing-model"; readonly provider: string; readonly model: string };

export interface BudgetRolePlan {
  readonly key: string;
  readonly status: BudgetRowStatus;
  readonly previous: readonly Route[];
  readonly routes: readonly Route[];
  readonly detail?: BudgetDetail;
}

export interface BudgetPlan {
  readonly tier: BudgetTier;
  readonly budget: string;
  readonly rows: readonly BudgetRolePlan[];
}

/** Read a tier from a stored budget value such as `large (xhigh)`. */
export function budgetTierFromLabel(raw: string | undefined): BudgetTier | undefined {
  if (raw === undefined) return undefined;
  const match = /^\s*(unlimited|large|medium|small)\b/i.exec(raw);
  const token = match?.[1]?.toLowerCase();
  if (token === undefined) return undefined;
  return LEGACY_BUDGET_TIERS[token] ?? (token as BudgetTier);
}

/** Normalize a stored budget label, mapping the retired `unlimited` tier to `large`. */
export function normalizeBudgetValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const tier = budgetTierFromLabel(raw);
  return tier === undefined ? raw : budgetValueFor(tier);
}

/** Render the persisted budget value, such as `large (xhigh)`. */
export function budgetValueFor(tier: BudgetTier): string {
  return `${tier} (${BUDGET_TARGETS[tier]})`;
}

/** Parse and validate a budget apply request at the wire boundary. */
export function parseBudgetApplyRequest(value: unknown): BudgetApplyRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WireTypeError("request", "an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record["tier"] !== "string" || !BUDGET_TIERS.includes(record["tier"] as BudgetTier)) {
    throw new WireTypeError("request.tier", `one of ${BUDGET_TIERS.join(", ")}`);
  }
  if (record["scope"] !== "concrete" && record["scope"] !== "unconfigured") {
    throw new WireTypeError("request.scope", '"concrete" or "unconfigured"');
  }
  const rawModel = record["defaultModel"];
  let defaultModel: BudgetModelChoice | undefined;
  if (rawModel !== undefined) {
    if (typeof rawModel !== "object" || rawModel === null || Array.isArray(rawModel)) {
      throw new WireTypeError("request.defaultModel", "an object when present");
    }
    const model = rawModel as Record<string, unknown>;
    if (typeof model["provider"] !== "string" || model["provider"].trim() === "") {
      throw new WireTypeError("request.defaultModel.provider", "a non-empty string");
    }
    if (typeof model["model"] !== "string" || model["model"].trim() === "") {
      throw new WireTypeError("request.defaultModel.model", "a non-empty string");
    }
    defaultModel = { provider: model["provider"].trim(), model: model["model"].trim() };
  }
  if (record["scope"] === "unconfigured" && defaultModel === undefined) {
    throw new WireTypeError("request.defaultModel", "required for the unconfigured scope");
  }
  return {
    tier: record["tier"] as BudgetTier,
    scope: record["scope"],
    ...(defaultModel === undefined ? {} : { defaultModel }),
  };
}

/** Whether a plan row must be fixed before a budget can be applied. */
export function isBudgetRowBlocked(row: BudgetRolePlan): boolean {
  return row.status === "needs-choice" || row.detail?.kind === "missing-model";
}

/** Plan every role change without touching the filesystem. */
export function planBudget(
  roles: readonly BudgetRoleInput[],
  catalogue: CatalogueResult,
  request: BudgetApplyRequest,
): BudgetPlan {
  const defaultModel =
    request.scope === "unconfigured"
      ? resolveDefaultModel(catalogue, request.defaultModel)
      : undefined;
  const rows = roles.map((role) => planRole(role, request, defaultModel, catalogue));
  return {
    tier: request.tier,
    budget: budgetValueFor(request.tier),
    rows,
  };
}

function planRole(
  role: BudgetRoleInput,
  request: BudgetApplyRequest,
  defaultModel: ModelEntry | undefined,
  catalogue: CatalogueResult,
): BudgetRolePlan {
  const previous = role.routes;
  if (role.hasIssues === true) {
    return { key: role.key, status: "skipped", previous, routes: previous };
  }
  if (!role.configured) {
    if (request.scope !== "unconfigured" || defaultModel === undefined) {
      return { key: role.key, status: "skipped", previous, routes: previous };
    }
    const effort = effortFor(defaultModel, request.tier);
    return {
      key: role.key,
      status: statusForNew(effort),
      previous,
      routes: [routeFor(defaultModel, effort.effort)],
      ...(effort.detail === undefined ? {} : { detail: effort.detail }),
    };
  }
  if (request.scope !== "concrete") {
    return { key: role.key, status: "skipped", previous, routes: previous };
  }
  if (previous.every((route) => route.kind === "inherit")) {
    return { key: role.key, status: "skipped", previous, routes: previous };
  }

  let aggregate: BudgetRowStatus = "unchanged";
  let detail: BudgetDetail | undefined;
  const routes = previous.map((route) => {
    if (route.kind === "inherit") return route;
    const model = findCatalogueModel(catalogue, route.provider, route.model);
    if (model === undefined) {
      aggregate = mergeStatus(aggregate, "custom");
      detail = preferDetail(detail, {
        kind: "missing-model",
        provider: route.provider,
        model: route.model,
      });
      return route;
    }
    const effort = effortFor(model, request.tier);
    aggregate = mergeStatus(aggregate, statusForExisting(effort, route));
    detail = preferDetail(detail, effort.detail);
    if (effort.effort === undefined) return route;
    return { ...route, effort: effort.effort };
  });
  return {
    key: role.key,
    status: aggregate,
    previous,
    routes,
    ...(detail === undefined ? {} : { detail }),
  };
}

function statusForNew(effort: EffortResolution): BudgetRowStatus {
  if (effort.status === "exact") return "changed";
  if (effort.status === "fallback") return "fallback";
  return effort.status;
}

function statusForExisting(
  effort: EffortResolution,
  route: Extract<Route, { kind: "route" }>,
): BudgetRowStatus {
  if (effort.status === "exact" && route.effort === effort.effort) return "unchanged";
  if (effort.status === "exact") return "changed";
  if (effort.status === "fallback") return "fallback";
  return effort.status;
}

function mergeStatus(left: BudgetRowStatus, right: BudgetRowStatus): BudgetRowStatus {
  const order: Record<BudgetRowStatus, number> = {
    unchanged: 0,
    changed: 1,
    fallback: 2,
    unsupported: 3,
    custom: 4,
    "needs-choice": 5,
    skipped: 6,
  };
  return order[right] > order[left] ? right : left;
}

function preferDetail(
  current: BudgetDetail | undefined,
  next: BudgetDetail | undefined,
): BudgetDetail | undefined {
  if (next === undefined) return current;
  if (current === undefined) return next;
  const order: Record<BudgetDetail["kind"], number> = {
    fallback: 0,
    custom: 1,
    unsupported: 2,
    "needs-choice": 3,
    "missing-model": 4,
  };
  return order[next.kind] > order[current.kind] ? next : current;
}

interface EffortResolution {
  readonly effort?: string;
  readonly status: "exact" | "fallback" | "needs-choice" | "custom" | "unsupported";
  readonly detail?: BudgetDetail;
}

function effortFor(model: ModelEntry, tier: BudgetTier): EffortResolution {
  if (model.efforts.length === 0) {
    return { status: "unsupported", detail: { kind: "unsupported" } };
  }
  const target = BUDGET_TARGETS[tier];
  if (model.efforts.includes(target)) return { status: "exact", effort: target };
  const targetIndex = EFFORT_LADDER.indexOf(target as (typeof EFFORT_LADDER)[number]);
  const known = model.efforts
    .map((effort) => ({
      effort,
      index: EFFORT_LADDER.indexOf(effort as (typeof EFFORT_LADDER)[number]),
    }))
    .filter((entry) => entry.index >= 0);
  if (known.length === 0) {
    return { status: "custom", detail: { kind: "custom" } };
  }
  const lower = known
    .filter((entry) => entry.index <= targetIndex)
    .sort((left, right) => right.index - left.index);
  if (lower[0] !== undefined) {
    return {
      status: "fallback",
      effort: lower[0].effort,
      detail: { kind: "fallback", effort: lower[0].effort },
    };
  }
  return { status: "needs-choice", detail: { kind: "needs-choice" } };
}

function resolveDefaultModel(
  catalogue: CatalogueResult,
  choice: BudgetModelChoice | undefined,
): ModelEntry {
  if (choice === undefined) throw new BudgetPlanError("no-default-model");
  const provider = catalogue.providers.find((entry) => entry.provider === choice.provider);
  if (provider === undefined) throw new BudgetPlanError("provider-not-found", choice.provider);
  if (provider.error !== undefined)
    throw new BudgetPlanError("provider-discovery", choice.provider);
  const model = provider.models.find((entry) => entry.id === choice.model);
  if (model === undefined)
    throw new BudgetPlanError("model-not-found", `${choice.provider}/${choice.model}`);
  if (model.error !== undefined)
    throw new BudgetPlanError("model-discovery", `${choice.provider}/${choice.model}`);
  return model;
}

function findCatalogueModel(
  catalogue: CatalogueResult,
  providerId: string,
  modelId: string,
): ModelEntry | undefined {
  const provider = catalogue.providers.find((entry) => entry.provider === providerId);
  if (provider === undefined || provider.error !== undefined) return undefined;
  const model = provider.models.find((entry) => entry.id === modelId);
  if (model === undefined || model.error !== undefined) return undefined;
  return model;
}

function routeFor(model: ModelEntry, effort: string | undefined): Route {
  return {
    kind: "route",
    provider: model.provider,
    model: model.id,
    ...(effort === undefined ? {} : { effort }),
  };
}
