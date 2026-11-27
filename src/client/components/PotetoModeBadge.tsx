/** Status badge shown in the session header while poteto workflow is on. */

import type { ReactElement } from "react";
import { IconSparkleRegular, Tag } from "@deepseek-ai/dsh-client-ui-primitives";

import { usePotetoMode, type PotetoModeInjected } from "../lib/poteto-mode.ts";

type BadgeProps = PotetoModeInjected & {
  readonly t: (key: "enabledLabel" | "label") => string;
};

export function PotetoModeBadge(props: BadgeProps): ReactElement | null {
  const { sessionId, readMode, t } = props;
  const { mode } = usePotetoMode(sessionId, readMode);

  if (!mode) return null;
  return (
    <span title={t("enabledLabel")} className="pstack-poteto-badge-wrap">
      <Tag tone="neutral" className="pstack-poteto-badge">
        <IconSparkleRegular size={11} aria-hidden="true" />
        {t("label")}
      </Tag>
    </span>
  );
}
