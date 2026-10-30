import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  PstackBundleConfigPage,
  type PstackBundleConfigPageProps,
} from "../src/client/PstackBundleConfigPage.tsx";
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

// The page only reads these through effects, which server rendering does not run.
const api = {} as PstackBundleConfigPageProps["api"];
const optionalPlugins = {} as PstackBundleConfigPageProps["optionalPlugins"];

function render(roles: Record<string, string>, plugins: Record<string, string>): string {
  return renderToStaticMarkup(
    <PstackBundleConfigPage
      view="page"
      t={translator(roles)}
      pluginsT={translator(plugins)}
      api={api}
      optionalPlugins={optionalPlugins}
    />,
  );
}

describe("bundle configuration page", () => {
  it("renders the recommendation section and role editor in every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const html = render(rolesCatalogs[locale], pluginsCatalogs[locale]);
      expect(html).toContain(pluginsCatalogs[locale].optionalLoading);
      expect(html).toContain(rolesCatalogs[locale].loading);
    }
  });
});
