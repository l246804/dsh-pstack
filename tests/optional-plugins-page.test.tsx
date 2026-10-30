import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import type { BundleSnapshot } from "../src/client/optional-plugins-state.ts";
import {
  changeResultText,
  OptionalPluginsActivationView,
  OptionalPluginsView,
} from "../src/client/OptionalPluginsPage.tsx";
import { optionalPluginRows } from "../src/client/optional-plugins-state.ts";
import { SUPPORTED_LOCALES } from "../src/client/i18n.ts";
import {
  catalogs as pluginsCatalogs,
  type PstackPluginsLocaleKey,
  type PstackPluginsTranslate,
} from "../src/client/optional-plugins-locales.ts";

function translator(dictionary: Record<PstackPluginsLocaleKey, string>): PstackPluginsTranslate {
  return (key, vars) => {
    let value = (dictionary as Record<string, string>)[key] ?? key;
    for (const [name, replacement] of Object.entries(vars ?? {})) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  };
}

const baseLocale = SUPPORTED_LOCALES[0];
const t = translator(pluginsCatalogs[baseLocale]);

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

function render(translate: PstackPluginsTranslate = t): string {
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
  it("renders every documented status, group, tag, and guidance line in every supported locale", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const copy = pluginsCatalogs[locale];
      const html = render(translator(copy));
      expect(html).toContain(copy.optionalPluginsTitle);
      expect(html).toContain(copy.groupSessions);
      expect(html).toContain(copy.groupVerification);
      expect(html).toContain(copy.groupMultiAgent);
      expect(html).toContain('data-optional-plugin="OPT-01"');
      expect(html).toContain('data-optional-status="enabled"');
      expect(html).toContain('data-optional-status="missing"');
      expect(html).toContain('data-optional-status="unsupported-platform"');
      expect(html).toContain('data-optional-status="error"');
      expect(html).toContain(copy.suggestedTag);
      expect(html).toContain(copy.recommendedTag);
      expect(html).toContain(copy.conflictWarning);
      expect(html).toContain(copy.nonBundleGuidance);
      expect(html).toContain(copy.enableRecommended);
      expect(html).toContain(copy.recommendedHint);
    }
  });

  it("offers a switch only to switchable bundle rows", () => {
    const html = render();
    const copy = pluginsCatalogs[baseLocale];
    const card = (id: string): string =>
      html.slice(
        html.indexOf(`data-optional-plugin="${id}"`),
        html.indexOf("</article>", html.indexOf(`data-optional-plugin="${id}"`)),
      );
    expect(card("OPT-01")).toContain(`>${copy.disablePlugin}<`);
    expect(card("OPT-02")).toContain(`>${copy.enablePlugin}<`);
    expect(card("OPT-03")).not.toContain(`>${copy.enablePlugin}<`);
    expect(card("OPT-04")).not.toContain(`>${copy.enablePlugin}<`);
    expect(card("OPT-07")).not.toContain(`>${copy.enablePlugin}<`);
    expect(card("OPT-08")).not.toContain(`>${copy.enablePlugin}<`);
  });

  it("renders load failures with a retry control", () => {
    const copy = pluginsCatalogs[baseLocale];
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
    expect(html).toContain(copy.optionalLoadFailed.replace("{message}", "disconnected"));
    expect(html).toContain(`>${copy.optionalRetry}<`);
  });

  it("shows the activation guidance count", () => {
    const copy = pluginsCatalogs[baseLocale];
    const html = renderToStaticMarkup(
      <OptionalPluginsActivationView count={2} onOpen={noop} onDismiss={noop} t={t} />,
    );
    expect(html).toContain(copy.guidanceTitle.replace("{count}", "2"));
    expect(html).toContain(copy.guidanceOpen);
    expect(html).toContain(copy.guidanceDismiss);
  });
});

describe("change result copy", () => {
  it("maps every application outcome to a message", () => {
    const copy = pluginsCatalogs[baseLocale];
    expect(changeResultText("applied", t)).toBe(copy.resultApplied);
    expect(changeResultText("restart-required", t)).toBe(copy.resultRestartRequired);
    expect(changeResultText("failed", t, "boom")).toBe(
      copy.resultFailed.replace("{reason}", "boom"),
    );
    expect(changeResultText("overridden", t)).toBe(copy.resultOverridden);
    expect(changeResultText("cancelled", t)).toBe(copy.resultCancelled);
  });
});
