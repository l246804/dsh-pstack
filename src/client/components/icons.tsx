/** Icons for pstack client surfaces; DSH primitives are preferred where an equivalent exists. */

import type { ReactElement, SVGProps } from "react";
import {
  IconBranchOutlineRegular,
  IconCheckCircleOutlineRegular,
  IconCheckOutlineRegular,
  IconInfoOutlineRegular,
  IconPlusOutlineRegular,
  IconRefreshOutlineRegular,
  IconSaveOutlineRegular,
  IconSearchOutlineRegular,
  IconSettingsOutlineRegular,
  IconTrashOutlineRegular,
  IconWarningTriangleOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";

export type IconComponent = (props: IconProps) => ReactElement;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height"> {
  readonly size?: number;
}

function icon(paths: ReactElement): IconComponent {
  return function PstackIcon({ size = 16, ...rest }: IconProps): ReactElement {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export {
  IconBranchOutlineRegular as IconGitBranch,
  IconCheckCircleOutlineRegular as IconCheckCircle,
  IconCheckOutlineRegular as IconCheck,
  IconInfoOutlineRegular as IconInfo,
  IconPlusOutlineRegular as IconPlus,
  IconRefreshOutlineRegular as IconRefresh,
  IconSaveOutlineRegular as IconSave,
  IconSearchOutlineRegular as IconSearch,
  IconSettingsOutlineRegular as IconSettings,
  IconTrashOutlineRegular as IconTrash,
  IconWarningTriangleOutlineRegular as IconAlert,
};

export const IconRoute = icon(
  <>
    <circle cx="3.4" cy="3.4" r="1.7" />
    <circle cx="12.6" cy="12.6" r="1.7" />
    <path d="M3.4 5.1v3.3a2.2 2.2 0 0 0 2.2 2.2h3.6a2.2 2.2 0 0 1 2.2 2.2" />
  </>,
);

export const IconTerminal = icon(
  <>
    <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.8" />
    <path d="M4.4 6.2l2.1 1.8-2.1 1.8M8.4 10.2h3.2" />
  </>,
);

export const IconRepeat = icon(
  <>
    <path d="M3 6.2A3.2 3.2 0 0 1 6.2 3H13" />
    <path d="M10.8 1.6L13.2 3l-2.4 1.4" />
    <path d="M13 9.8A3.2 3.2 0 0 1 9.8 13H3" />
    <path d="M5.2 14.4L2.8 13l2.4-1.4" />
  </>,
);

export const IconUndo = icon(
  <>
    <path d="M3 8a5 5 0 1 0 1.5-3.6" />
    <path d="M3 2.8v3.1h3.1" />
  </>,
);

export const IconMonitor = icon(
  <>
    <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1.6" />
    <path d="M5.2 14h5.6M8 11.2V14" />
  </>,
);

export const IconEraser = icon(
  <>
    <path d="M3.1 10.6l5.2-5.2a1.7 1.7 0 0 1 2.4 0l1 1a1.7 1.7 0 0 1 0 2.4l-4.4 4.4H5.1z" />
    <path d="M6.6 6.1l3.3 3.3M3.1 10.6h6.3" />
  </>,
);
