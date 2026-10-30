import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { BundleSnapshot } from "../src/client/optional-plugins-state.ts";
import {
  changeResultText,
  OptionalPluginsActivationView,
  OptionalPluginsView,
} from "../src/client/OptionalPluginsPage.tsx";
import { optionalPluginRows } from "../src/client/optional-plugins-state.ts";
import { en, zh, type PstackRolesLocaleKey } from "../src/client/locales.ts";
import type { Translate } from "../src/client/RoleSettingsPage.tsx";

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

const noop = (): void => {};

function bundle(name: string, overrides: Partial<BundleSnapshot> = {}): BundleSnapshot {
  return {
    name,
    availability: "installation",
    enabled: false,
    installed: false,
    optional: true,
    ...overrides,
  };
}

const bundles: readonly BundleSnapshot[] = [
  bundle("@deepseek-ai/dsh-experimental-tool-worktree", { enabled: true }),
  bundle("@deepseek-ai/dsh-experimental-forge-bundle"),
  bundle("@deepseek-ai/dsh-cua-bundle", {
    error: { code: "unsupported-platform" },
  }),
  bundle("@deepseek-ai/dsh-experimental-terminal-bundle"),
  bundle("@deepseek-ai/dsh-experimental-session-search"),
  bundle("@deepseek-ai/dsh-experimental-agent-team-profile"),
  bundle("@deepseek-ai/dsh-experimental-ralph-bundle", {
    error: { code: "operation-error", diagnostic: "boom" },
  }),
];

function render(translate: Translate = t): string {
  return renderToStaticMarkup(
    <OptionalPluginsView
      rows={optionalPluginRows(bundles)}
      status="ready"
      messages={{}}
      onToggle={noop}
      onEnableRecommended={noop}
      onRetry={noop}
      t={translate}
    />,
  );
}

describe("optional plugin recommendation section", () => {
  it("renders every documented status, group, tag, and guidance line", () => {
    const html = render();
    expect(html).toContain("Recommended plugins");
    expect(html).toContain("Sessions and isolation");
    expect(html).toContain("Verification and evidence");
    expect(html).toContain("Multi-agent");
    expect(html).toContain('data-optional-plugin="OPT-01"');
    expect(html).toContain('data-optional-status="enabled"');
    expect(html).toContain('data-optional-status="missing"');
    expect(html).toContain('data-optional-status="unsupported-platform"');
    expect(html).toContain('data-optional-status="error"');
    expect(html).toContain("GitHub PR suggestion");
    expect(html).toContain("Recommended");
    expect(html).toContain("Do not enable Agent Teams and pstack_subagent");
    expect(html).toContain("Not a bundle: configure it in the DSH documentation");
    expect(html).toContain("Enable recommended plugins");
    expect(html).toContain("Default set: OPT-01, then OPT-06.");
  });

  it("offers a switch only to switchable bundle rows", () => {
    const html = render();
    const card = (id: string): string =>
      html.slice(
        html.indexOf(`data-optional-plugin="${id}"`),
        html.indexOf("</article>", html.indexOf(`data-optional-plugin="${id}"`)),
      );
    expect(card("OPT-01")).toContain(">Disable<");
    expect(card("OPT-02")).toContain(">Enable<");
    expect(card("OPT-03")).not.toContain(">Enable<");
    expect(card("OPT-04")).not.toContain(">Enable<");
    expect(card("OPT-07")).not.toContain(">Enable<");
    expect(card("OPT-08")).not.toContain(">Enable<");
  });

  it("renders the section in Chinese", () => {
    const html = render(tZh);
    expect(html).toContain("推荐插件");
    expect(html).toContain("会话与隔离");
    expect(html).toContain("验证与证据");
    expect(html).toContain("多代理");
    expect(html).toContain("一键启用推荐项");
    expect(html).toContain("已启用");
    expect(html).toContain("GitHub PR 用户建议");
  });

  it("renders load failures with a retry control", () => {
    const html = renderToStaticMarkup(
      <OptionalPluginsView
        rows={[]}
        status="error"
        loadError="disconnected"
        messages={{}}
        onToggle={noop}
        onEnableRecommended={noop}
        onRetry={noop}
        t={t}
      />,
    );
    expect(html).toContain("Could not read optional plugin status: disconnected");
    expect(html).toContain(">Retry<");
  });

  it("shows the activation guidance count", () => {
    const html = renderToStaticMarkup(
      <OptionalPluginsActivationView count={2} onOpen={noop} onDismiss={noop} t={t} />,
    );
    expect(html).toContain("2 recommended plugins are still off");
    expect(html).toContain("Review recommended plugins");
    expect(html).toContain("Dismiss");
  });
});

describe("change result copy", () => {
  it("maps every application outcome to a message", () => {
    expect(changeResultText("applied", t)).toBe("Applied");
    expect(changeResultText("restart-required", t)).toBe("Restart required");
    expect(changeResultText("failed", t, "boom")).toBe("Failed: boom");
    expect(changeResultText("overridden", t)).toBe("Overridden by a higher layer");
    expect(changeResultText("cancelled", t)).toBe("Cancelled");
  });
});
