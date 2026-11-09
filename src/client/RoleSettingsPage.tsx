/** Role model configuration page for the pstack plugin dialog. */

import { useEffect, useRef, useState, type ReactElement } from "react";

import type { CatalogueResult } from "../models.ts";
import type { BudgetApplyRequest } from "../budget.ts";
import type {
  BudgetApplyResult,
  RoleFileSnapshot,
  RouteView,
  SaveRoleRequest,
  SaveRoleResult,
} from "../role-wire.ts";
import { IconAlert, IconEraser, IconInfo, IconRefresh, IconSave, IconUndo } from "./icons.tsx";
import { BudgetDialog, budgetLabel } from "./BudgetDialog.tsx";
import { messageOf } from "./message.ts";
import { RoleCard } from "./RoleCard.tsx";
import {
  draftOf,
  inheritedRoutes,
  isClearDraft,
  isDirty,
  resetRoutes,
  type DraftMap,
} from "./role-draft.ts";
import { routeIsIncomplete, routeIsInvalid } from "./role-selectors.ts";
import { ensurePstackStyles } from "./styles.ts";
import { Toast, type ToastMessage } from "./toast.tsx";
import { Button, IconButton, Spinner, Status, confirmDiscard, type StatusTone } from "./ui.tsx";
import type { PstackTranslations } from "./locales/index.ts";

ensurePstackStyles();

export interface RoleSettingsApi {
  status(): Promise<RoleFileSnapshot>;
  catalogue(signal?: AbortSignal): Promise<CatalogueResult>;
  save(request: SaveRoleRequest, signal?: AbortSignal): Promise<SaveRoleResult>;
  budget(request: BudgetApplyRequest, signal?: AbortSignal): Promise<BudgetApplyResult>;
}

export function RoleSettingsView(props: {
  api: RoleSettingsApi;
  translations: PstackTranslations;
  onDirtyChange?: (dirty: boolean) => void;
}): ReactElement {
  const { api, translations, onDirtyChange } = props;
  const t = translations.roles;
  const common = translations.common;
  const [snapshot, setSnapshot] = useState<RoleFileSnapshot | undefined>();
  const [catalogue, setCatalogue] = useState<CatalogueResult | undefined>();
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [refreshMessage, setRefreshMessage] = useState<ToastMessage | undefined>();
  const [bulkBusy, setBulkBusy] = useState<"save" | undefined>();
  const [bulkMessage, setBulkMessage] = useState<ToastMessage | undefined>();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => abortRef.current?.abort(), []);

  const applySnapshot = (next: RoleFileSnapshot): void => {
    setSnapshot(next);
    setDrafts(Object.fromEntries(next.roles.map((role) => [role.key, draftOf(role)])));
  };

  const load = async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(undefined);
    setRefreshMessage(undefined);
    setBulkMessage(undefined);
    try {
      const [nextSnapshot, nextCatalogue] = await Promise.all([
        api.status(),
        api.catalogue(controller.signal),
      ]);
      applySnapshot(nextSnapshot);
      setCatalogue(nextCatalogue);
    } catch (reason) {
      if (controller.signal.aborted) return;
      const message = t("rolesLoadFailed", { message: messageOf(reason) });
      if (snapshot === undefined) setError(message);
      else setRefreshMessage({ tone: "error", text: message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [api, t]);

  const dirtyFlag =
    snapshot !== undefined &&
    snapshot.roles.some((role) => isDirty(drafts[role.key] ?? draftOf(role), role));
  useEffect(() => {
    onDirtyChange?.(dirtyFlag);
  }, [dirtyFlag, onDirtyChange]);

  if (loading && snapshot === undefined) {
    return (
      <div className="pstack-loading">
        <Spinner />
        <span>{t("rolesLoading")}</span>
      </div>
    );
  }
  if (snapshot === undefined) {
    return (
      <div className="pstack-notice" data-tone="error">
        <IconAlert size={14} />
        <span>{error}</span>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {common("retry")}
        </Button>
      </div>
    );
  }

  const draftFor = (role: RoleFileSnapshot["roles"][number]) => drafts[role.key] ?? draftOf(role);
  const dirtyKeys = snapshot.roles
    .filter((role) => isDirty(draftFor(role), role))
    .map((role) => role.key);
  const dirtyCount = dirtyKeys.length;
  const anyBusy = Object.values(drafts).some((draft) => draft.busy);
  const anyIncomplete = dirtyKeys.some((key) =>
    (drafts[key]?.routes ?? []).some(routeIsIncomplete),
  );
  const anyInvalid = dirtyKeys.some((key) =>
    (drafts[key]?.routes ?? []).some((route) => routeIsInvalid(route, catalogue)),
  );
  const canClearAll = snapshot.roles.some((role) => {
    const draft = drafts[role.key] ?? draftOf(role);
    return !draft.cleared && (role.configured || isDirty(draft, role));
  });
  const fileStatus = statusPresentation(snapshot, t);

  const updateRoutes = (key: string, routes: RouteView[]): void => {
    setBulkMessage(undefined);
    setDrafts((current) => {
      const draft = current[key];
      if (draft === undefined) return current;
      return { ...current, [key]: { ...draft, routes, cleared: false, message: undefined } };
    });
  };

  const clearRole = (key: string): void => {
    setBulkMessage(undefined);
    setDrafts((current) => {
      const draft = current[key];
      if (draft === undefined) return current;
      const role = snapshot.roles.find((entry) => entry.key === key);
      return {
        ...current,
        [key]: {
          ...draft,
          routes: inheritedRoutes(),
          cleared: role?.configured ?? false,
          message: undefined,
          busy: false,
        },
      };
    });
  };

  const resetRole = (key: string): void => {
    setBulkMessage(undefined);
    setDrafts((current) => {
      const draft = current[key];
      if (draft === undefined) return current;
      return {
        ...current,
        [key]: {
          ...draft,
          routes: resetRoutes(draft),
          cleared: false,
          message: undefined,
          busy: false,
        },
      };
    });
  };

  const resetAll = (): void => {
    setDrafts((current) =>
      Object.fromEntries(
        snapshot.roles.map((role) => {
          const draft = current[role.key] ?? draftOf(role);
          return [
            role.key,
            {
              ...draft,
              routes: resetRoutes(draft),
              cleared: false,
              message: undefined,
              busy: false,
            },
          ];
        }),
      ),
    );
    setBulkMessage(undefined);
  };

  const clearAll = (): void => {
    setBulkMessage(undefined);
    setDrafts((current) =>
      Object.fromEntries(
        snapshot.roles.map((role) => {
          const draft = current[role.key] ?? draftOf(role);
          return [
            role.key,
            {
              ...draft,
              routes: inheritedRoutes(),
              cleared: role.configured,
              message: undefined,
              busy: false,
            },
          ];
        }),
      ),
    );
  };

  const saveRole = async (key: string): Promise<boolean> => {
    const draft = drafts[key];
    if (draft === undefined) return true;
    setDrafts((current) => {
      const currentDraft = current[key];
      if (currentDraft === undefined) return current;
      return {
        ...current,
        [key]: { ...currentDraft, busy: true, message: undefined },
      };
    });
    try {
      const result = await api.save(
        {
          key,
          routes: isClearDraft(
            draft,
            snapshot.roles.find((role) => role.key === key),
          )
            ? []
            : draft.routes,
        },
        abortRef.current?.signal,
      );
      if (result.ok) {
        const savedRole = result.snapshot.roles.find((entry) => entry.key === key);
        setSnapshot(result.snapshot);
        setDrafts((current) => {
          const currentDraft = current[key];
          if (currentDraft === undefined) return current;
          return {
            ...current,
            [key]: {
              ...currentDraft,
              routes: draft.routes,
              baseline: savedRole?.routes ?? draft.routes,
              cleared: false,
              busy: false,
              message: { tone: "success", text: common("saved") },
            },
          };
        });
        return true;
      }
      setDrafts((current) => {
        const currentDraft = current[key];
        if (currentDraft === undefined) return current;
        return {
          ...current,
          [key]: {
            ...currentDraft,
            busy: false,
            message: { tone: "error", text: t("saveRejected", { reason: result.reason }) },
          },
        };
      });
      return false;
    } catch (reason) {
      setDrafts((current) => {
        const currentDraft = current[key];
        if (currentDraft === undefined) return current;
        return {
          ...current,
          [key]: {
            ...currentDraft,
            busy: false,
            message: { tone: "error", text: t("saveRejected", { reason: messageOf(reason) }) },
          },
        };
      });
      return false;
    }
  };

  const saveAll = async (): Promise<void> => {
    if (dirtyCount === 0 || bulkBusy !== undefined || anyBusy || anyIncomplete || anyInvalid)
      return;
    setBulkBusy("save");
    setBulkMessage(undefined);
    let saved = 0;
    let failed = 0;
    for (const key of dirtyKeys) {
      if (await saveRole(key)) saved += 1;
      else failed += 1;
    }
    setBulkBusy(undefined);
    setBulkMessage(
      failed === 0
        ? { tone: "success", text: t("saveAllDone", { count: saved }) }
        : { tone: "error", text: t("saveAllPartial", { count: saved, failed }) },
    );
  };

  const openBudget = (): void => {
    if (dirtyFlag && !confirmDiscard(t("confirmDiscardChanges"))) return;
    if (dirtyFlag) resetAll();
    setBudgetOpen(true);
  };

  const onBudgetApplied = (next: RoleFileSnapshot): void => {
    applySnapshot(next);
    setBudgetOpen(false);
    setBulkMessage({
      tone: "success",
      text: t("budgetDone", { budget: budgetLabel(next.budget, t) }),
    });
  };

  return (
    <section>
      <header className="pstack-section-head">
        <div>
          <p className="pstack-section-desc">{t("rolesSubtitle")}</p>
          <div className="pstack-file-meta">
            <Status tone={fileStatus.tone} label={fileStatus.label} />
            <span>{t("file")}</span>
            <code className="pstack-file-path" title={snapshot.path}>
              {snapshot.path}
            </code>
          </div>
        </div>
        <div className="pstack-section-actions">
          <Button
            variant="outline"
            size="sm"
            icon={<IconEraser size={13} />}
            disabled={
              !canClearAll || !snapshot.canSave || bulkBusy !== undefined || anyBusy || loading
            }
            onClick={clearAll}
          >
            {t("clearAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={<IconUndo size={13} />}
            disabled={dirtyCount === 0 || bulkBusy !== undefined || anyBusy || loading}
            onClick={resetAll}
          >
            {t("resetAll")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={bulkBusy === "save" ? <Spinner size={13} /> : <IconSave size={13} />}
            disabled={
              dirtyCount === 0 ||
              bulkBusy !== undefined ||
              anyBusy ||
              anyIncomplete ||
              anyInvalid ||
              loading ||
              !snapshot.canSave
            }
            onClick={() => void saveAll()}
          >
            {bulkBusy === "save"
              ? t("savingAll")
              : dirtyCount > 0
                ? t("saveAllCount", { count: dirtyCount })
                : t("saveAll")}
          </Button>
          <IconButton
            label={common("refresh")}
            disabled={loading || bulkBusy !== undefined || anyBusy}
            onClick={() => {
              if (dirtyFlag && !confirmDiscard(t("confirmDiscardChanges"))) return;
              void load();
            }}
          >
            {loading ? <Spinner size={14} /> : <IconRefresh size={14} />}
          </IconButton>
        </div>
      </header>
      <div className="pstack-budget-bar">
        <div className="pstack-budget-status">
          <span className="pstack-field-label">{t("budgetTitle")}</span>
          <span>{t("budgetCurrent", { budget: budgetLabel(snapshot.budget, t) })}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          id="pstack-budget-trigger"
          disabled={
            !snapshot.canSave ||
            catalogue === undefined ||
            bulkBusy !== undefined ||
            anyBusy ||
            loading
          }
          onClick={openBudget}
        >
          {t("budgetAdjust")}
        </Button>
      </div>
      <div className="pstack-effort-hint" role="note">
        <IconInfo size={14} />
        <span>{t("effortBaselineHint")}</span>
      </div>
      {budgetOpen && catalogue !== undefined ? (
        <BudgetDialog
          snapshot={snapshot}
          catalogue={catalogue}
          translations={translations}
          onApply={(request, signal) => api.budget(request, signal)}
          onApplied={onBudgetApplied}
          onClose={() => setBudgetOpen(false)}
          signal={abortRef.current?.signal}
        />
      ) : null}
      <Toast message={refreshMessage} />
      {snapshot.reason === undefined ? null : (
        <div className="pstack-notice" data-tone="error">
          <IconAlert size={14} />
          <span>{t("unreadable", { reason: snapshot.reason })}</span>
        </div>
      )}
      {snapshot.status === "missing" ? (
        <div className="pstack-notice">
          <IconInfo size={14} />
          <span>{t("fileMissingHint")}</span>
        </div>
      ) : null}
      {snapshot.issues.length === 0 ? null : (
        <div className="pstack-notice" data-tone="error">
          <IconAlert size={14} />
          <ul className="pstack-notice-list">
            {snapshot.issues.map((issue, index) => (
              <li key={`${issue.line ?? "x"}-${index}`}>
                {issue.line === undefined
                  ? issue.message
                  : t("issueAtLine", { line: issue.line, message: issue.message })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Toast message={bulkMessage} />
      <div className="pstack-role-list">
        {snapshot.roles.map((role) => (
          <RoleCard
            key={role.key}
            role={role}
            draft={draftFor(role)}
            catalogue={catalogue}
            translations={translations}
            disabled={!snapshot.canSave || bulkBusy !== undefined || anyBusy || loading}
            onRoutesChange={(routes) => updateRoutes(role.key, routes)}
            onClear={() => clearRole(role.key)}
            onSave={() => void saveRole(role.key)}
            onReset={() => resetRole(role.key)}
          />
        ))}
      </div>
    </section>
  );
}

function statusPresentation(
  snapshot: RoleFileSnapshot,
  t: PstackTranslations["roles"],
): { label: string; tone: StatusTone } {
  if (snapshot.status === "unreadable") {
    return { label: t("statusUnreadable"), tone: "error" };
  }
  if (snapshot.status === "missing") return { label: t("statusMissing"), tone: "warn" };
  return { label: t("statusLoaded"), tone: "success" };
}
