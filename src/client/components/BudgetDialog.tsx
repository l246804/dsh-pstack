/** Nested budget modal for the role settings page: preview a plan and apply it to the role file. */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type RefObject,
} from "react";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";

import type { CatalogueResult } from "../../models.ts";
import {
  BUDGET_TIERS,
  BudgetPlanError,
  budgetTierFromLabel,
  budgetValueFor,
  isBudgetRowBlocked,
  planBudget,
  type BudgetApplyRequest,
  type BudgetRolePlan,
  type BudgetTier,
} from "../../roles/budget.ts";
import type { BudgetApplyResult, RoleFileSnapshot } from "../../roles/role-wire.ts";
import { routesEqual, type Route } from "../../roles/route.ts";
import { messageOf } from "../lib/message.ts";
import { roleLabel } from "../roles/role-copy.ts";
import { providerIsUsable, providerIssue, providerLabel } from "../roles/role-selectors.ts";
import { Button, Spinner, Status, type StatusTone } from "./ui.tsx";
import { IconCheckCircle } from "./icons.tsx";
import type { PstackTranslations, RolesKey } from "../locales/index.ts";

export interface BudgetDialogProps {
  readonly snapshot: RoleFileSnapshot;
  readonly catalogue: CatalogueResult;
  readonly translations: PstackTranslations;
  readonly onApply: (
    request: BudgetApplyRequest,
    signal?: AbortSignal,
  ) => Promise<BudgetApplyResult>;
  readonly onApplied: (snapshot: RoleFileSnapshot) => void;
  readonly onClose: () => void;
  readonly signal?: AbortSignal;
  /** The control that opened the dialog, focused again when it closes. */
  readonly triggerRef?: RefObject<HTMLElement | null>;
}

/** Optional tier labels, keyed by the raw tier; an unknown tier falls back to its name. */
const TIER_LABEL: Partial<Record<string, RolesKey>> = {
  large: "budgetTierLarge",
  medium: "budgetTierMedium",
  small: "budgetTierSmall",
};

function isBudgetScope(value: string): value is "concrete" | "unconfigured" {
  return value === "concrete" || value === "unconfigured";
}

function isBudgetTier(value: string): value is BudgetTier {
  return (BUDGET_TIERS as readonly string[]).includes(value);
}

function tierLabel(tier: string, t: PstackTranslations["roles"]): string {
  const key = TIER_LABEL[tier];
  return key === undefined ? tier : t(key);
}

export function BudgetDialog(props: BudgetDialogProps): ReactElement | null {
  const { snapshot, catalogue, translations, onApply, onApplied, onClose, signal, triggerRef } =
    props;
  const t = translations.roles;
  const providers = catalogue.providers;
  const usableProviders = providers.filter(providerIsUsable);
  const initialProvider = usableProviders[0];
  const [scope, setScope] = useState<"concrete" | "unconfigured">("concrete");
  const [tier, setTier] = useState<BudgetTier>(
    () => budgetTierFromLabel(snapshot.budget) ?? "large",
  );
  const [providerId, setProviderId] = useState(initialProvider?.provider ?? "");
  const activeProvider =
    usableProviders.find((provider) => provider.provider === providerId) ?? initialProvider;
  const models = activeProvider?.models.filter((model) => model.error === undefined) ?? [];
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const activeModel = models.find((model) => model.id === modelId) ?? models[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const requestClose = useCallback((): void => {
    if (!busy) onClose();
  }, [busy, onClose]);

  useEffect(() => {
    return () => {
      triggerRef?.current?.focus();
    };
  }, [triggerRef]);

  const request: BudgetApplyRequest = {
    tier,
    scope,
    ...(scope === "unconfigured" && activeProvider !== undefined && activeModel !== undefined
      ? { defaultModel: { provider: activeProvider.provider, model: activeModel.id } }
      : {}),
  };

  const plan = useMemo(() => {
    try {
      return {
        plan: planBudget(
          snapshot.roles.map((role) => ({
            key: role.key,
            configured: role.configured,
            routes: role.routes,
            hasIssues: role.issues.length > 0,
          })),
          catalogue,
          request,
        ),
        error: undefined,
      };
    } catch (reason) {
      return { plan: undefined, error: budgetPlanErrorText(reason, t) };
    }
  }, [
    snapshot.roles,
    catalogue,
    request.tier,
    request.scope,
    request.defaultModel?.provider,
    request.defaultModel?.model,
  ]);

  const visibleRows = plan.plan?.rows.filter((row) => row.status !== "skipped") ?? [];
  const blocked = plan.plan?.rows.some(isBudgetRowBlocked) ?? false;
  const routeChanged =
    plan.plan?.rows.some(
      (row) => row.status !== "skipped" && !routesEqual(row.routes, row.previous),
    ) ?? false;
  const budgetChanged =
    plan.plan !== undefined && snapshot.budget !== budgetValueFor(plan.plan.tier);
  const canApply = plan.error === undefined && !blocked && (routeChanged || budgetChanged) && !busy;

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await onApply(request, signal);
      if (result.ok) onApplied(result.snapshot);
      else setError(t("budgetFailed", { reason: result.reason }));
    } catch (reason) {
      setError(t("budgetFailed", { reason: messageOf(reason) }));
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined") return null;
  return (
    <Modal
      open
      title={t("budgetTitle")}
      description={t("budgetCurrent", { budget: budgetLabel(snapshot.budget, t) })}
      closeLabel={translations.common("close")}
      onClose={requestClose}
      className="pstack-budget-panel"
      contentClassName="pstack-budget-content"
    >
      <div className="pstack-budget-body">
        <div className="pstack-budget-top">
          <div className="pstack-budget-form">
            <label className="pstack-field">
              <span className="pstack-field-label">{t("budgetScope")}</span>
              <select
                className="pstack-select"
                value={scope}
                disabled={busy}
                onChange={(event) => {
                  if (isBudgetScope(event.target.value)) setScope(event.target.value);
                }}
              >
                <option value="concrete">{t("budgetScopeConcrete")}</option>
                <option value="unconfigured">{t("budgetScopeUnconfigured")}</option>
              </select>
            </label>
            <label className="pstack-field">
              <span className="pstack-field-label">{t("budgetTier")}</span>
              <select
                className="pstack-select"
                value={tier}
                disabled={busy}
                onChange={(event) => {
                  if (isBudgetTier(event.target.value)) setTier(event.target.value);
                }}
              >
                {BUDGET_TIERS.map((value) => (
                  <option key={value} value={value}>
                    {tierLabel(value, t)}
                  </option>
                ))}
              </select>
            </label>
            {scope === "unconfigured" ? (
              <>
                <label className="pstack-field">
                  <span className="pstack-field-label">{t("budgetProvider")}</span>
                  <select
                    className="pstack-select"
                    value={activeProvider?.provider ?? ""}
                    disabled={busy || usableProviders.length === 0}
                    onChange={(event) => {
                      const next = usableProviders.find(
                        (provider) => provider.provider === event.target.value,
                      );
                      setProviderId(next?.provider ?? "");
                      setModelId(next?.models.find((model) => model.error === undefined)?.id ?? "");
                    }}
                  >
                    {usableProviders.length === 0 ? (
                      <option value="">{t("budgetNoProvider")}</option>
                    ) : null}
                    {providers.map((provider) => {
                      const issue = providerIssue(provider);
                      return (
                        <option
                          key={provider.provider}
                          value={provider.provider}
                          disabled={issue !== undefined}
                          title={provider.error}
                        >
                          {providerLabel(providers, provider.provider)}
                          {issue === undefined
                            ? null
                            : ` (${t(issue === "unavailable" ? "providerUnavailable" : "noModels")})`}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="pstack-field">
                  <span className="pstack-field-label">{t("budgetModel")}</span>
                  <select
                    className="pstack-select"
                    value={activeModel?.id ?? ""}
                    disabled={busy || models.length === 0}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    {models.length === 0 ? <option value="">{t("noModels")}</option> : null}
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.id}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
          </div>
          <div className="pstack-budget-apply">
            <Button
              variant="primary"
              size="sm"
              icon={busy ? <Spinner size={13} /> : <IconCheckCircle size={13} />}
              disabled={!canApply}
              onClick={() => void apply()}
            >
              {busy ? t("budgetApplying") : t("budgetApply")}
            </Button>
          </div>
        </div>
        {plan.error === undefined ? null : (
          <div className="pstack-notice" data-tone="error">
            {plan.error}
          </div>
        )}
        <div className="pstack-budget-scroll">
          {visibleRows.length === 0 ? null : (
            <div className="pstack-budget-preview">
              <h5 className="pstack-budget-preview-title">{t("budgetPreview")}</h5>
              <div className="pstack-budget-list">
                {visibleRows.map((row) => (
                  <article className="pstack-budget-card" data-status={row.status} key={row.key}>
                    <header className="pstack-budget-card-head">
                      <span className="pstack-budget-role">{roleLabel(row.key, t)}</span>
                      <Status tone={statusTone(row.status)} label={statusText(row, t)} compact />
                    </header>
                    <div className="pstack-budget-route-grid">
                      <div className="pstack-budget-route-block">
                        <span className="pstack-budget-route-label">{t("budgetCurrentRoute")}</span>
                        <div className="pstack-budget-route-chips">
                          {routeTokens(row.previous, t)}
                        </div>
                      </div>
                      <div className="pstack-budget-route-block">
                        <span className="pstack-budget-route-label">{t("budgetTargetRoute")}</span>
                        <div className="pstack-budget-route-chips">
                          {routeTokens(row.routes, t)}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {error === undefined ? null : (
            <div className="pstack-notice" data-tone="error">
              {error}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function budgetLabel(raw: string | undefined, t: PstackTranslations["roles"]): string {
  const tier = budgetTierFromLabel(raw);
  if (tier === undefined) return raw ?? t("budgetUnset");
  return tierLabel(tier, t);
}

function budgetPlanErrorText(reason: unknown, t: PstackTranslations["roles"]): string {
  if (reason instanceof BudgetPlanError) {
    switch (reason.code) {
      case "no-default-model":
        return t("budgetNoProvider");
      case "provider-not-found":
      case "provider-discovery":
        return t("budgetErrorProvider", { provider: reason.detail ?? "" });
      case "model-not-found":
      case "model-discovery":
        return t("budgetErrorModel", { model: reason.detail ?? "" });
    }
  }
  return messageOf(reason);
}

/** Display-only join for a route chip; the structured value is never re-parsed. */
function formatRoute(route: Route): string {
  if (route.kind === "inherit") return route.alias;
  return route.effort === undefined
    ? `${route.provider}/${route.model}`
    : `${route.provider}/${route.model} [${route.effort}]`;
}

function routeTokens(routes: readonly Route[], t: PstackTranslations["roles"]): ReactElement[] {
  const list =
    routes.length === 0 ? [{ kind: "inherit" as const, alias: "inherit-parent" as const }] : routes;
  return list.map((route, index) => (
    <code className="pstack-budget-route-chip" key={`${index}-${formatRoute(route)}`}>
      {route.kind === "inherit"
        ? route.alias === "auto"
          ? t("auto")
          : t("inheritParent")
        : formatRoute(route)}
    </code>
  ));
}

function statusTone(status: BudgetRolePlan["status"]): StatusTone {
  switch (status) {
    case "changed":
      return "brand";
    case "unchanged":
      return "success";
    case "fallback":
    case "unsupported":
      return "warn";
    case "needs-choice":
    case "custom":
      return "error";
    case "skipped":
      return "neutral";
  }
}

function statusText(row: BudgetRolePlan, t: PstackTranslations["roles"]): string {
  switch (row.status) {
    case "changed":
      return t("budgetStatusChanged");
    case "unchanged":
      return t("budgetStatusUnchanged");
    case "fallback":
      return t("budgetStatusFallback", {
        effort: row.detail?.kind === "fallback" ? row.detail.effort : "",
      });
    case "needs-choice":
      return t("budgetStatusNeedsChoice");
    case "custom":
      return row.detail?.kind === "missing-model"
        ? t("budgetStatusMissingModel", {
            model: `${row.detail.provider}/${row.detail.model}`,
          })
        : t("budgetStatusCustom");
    case "unsupported":
      return t("budgetStatusUnsupported");
    case "skipped":
      return t("budgetStatusSkipped");
  }
}
