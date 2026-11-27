/** Shared controls for the pstack client surfaces. */

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import {
  Button as PrimitiveButton,
  StateDot,
  Switch as PrimitiveSwitch,
  Tag,
} from "@deepseek-ai/dsh-client-ui-primitives";

export { PrimitiveButton as Button, PrimitiveSwitch as Switch };
export { SegmentedTabs } from "@deepseek-ai/dsh-client-ui-primitives";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly danger?: boolean;
  readonly children: ReactNode;
}

export function IconButton(props: IconButtonProps): ReactElement {
  const { label, danger = false, children, className, ...rest } = props;
  return (
    <PrimitiveButton
      variant="ghost"
      size="sm"
      {...rest}
      aria-label={label}
      title={label}
      className={cx("pstack-icon-btn", danger ? "pstack-icon-btn-danger" : undefined, className)}
    >
      {children}
    </PrimitiveButton>
  );
}

export type StatusTone = "neutral" | "success" | "warn" | "error" | "brand";

const STATUS_TONE: Record<StatusTone, "neutral" | "success" | "warning" | "danger" | "info"> = {
  neutral: "neutral",
  success: "success",
  warn: "warning",
  error: "danger",
  brand: "info",
};

const DOT_STATE: Record<StatusTone, "idle" | "done" | "warning" | "error" | "ongoing"> = {
  neutral: "idle",
  success: "done",
  warn: "warning",
  error: "error",
  brand: "ongoing",
};

export function Status(props: {
  tone: StatusTone;
  label: string;
  title?: string;
  compact?: boolean;
}): ReactElement {
  return (
    <span title={props.title}>
      <Tag
        tone={STATUS_TONE[props.tone]}
        className={props.compact ? "pstack-status pstack-status-compact" : "pstack-status"}
      >
        <StateDot state={DOT_STATE[props.tone]} size={props.compact ? 8 : undefined} />
        <span>{props.label}</span>
      </Tag>
    </span>
  );
}

export function Spinner({ size = 14 }: { readonly size?: number }): ReactElement {
  return <StateDot state="ongoing" size={size} />;
}

export function cx(...values: readonly (string | undefined | false)[]): string {
  return values
    .filter((value): value is string => typeof value === "string" && value !== "")
    .join(" ");
}
