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
import { messageOf } from "../lib/message.ts";
import { usePotetoMode, type PotetoModeInjected } from "../lib/poteto-mode.ts";
import { ensurePstackStyles } from "../lib/styles.ts";
import { showToast } from "../lib/toast.ts";

export interface PotetoModeToggleInjected extends PotetoModeInjected {
  readonly selectMode: (enabled: boolean) => Promise<string | null>;
  readonly t: (
    key: "label" | "description" | "failed" | "enabledLabel" | "enabledNotice" | "disabledNotice",
    vars?: Record<string, string | number>,
  ) => string;
}

export function PotetoModeToggle(
  props: PotetoModeToggleInjected &
    Pick<PropsRuntime<"conversation.input.model.options">, "useProjection">,
): ReactElement | null {
  const { sessionId, readMode, selectMode, t, useProjection } = props;
  // The projection carries the first-paint snapshot from the storage sidecar.
  // Live changes update local state and the shared browser event.
  const projected = useProjection("potetoMode");
  const { mode, setMode } = usePotetoMode(sessionId, readMode);
  const [pending, setPending] = useState(false);
  const effectiveMode = mode ?? projected?.enabled;

  useEffect(() => {
    ensurePstackStyles();
  }, []);

  if (effectiveMode === undefined) return null;

  const select = (next: boolean): void => {
    setPending(true);
    void selectMode(next)
      .then(
        (failure) => {
          if (failure === null) {
            setMode(next);
            showToast({
              tone: next ? "success" : "neutral",
              text: t(next ? "enabledNotice" : "disabledNotice"),
            });
          } else {
            showToast({ tone: "error", text: t("failed", { message: failure }) });
          }
        },
        (reason: unknown) => {
          showToast({ tone: "error", text: t("failed", { message: messageOf(reason) }) });
        },
      )
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
        checked={effectiveMode}
        disabled={pending}
        label={t("label")}
        onChange={select}
      />
    </div>
  );
}
