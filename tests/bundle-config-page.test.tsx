import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  PstackBundleConfigPage,
  type PstackBundleConfigPageProps,
} from "../src/client/PstackBundleConfigPage.tsx";
import { en as rolesEn, zh as rolesZh } from "../src/client/locales.ts";
import { en as pluginsEn, zh as pluginsZh } from "../src/client/optional-plugins-locales.ts";

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
  it("renders the recommendation section and role editor in English", () => {
    const html = render(rolesEn, pluginsEn);
    expect(html).toContain("Loading optional plugin status…");
    expect(html).toContain("Loading role configuration…");
  });

  it("renders the recommendation section and role editor in Chinese", () => {
    const html = render(rolesZh, pluginsZh);
    expect(html).toContain("正在读取可选插件状态…");
    expect(html).toContain("正在读取角色配置…");
  });
});
