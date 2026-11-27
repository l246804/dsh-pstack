/** Session poteto-workflow switch, a direct copy of the Agent Teams menu row. */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  Button,
  IconInfoOutlineRegular,
  Switch,
  Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-model-selection/client";
import type {} from "../session-projection-types.ts";
import { showToast } from "../lib/toast.ts";

const STYLE_ID = "pstack-poteto-row-style";
const ROW_CSS = `
.pstack-poteto-row {
  border-radius: var(--dsw-radius-md);
  min-height: 34px;
  color: var(--dsw-alias-label-primary);
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 0 8px;
  font-size: 13px;
  line-height: 20px;
  display: flex;
  position: relative;
}
.pstack-poteto-label { align-items: center; gap: 4px; min-width: 0; display: inline-flex; }
.pstack-poteto-info { z-index: 1; width: 20px; height: 20px; color: var(--dsw-alias-label-caption); flex: none; padding: 0; position: relative; }
.pstack-poteto-row .pstack-poteto-switch { position: static; }
.pstack-poteto-row .pstack-poteto-switch:after { content: ""; border-radius: var(--dsw-radius-md); position: absolute; inset: 0; }
.pstack-poteto-row:has(.pstack-poteto-switch:focus-visible) { background: var(--dsw-alias-interactive-bg-hover); }
@media (hover: hover) {
  .pstack-poteto-row:has(.pstack-poteto-switch:not(:disabled)):hover { background: var(--dsw-alias-interactive-bg-hover); }
}
`;

export const POTETO_MODE_EVENT = "pstack-poteto-mode-change";

export interface PotetoModeToggleInjected {
  readonly sessionId: string;
  readonly readMode: () => Promise<boolean>;
  readonly selectMode: (enabled: boolean) => Promise<string | null>;
  readonly t: (
    key: "label" | "description" | "failed" | "enabledLabel" | "enabledNotice" | "disabledNotice",
    vars?: Record<string, string | number>,
  ) => string;
}

function ensureStyle(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID) !== null) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = ROW_CSS;
  document.head.append(style);
}

export function PotetoModeToggle(
  props: PotetoModeToggleInjected &
    Pick<PropsRuntime<"conversation.input.model.options">, "useProjection">,
): ReactElement | null {
  const { sessionId, readMode, selectMode, t, useProjection } = props;
  // The projection carries the first-paint snapshot from the storage sidecar.
  // Live changes update local state and the shared browser event.
  const projected = useProjection("potetoMode");
  const [selected, setSelected] = useState<boolean | undefined>();
  const [pending, setPending] = useState(false);
  const mode = selected ?? projected?.enabled;

  useEffect(() => {
    ensureStyle();
    let live = true;
    void readMode().then(
      (value) => {
        if (live) setSelected(value);
      },
      () => undefined,
    );
    const onChange = (event: Event): void => {
      const detail = (event as CustomEvent<{ sessionId: string; enabled: boolean }>).detail;
      if (detail.sessionId === sessionId) setSelected(detail.enabled);
    };
    window.addEventListener(POTETO_MODE_EVENT, onChange);
    return () => {
      live = false;
      window.removeEventListener(POTETO_MODE_EVENT, onChange);
    };
  }, [readMode, sessionId]);

  if (mode === undefined) return null;

  const select = (next: boolean): void => {
    setPending(true);
    void selectMode(next)
      .then((failure) => {
        if (failure === null) {
          setSelected(next);
          window.dispatchEvent(
            new CustomEvent(POTETO_MODE_EVENT, { detail: { sessionId, enabled: next } }),
          );
          showToast({
            tone: next ? "success" : "neutral",
            text: t(next ? "enabledNotice" : "disabledNotice"),
          });
        } else {
          showToast({ tone: "error", text: t("failed", { message: failure }) });
        }
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="pstack-poteto-row">
      <span className="pstack-poteto-label">
        <span>{t("label")}</span>
        <Tooltip
          label={t("description")}
          side="top"
          delayMs={300}
          maxWidth={300}
          portal
          openOnClick
        >
          <Button
            variant="ghost"
            size="sm"
            className="pstack-poteto-info"
            aria-label={t("description")}
          >
            <IconInfoOutlineRegular size={11} aria-hidden="true" />
          </Button>
        </Tooltip>
      </span>
      <Switch
        className="pstack-poteto-switch"
        checked={mode}
        disabled={pending}
        label={t("label")}
        onChange={select}
      />
    </div>
  );
}
