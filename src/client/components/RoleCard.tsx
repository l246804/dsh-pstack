/** One role card and its route rows in the role settings page. */

import type { ReactElement } from "react";
import { Tag } from "@deepseek-ai/dsh-client-ui-primitives";

import type { CatalogueResult } from "../../models.ts";
import type { RoleView, RouteView } from "../../roles/role-wire.ts";
import {
  IconAlert,
  IconCheck,
  IconEraser,
  IconPlus,
  IconRoute,
  IconSave,
  IconTrash,
  IconUndo,
} from "./icons.tsx";
import { roleDescription, roleLabel } from "../roles/role-copy.ts";
import { isClearDraft, isDirty, type RoleDraft } from "../roles/role-draft.ts";
import {
  effortChoices,
  modelChoices,
  providerIssue,
  providerLabel,
  routeIsIncomplete,
  routeIsInvalid,
} from "../roles/role-selectors.ts";
import { Button, IconButton, Spinner, Status, type StatusTone } from "./ui.tsx";
import type { PstackTranslations } from "../locales/index.ts";

export function RoleCard(props: {
  role: RoleView;
  draft: RoleDraft;
  catalogue: CatalogueResult | undefined;
  translations: PstackTranslations;
  disabled: boolean;
  onRoutesChange: (routes: RouteView[]) => void;
  onClear: () => void;
  onSave: () => void;
  onReset: () => void;
}): ReactElement {
  const {
    role,
    draft,
    catalogue,
    translations,
    disabled,
    onRoutesChange,
    onClear,
    onSave,
    onReset,
  } = props;
  const t = translations.roles;
  const common = translations.common;
  const name = roleLabel(role.key, t);
  const description = roleDescription(role.key, t);
  const dirty = isDirty(draft, role);
  const controlsDisabled = disabled || draft.busy;
  const incomplete = draft.routes.some(routeIsIncomplete);
  const invalid = draft.routes.some((route) => routeIsInvalid(route, catalogue));
  const routeProblem = incomplete || invalid;
  const clearing = isClearDraft(draft, role);
  const canClearRole = !clearing && (role.configured || dirty);
  const status =
    role.issues.length > 0
      ? { tone: "error" as StatusTone, label: t("roleInvalid") }
      : routeProblem
        ? { tone: "error" as StatusTone, label: t("routeInvalid") }
        : role.configured
          ? { tone: "success" as StatusTone, label: t("roleConfigured") }
          : { tone: "neutral" as StatusTone, label: t("roleMissing") };
  return (
    <section className="pstack-role-card" data-dirty={dirty ? "true" : undefined}>
      <header className="pstack-role-head">
        <span className="pstack-role-glyph">
          <IconRoute size={16} />
        </span>
        <div className="pstack-role-title">
          <div className="pstack-role-name-row">
            <h4 className="pstack-role-name">{name}</h4>
            <code className="pstack-code-chip">{role.key}</code>
            <span title={role.shape === "single" ? t("singleRouteHint") : undefined}>
              <Tag tone="neutral">
                {role.shape === "single" ? t("singleRoute") : t("listRoute")}
              </Tag>
            </span>
          </div>
          {description === "" ? null : <p className="pstack-role-desc">{description}</p>}
        </div>
        <div className="pstack-role-status">
          <Status tone={status.tone} label={status.label} compact />
        </div>
      </header>
      {role.issues.length === 0 ? null : (
        <div className="pstack-notice" data-tone="error" style={{ margin: 0 }}>
          <IconAlert size={14} />
          <ul className="pstack-notice-list">
            {role.issues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {routeProblem ? (
        <div className="pstack-notice" data-tone="error" style={{ margin: 0 }}>
          <IconAlert size={14} />
          <span>{incomplete ? t("routeIncompleteHint") : t("routeInvalidHint")}</span>
        </div>
      ) : null}
      <div className="pstack-route-list">
        {draft.routes.map((route, index) => (
          <RouteRow
            key={`${role.key}-${index}`}
            roleName={name}
            route={route}
            catalogue={catalogue}
            disabled={controlsDisabled}
            canRemove={role.shape === "list" && draft.routes.length > 1}
            onChange={(next) =>
              onRoutesChange(
                draft.routes.map((item, position) => (position === index ? next : item)),
              )
            }
            onRemove={() =>
              onRoutesChange(draft.routes.filter((_item, position) => position !== index))
            }
            translations={translations}
          />
        ))}
        {clearing ? <p className="pstack-role-desc">{t("clearHint")}</p> : null}
      </div>
      <footer className="pstack-role-foot">
        <div className="pstack-role-foot-actions">
          {role.shape === "list" ? (
            <Button
              variant="outline"
              size="sm"
              icon={<IconPlus size={13} />}
              disabled={controlsDisabled}
              onClick={() =>
                onRoutesChange([...draft.routes, { kind: "inherit", alias: "inherit-parent" }])
              }
            >
              {t("addRoute")}
            </Button>
          ) : null}
        </div>
        <div className="pstack-role-save">
          {draft.message === undefined ? (
            dirty ? (
              <Status tone="warn" label={t("unsavedChanges")} />
            ) : null
          ) : (
            <span className="pstack-inline-message" data-tone={draft.message.tone}>
              {draft.message.tone === "success" ? <IconCheck size={12} /> : <IconAlert size={12} />}
              {draft.message.text}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            icon={<IconEraser size={13} />}
            disabled={controlsDisabled || !canClearRole}
            onClick={onClear}
          >
            {t("clearRole")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<IconUndo size={13} />}
            disabled={controlsDisabled || !dirty}
            onClick={onReset}
          >
            {t("resetRole")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={draft.busy ? <Spinner size={13} /> : <IconSave size={13} />}
            disabled={controlsDisabled || !dirty || incomplete || invalid}
            onClick={onSave}
          >
            {draft.busy ? common("saving") : common("save")}
          </Button>
        </div>
      </footer>
    </section>
  );
}

function RouteRow(props: {
  roleName: string;
  route: RouteView;
  catalogue: CatalogueResult | undefined;
  disabled: boolean;
  canRemove: boolean;
  onChange: (route: RouteView) => void;
  onRemove: () => void;
  translations: PstackTranslations;
}): ReactElement {
  const { roleName, route, catalogue, disabled, canRemove, onChange, onRemove, translations } =
    props;
  const t = translations.roles;
  const providerValue = route.kind === "inherit" ? `__inherit__:${route.alias}` : route.provider;
  const providers = catalogue?.providers ?? [];
  const models = route.kind === "route" ? modelChoices(catalogue, route.provider) : [];
  const efforts =
    route.kind === "route" ? effortChoices(catalogue, route.provider, route.model) : [];
  const effortOptions =
    route.kind === "route" && route.effort !== undefined && !efforts.includes(route.effort)
      ? [route.effort, ...efforts]
      : efforts;
  const layout =
    route.kind === "route"
      ? canRemove
        ? "route-actions"
        : "route"
      : canRemove
        ? "inherit-actions"
        : "inherit";
  return (
    <div className="pstack-route-row" data-layout={layout}>
      <label className="pstack-field">
        <span className="pstack-field-label">{t("provider")}</span>
        <select
          className="pstack-select"
          aria-label={`${roleName} ${t("provider")}`}
          value={providerValue}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "__inherit__:inherit-parent" || value === "__inherit__:auto") {
              onChange({
                kind: "inherit",
                alias: value.endsWith("auto") ? "auto" : "inherit-parent",
              });
              return;
            }
            const model = modelChoices(catalogue, value).find((entry) => entry.error === undefined);
            onChange({
              kind: "route",
              provider: value,
              model: model?.id ?? "",
              ...(model?.defaultEffort === undefined ? {} : { effort: model.defaultEffort }),
            });
          }}
        >
          <option value="__inherit__:inherit-parent">{t("inheritParent")}</option>
          <option value="__inherit__:auto">{t("auto")}</option>
          {route.kind === "route" &&
          route.provider !== "" &&
          providers.every((provider) => provider.provider !== route.provider) ? (
            <option value={route.provider}>{route.provider}</option>
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
      {route.kind === "route" ? (
        <>
          <label className="pstack-field">
            <span className="pstack-field-label">{t("model")}</span>
            <select
              className="pstack-select"
              aria-label={`${roleName} ${t("model")}`}
              value={route.model}
              disabled={disabled}
              onChange={(event) => {
                const model = models.find((entry) => entry.id === event.target.value);
                onChange({
                  kind: "route",
                  provider: route.provider,
                  model: event.target.value,
                  ...(model?.defaultEffort === undefined ? {} : { effort: model.defaultEffort }),
                });
              }}
            >
              {models.length === 0 ? (
                <option value="" disabled>
                  {t("noModels")}
                </option>
              ) : null}
              {route.kind === "route" &&
              route.model !== "" &&
              models.every((model) => model.id !== route.model) ? (
                <option value={route.model}>{route.model}</option>
              ) : null}
              {models.map((model) => (
                <option key={model.id} value={model.id} disabled={model.error !== undefined}>
                  {model.id}
                </option>
              ))}
            </select>
          </label>
          <label className="pstack-field">
            <span className="pstack-field-label">{t("effort")}</span>
            <select
              className="pstack-select"
              aria-label={`${roleName} ${t("effort")}`}
              value={route.effort ?? ""}
              disabled={disabled}
              onChange={(event) => {
                const effort = event.target.value;
                onChange({
                  kind: "route",
                  provider: route.provider,
                  model: route.model,
                  ...(effort === "" ? {} : { effort }),
                });
              }}
            >
              <option value="">{t("effortUnset")}</option>
              {effortOptions.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      {canRemove ? (
        <div className="pstack-route-actions">
          <IconButton
            danger
            label={`${t("removeRoute")} ${roleName}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <IconTrash size={14} />
          </IconButton>
        </div>
      ) : null}
    </div>
  );
}
