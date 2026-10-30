/** Bundle configuration page: optional-plugin recommendations above the role model editor. */

import type { ReactElement } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";

import { OptionalPluginsSection, type OptionalPluginsFace } from "./OptionalPluginsPage.tsx";
import { RoleSettingsPage, type PstackRolesApi } from "./RoleSettingsPage.tsx";
import { NS } from "./locales.ts";

/** Slot registration face: the role API plus the plugin-manager API. */
export interface PstackBundleConfigFace {
  readonly api: PstackRolesApi;
  readonly optionalPlugins: OptionalPluginsFace["optionalPlugins"];
}

/** Props of the whole dsh-pstack bundle configuration page. */
export type PstackBundleConfigPageProps = PropsRuntime<"plugins.bundle.config"> &
  PropsLocale<typeof NS> &
  InjectFace<PstackBundleConfigFace>;

/** Render the recommendation section first, then the unchanged role editor. */
export function PstackBundleConfigPage(props: PstackBundleConfigPageProps): ReactElement {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <OptionalPluginsSection optionalPlugins={props.optionalPlugins} t={props.t} />
      <RoleSettingsPage {...props} />
    </div>
  );
}
