import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ROLE_MANIFEST } from "../src/internal/role-manifest.ts";
import { parseRoleConfiguration } from "../src/internal/role-config.ts";
import { snapshotFromConfiguration } from "../src/internal/role-editor.ts";
import type { CatalogueResult } from "../src/models.ts";
import { RoleSettingsView, type Translate } from "../src/client/RoleSettingsPage.tsx";
import { draftsFromSnapshot } from "../src/client/state.ts";
import { en, zh, type PstackRolesLocaleKey } from "../src/client/locales.ts";

function translator(dictionary: Record<PstackRolesLocaleKey, string>): Translate {
  return (key, vars) => {
    let value = dictionary[key];
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };
}

const t = translator(en);
const tZh = translator(zh);

const catalogue: CatalogueResult = {
  truncated: false,
  providers: [
    {
      provider: "cpa",
      name: "CPA",
      models: [
        { route: "cpa/model-a", id: "model-a", name: "Model A", efforts: ["low", "high"] },
        { route: "cpa/model-b", id: "model-b", name: "Model B", efforts: [] },
      ],
    },
  ],
};

const noop = (): void => {};

function render(text: string | undefined, translate: Translate = t): string {
  const path = "/home/user/.dsh/pstack-models.mdc";
  const configuration =
    text === undefined
      ? ({ status: "missing", path } as const)
      : parseRoleConfiguration(text, path);
  const snapshot = snapshotFromConfiguration(configuration);
  return renderToStaticMarkup(
    <RoleSettingsView
      snapshot={snapshot}
      catalogue={catalogue}
      drafts={draftsFromSnapshot(snapshot)}
      messages={{}}
      onRetry={noop}
      onRouteChange={noop}
      onAddRoute={noop}
      onRemoveRoute={noop}
      onSave={noop}
      onReset={noop}
      t={translate}
    />,
  );
}

describe("role configuration page", () => {
  it("renders every manifest role in order for a missing file", () => {
    const html = render(undefined);
    expect(html).toContain("/home/user/.dsh/pstack-models.mdc");
    expect(html).toContain(">missing<");
    let previous = -1;
    for (const role of ROLE_MANIFEST) {
      const index = html.indexOf(role.key);
      expect(index, `missing ${role.key}`).toBeGreaterThan(previous);
      previous = index;
    }
    expect(html).toContain("inherit-parent");
    expect(html.match(/>Save</g)).toHaveLength(17);
  });

  it("shows configured routes, list routes, and file issues with line numbers", () => {
    const html = render(
      [
        "# budget: large",
        "feature, refactoring: cpa/model-a [high]",
        "arena runners: cpa/model-a, cpa/model-b",
        "retired role: cpa/model-a",
        "",
      ].join("\n"),
    );
    expect(html).toContain("cpa/model-a [high]");
    expect(html).toContain("cpa/model-a · cpa/model-b");
    expect(html).toContain("Line 4:");
    expect(html).toContain("unknown role");
    expect(html).toContain(">loaded<");
    expect(html).toContain("large");
  });

  it("disables every save control when the file is unreadable", () => {
    const path = "/home/user/.dsh/pstack-models.mdc";
    const snapshot = snapshotFromConfiguration({
      status: "unreadable",
      path,
      reason: "EACCES: permission denied",
    });
    const html = renderToStaticMarkup(
      <RoleSettingsView
        snapshot={snapshot}
        catalogue={catalogue}
        drafts={draftsFromSnapshot(snapshot)}
        messages={{}}
        onRetry={noop}
        onRouteChange={noop}
        onAddRoute={noop}
        onRemoveRoute={noop}
        onSave={noop}
        onReset={noop}
        t={t}
      />,
    );
    expect(html).toContain("EACCES: permission denied");
    expect(html).toContain('disabled=""');
    expect(html).toContain(">unreadable<");
  });

  it("keeps every route of a list role in its editable draft", () => {
    const snapshot = snapshotFromConfiguration(
      parseRoleConfiguration(
        "arena runners: cpa/model-a [high], cpa/model-b, auto\n",
        "/home/user/.dsh/pstack-models.mdc",
      ),
    );
    expect(draftsFromSnapshot(snapshot)["arena runners"]).toEqual([
      { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
      { kind: "route", provider: "cpa", model: "model-b" },
      { kind: "inherit", alias: "auto" },
    ]);
  });

  it("uses the declared dictionary key for every English string", () => {
    const keys = Object.keys(en) as PstackRolesLocaleKey[];
    expect(keys.length).toBeGreaterThan(20);
    expect(Object.keys(zh).sort()).toEqual([...keys].sort());
    for (const key of keys) expect(zh[key]).not.toBe("");
  });

  it("explains that effort is a baseline with floating rules in English", () => {
    const html = render(undefined);
    expect(html).toContain("Effort is a baseline, not a fixed value");
    expect(html).toContain("low → medium → high");
    expect(html).toContain("pstack_subagent");
    expect(html).toContain("set_reasoning_effort");
    expect(html).toContain("nothing floats");
  });

  it("explains the baseline and floating rules in Chinese", () => {
    const html = render(undefined, tZh);
    expect(html).toContain("推理强度是基准值，不是固定值");
    expect(html).toContain("low → medium → high");
    expect(html).toContain("pstack_subagent");
    expect(html).toContain("运行中的子代理");
    expect(html).toContain("不浮动");
  });

  it("renders the configuration page in Chinese", () => {
    const html = render("feature, refactoring: cpa/model-a [high]\n", tZh);
    expect(html).toContain("角色模型配置");
    expect(html).toContain("已加载");
    expect(html).toContain("提供方");
    expect(html).toContain("模型");
    expect(html).toContain("推理强度");
    expect(html).toContain("继承父级（inherit-parent）");
    expect(html).toContain(">保存<");
  });
});
