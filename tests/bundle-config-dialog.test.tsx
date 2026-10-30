import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type {
  PluginPackageRef,
  PluginsSubject,
} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";

import {
  PstackBundleConfigAction,
  PstackBundleConfigDialogView,
  type PstackBundleConfigActionProps,
  type PstackBundleConfigSection,
} from "../src/client/PstackBundleConfigDialog.tsx";
import { SUPPORTED_LOCALES } from "../src/client/i18n.ts";
import { catalogs as rolesCatalogs } from "../src/client/locales.ts";
import { catalogs as pluginsCatalogs } from "../src/client/optional-plugins-locales.ts";

function translator(
  dictionary: Record<string, string>,
): (key: string, vars?: Record<string, unknown>) => string {
  return (key, vars) => {
    let value = dictionary[key] ?? key;
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };
}

// The page sections only read these through effects, which server rendering does not run.
const api = {} as PstackBundleConfigActionProps["api"];
const optionalPlugins = {} as PstackBundleConfigActionProps["optionalPlugins"];

function packageRef(name: string): PluginPackageRef {
  return {
    name,
    installed: true,
    availability: "profile",
    official: false,
    enabled: true,
    rows: [],
  };
}

function bundleSubject(name: string): PluginsSubject {
  return { kind: "bundle", pkg: packageRef(name) };
}

function actionProps(subject: PluginsSubject): PstackBundleConfigActionProps {
  return {
    subject,
    t: translator(pluginsCatalogs.en),
    api,
    optionalPlugins,
    rolesT: translator(rolesCatalogs.en),
  };
}

function renderDialog(
  locale: (typeof SUPPORTED_LOCALES)[number],
  active: PstackBundleConfigSection,
): string {
  return renderToStaticMarkup(
    <PstackBundleConfigDialogView
      active={active}
      onSelect={() => {}}
      onClose={() => {}}
      api={api}
      optionalPlugins={optionalPlugins}
      rolesT={translator(rolesCatalogs[locale])}
      pluginsT={translator(pluginsCatalogs[locale])}
    />,
  );
}

describe("bundle configuration action", () => {
  it("renders the Configure button only on the dsh-pstack bundle page", () => {
    const copy = pluginsCatalogs.en;
    expect(
      renderToStaticMarkup(
        <PstackBundleConfigAction {...actionProps(bundleSubject("dsh-pstack"))} />,
      ),
    ).toContain(copy.configureAction);
    expect(
      renderToStaticMarkup(
        <PstackBundleConfigAction {...actionProps(bundleSubject("other-bundle"))} />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(
        <PstackBundleConfigAction
          {...actionProps({
            kind: "row",
            pkg: packageRef("dsh-pstack"),
            row: { rowId: "pstack", moduleName: "x", enabled: true },
          })}
        />,
      ),
    ).toBe("");
  });
});

describe("bundle configuration dialog", () => {
  it("renders the Settings-style shell and a section per locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const pluginsCopy = pluginsCatalogs[locale];
      const rolesCopy = rolesCatalogs[locale];
      const pluginsHtml = renderDialog(locale, "plugins");
      expect(pluginsHtml).toContain(pluginsCopy.configureTitle);
      expect(pluginsHtml).toContain(pluginsCopy.configureClose);
      expect(pluginsHtml).toContain(pluginsCopy.configureSections);
      expect(pluginsHtml).toContain(pluginsCopy.configurePluginsSection);
      expect(pluginsHtml).toContain(pluginsCopy.configureRolesSection);
      expect(pluginsHtml).toContain(pluginsCopy.optionalPluginsTitle);
      expect(pluginsHtml).toContain(pluginsCopy.optionalLoading);
      expect(pluginsHtml).not.toContain(rolesCopy.loading);
      expect(pluginsHtml).toContain('aria-current="true"');

      const rolesHtml = renderDialog(locale, "roles");
      expect(rolesHtml).toContain(rolesCopy.title);
      expect(rolesHtml).toContain(rolesCopy.loading);
      expect(rolesHtml).not.toContain(pluginsCopy.optionalLoading);
    }
  });
});
