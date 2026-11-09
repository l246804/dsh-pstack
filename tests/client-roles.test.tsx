// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";

import { apply } from "../src/client/index.ts";
import { createPstackConfigAction, PstackConfigDialog } from "../src/client/PstackConfigDialog.tsx";
import { draftOf, resetRoutes } from "../src/client/role-draft.ts";
import type { RoleSettingsApi } from "../src/client/RoleSettingsPage.tsx";
import { catalogs, type PstackTranslations } from "../src/client/locales/index.ts";
import type { CatalogueResult } from "../src/models.ts";
import type { RoleFileSnapshot, RoleView, SaveRoleRequest } from "../src/role-wire.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function translator(dict: Record<string, string>) {
  return (key: string, vars?: Record<string, string | number>): string => {
    let text = dict[key] ?? key;
    if (vars !== undefined) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

function translations(): PstackTranslations {
  return {
    common: translator(catalogs.common.en),
    config: translator(catalogs.config.en),
    plugins: translator(catalogs.plugins.en),
    roles: translator(catalogs.roles.en),
  };
}

const catalogue: CatalogueResult = {
  truncated: false,
  providers: [
    {
      provider: "cpa",
      name: "CPA",
      models: [{ route: "cpa/model-a", id: "model-a", name: "Model A", efforts: ["low", "high"] }],
    },
  ],
};

const catalogueWithUnusableProviders: CatalogueResult = {
  truncated: false,
  providers: [
    { provider: "deepseek", name: "DeepSeek", models: [] },
    ...catalogue.providers,
    { provider: "broken", name: "Broken", models: [], error: "discovery failed" },
  ],
};

function bugFixRole(configured = true): RoleView {
  return {
    key: "bug-fix",
    shape: "single",
    configured,
    ...(configured ? { line: 2 } : {}),
    routes: configured
      ? [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }]
      : [],
    issues: [],
  };
}

function snapshotFor(configured = true): RoleFileSnapshot {
  return {
    path: "/home/user/.dsh/pstack-models.mdc",
    status: "loaded",
    roles: [bugFixRole(configured)],
    issues: [],
    canSave: true,
  };
}

function inheritedRole(alias: "inherit-parent" | "auto" = "inherit-parent"): RoleView {
  return {
    key: "bug-fix",
    shape: "single",
    configured: true,
    line: 2,
    routes: [{ kind: "inherit", alias }],
    issues: [],
  };
}

function snapshotWithInheritedRole(
  alias: "inherit-parent" | "auto" = "inherit-parent",
): RoleFileSnapshot {
  return { ...snapshotFor(), roles: [inheritedRole(alias)] };
}

function snapshotWithBudget(): RoleFileSnapshot {
  return { ...snapshotFor(), budget: "large (xhigh)" };
}

function unconfiguredHillclimb(): RoleView {
  return { key: "hillclimb", shape: "single", configured: false, routes: [], issues: [] };
}

function snapshotWithSecondUnconfiguredRole(): RoleFileSnapshot {
  return { ...snapshotFor(), roles: [bugFixRole(true), unconfiguredHillclimb()] };
}

function snapshotAfter(request: SaveRoleRequest): RoleFileSnapshot {
  const configured = request.routes.length > 0;
  return {
    path: "/home/user/.dsh/pstack-models.mdc",
    status: "loaded",
    roles: [
      {
        key: request.key,
        shape: "single",
        configured,
        ...(configured ? { line: 2 } : {}),
        routes: request.routes.map((route) => ({ ...route })),
        issues: [],
      },
    ],
    issues: [],
    canSave: true,
  };
}

interface RoleApiController {
  api: RoleSettingsApi;
  statusCalls: () => number;
  saves: SaveRoleRequest[];
}

function makeRoleApi(): RoleApiController {
  let statusCalls = 0;
  let current = snapshotFor();
  const saves: SaveRoleRequest[] = [];
  return {
    api: {
      status: async () => {
        statusCalls += 1;
        return current;
      },
      catalogue: async () => catalogue,
      save: async (request) => {
        saves.push(request);
        current = snapshotAfter(request);
        return { ok: true, snapshot: current };
      },
      budget: async () => ({ ok: true, snapshot: current }),
    },
    statusCalls: () => statusCalls,
    saves,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  document.body.innerHTML = "";
});

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
  });
  await flush();
}

function buttonByText(scope: ParentNode, text: string): HTMLButtonElement {
  return Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === text,
  )!;
}

function tab(name: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(
    (button) => button.textContent?.trim() === name,
  )!;
}

async function openRoles(api: RoleSettingsApi): Promise<void> {
  await act(async () => {
    root.render(
      createElement(PstackConfigDialog, {
        roleApi: api,
        pluginApi: undefined,
        translations: translations(),
        onClose: () => {},
      }),
    );
  });
  await flush();
  await click(tab("Role models"));
}

describe("role drafts across tabs", () => {
  it("mounts roles lazily and keeps the edited draft when switching tabs", async () => {
    const controller = makeRoleApi();
    await act(async () => {
      root.render(
        createElement(PstackConfigDialog, {
          roleApi: controller.api,
          pluginApi: undefined,
          translations: translations(),
          onClose: () => {},
        }),
      );
    });
    await flush();

    // The roles tab is unvisited: no panel and no status call.
    expect(controller.statusCalls()).toBe(0);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);

    await click(tab("Role models"));
    expect(controller.statusCalls()).toBe(1);
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(2);

    const effort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    )!;
    await act(async () => {
      effort.value = "low";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(effort.value).toBe("low");

    await click(tab("Recommended plugins"));
    await click(tab("Role models"));

    const restored = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    )!;
    expect(restored.value).toBe("low");
    expect(controller.statusCalls()).toBe(1);
  });

  it("gives the visible panel the accessible name of its tab", async () => {
    await openRoles(makeRoleApi().api);
    const rolesTab = tab("Role models");
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[role="tabpanel"]')).filter(
      (panel) => !panel.hasAttribute("hidden"),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]!.getAttribute("aria-labelledby")).toBe(rolesTab.id);
    expect(rolesTab.getAttribute("aria-controls")).toBe(visible[0]!.id);
  });
});

describe("effort baseline hint", () => {
  it("shows a hint card under the budget bar that reasoning effort is a baseline", async () => {
    await openRoles(makeRoleApi().api);
    const card = document.querySelector(".pstack-effort-hint");
    expect(card?.textContent).toContain(catalogs.roles.en.effortBaselineHint);
  });
});

describe("clear as deletion", () => {
  it("edits an unconfigured role directly without adding a route", async () => {
    const controller = makeRoleApi();
    controller.api.status = async () => snapshotFor(false);
    await openRoles(controller.api);

    const card = document.querySelector<HTMLElement>(".pstack-role-card")!;
    const provider = card.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Provider"]',
    )!;
    expect(provider.value).toBe("__inherit__:inherit-parent");
    expect(buttonByText(card, "Add route")).toBeUndefined();
    expect(buttonByText(card, "Save").disabled).toBe(true);
    expect(card.textContent).toContain("Not configured");

    await act(async () => {
      provider.value = "cpa";
      provider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(provider.value).toBe("cpa");
    expect(card.querySelector<HTMLSelectElement>('select[aria-label="Bug fix Model"]')?.value).toBe(
      "model-a",
    );
    expect(buttonByText(card, "Save").disabled).toBe(false);
    expect(card.textContent).toContain("Not configured");

    await click(buttonByText(card, "Save"));
    expect(controller.saves).toEqual([
      { key: "bug-fix", routes: [{ kind: "route", provider: "cpa", model: "model-a" }] },
    ]);
    expect(card.textContent).toContain("Configured");
  });

  it("keeps one editable inherited row after Clear and saves routes: []", async () => {
    const controller = makeRoleApi();
    await openRoles(controller.api);

    const card = document.querySelector<HTMLElement>(".pstack-role-card")!;
    await click(buttonByText(card, "Clear"));

    expect(card.textContent).toContain("Saving removes this role's line.");
    const provider = card.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Provider"]',
    )!;
    expect(provider.value).toBe("__inherit__:inherit-parent");
    expect(buttonByText(card, "Clear").disabled).toBe(true);
    expect(buttonByText(card, "Add route")).toBeUndefined();

    await act(async () => {
      provider.value = "cpa";
      provider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(provider.value).toBe("cpa");
    expect(card.textContent).not.toContain("Saving removes this role's line.");
    expect(buttonByText(card, "Save").disabled).toBe(false);

    await click(buttonByText(card, "Clear"));
    await click(buttonByText(card, "Save"));

    expect(controller.saves).toEqual([{ key: "bug-fix", routes: [] }]);
    const saved = document.querySelector<HTMLElement>(".pstack-role-card")!;
    expect(saved.textContent).toContain("Not configured");
    expect(
      saved.querySelector<HTMLSelectElement>('select[aria-label="Bug fix Provider"]')?.value,
    ).toBe("__inherit__:inherit-parent");
    expect(saved.textContent).not.toContain("Saving removes this role's line.");
    expect(buttonByText(saved, "Clear").disabled).toBe(true);
    expect(buttonByText(saved, "Add route")).toBeUndefined();
  });

  it("clears a role whose configured line only inherits the parent", async () => {
    const controller = makeRoleApi();
    controller.api.status = async () => snapshotWithInheritedRole();
    await openRoles(controller.api);

    const card = document.querySelector<HTMLElement>(".pstack-role-card")!;
    expect(card.textContent).toContain("Configured");
    expect(buttonByText(card, "Clear").disabled).toBe(false);

    await click(buttonByText(card, "Clear"));
    expect(card.textContent).toContain("Saving removes this role's line.");
    expect(buttonByText(card, "Save").disabled).toBe(false);

    await click(buttonByText(card, "Save"));
    expect(controller.saves).toEqual([{ key: "bug-fix", routes: [] }]);
    const saved = document.querySelector<HTMLElement>(".pstack-role-card")!;
    expect(saved.textContent).toContain("Not configured");
    expect(buttonByText(saved, "Clear").disabled).toBe(true);
  });

  it("clears every configured role from Clear all when each line only inherits", async () => {
    const controller = makeRoleApi();
    controller.api.status = async () => snapshotWithInheritedRole("auto");
    await openRoles(controller.api);

    const clearAll = buttonByText(document.body, "Clear all");
    expect(clearAll.disabled).toBe(false);
    await click(clearAll);

    expect(buttonByText(document.body, "Save all (1)")).not.toBeNull();
    await click(buttonByText(document.body, "Save all (1)"));
    expect(controller.saves).toEqual([{ key: "bug-fix", routes: [] }]);
  });

  it("saves an explicitly chosen auto route instead of treating it as a clear", async () => {
    const controller = makeRoleApi();
    await openRoles(controller.api);

    const card = document.querySelector<HTMLElement>(".pstack-role-card")!;
    const provider = card.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Provider"]',
    )!;
    await act(async () => {
      provider.value = "__inherit__:auto";
      provider.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(card.textContent).not.toContain("Saving removes this role's line.");
    await click(buttonByText(card, "Save"));
    expect(controller.saves).toEqual([
      { key: "bug-fix", routes: [{ kind: "inherit", alias: "auto" }] },
    ]);
  });

  it("restores the baseline on reset instead of clearing", async () => {
    const controller = makeRoleApi();
    await openRoles(controller.api);
    const card = document.querySelector<HTMLElement>(".pstack-role-card")!;
    await click(buttonByText(card, "Clear"));
    await click(buttonByText(card, "Reset"));
    const effort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    );
    expect(effort?.value).toBe("high");
  });
});

describe("resetRoutes", () => {
  it("returns the inherited row for an unconfigured role", () => {
    const draft = draftOf(unconfiguredHillclimb());
    expect(draft.baseline).toEqual([]);
    expect(resetRoutes(draft)).toEqual([{ kind: "inherit", alias: "inherit-parent" }]);
  });

  it("copies the configured baseline instead of sharing it", () => {
    const draft = draftOf(bugFixRole(true));
    const routes = resetRoutes(draft);
    expect(routes).toEqual(draft.baseline.map((route) => ({ ...route })));
    expect(routes).not.toBe(draft.baseline);
    expect(routes[0]).not.toBe(draft.baseline[0]);
  });
});

describe("Reset all with an unconfigured role", () => {
  it("preserves the second role's editable inherited row", async () => {
    const controller = makeRoleApi();
    controller.api.status = async () => snapshotWithSecondUnconfiguredRole();
    await openRoles(controller.api);

    const cards = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>(".pstack-role-card"));
    expect(cards()).toHaveLength(2);
    expect(cards()[1]!.querySelectorAll(".pstack-route-row")).toHaveLength(1);

    const effort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    )!;
    await act(async () => {
      effort.value = "low";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    await click(buttonByText(document.body, "Reset all"));

    const second = cards()[1]!;
    expect(second.querySelectorAll(".pstack-route-row")).toHaveLength(1);
    expect(second.querySelector<HTMLSelectElement>("select")?.value).toBe(
      "__inherit__:inherit-parent",
    );
  });
});

describe("provider availability", () => {
  it("keeps every provider visible in the role editor and disables unusable ones", async () => {
    const controller = makeRoleApi();
    controller.api.catalogue = async () => catalogueWithUnusableProviders;
    await openRoles(controller.api);

    const card = document.querySelector<HTMLElement>(".pstack-role-card")!;
    const provider = card.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Provider"]',
    )!;
    const options = Array.from(provider.options);
    const byValue = (value: string): HTMLOptionElement =>
      options.find((option) => option.value === value)!;

    expect(byValue("deepseek").disabled).toBe(true);
    expect(byValue("deepseek").textContent).toContain("No models");
    expect(byValue("broken").disabled).toBe(true);
    expect(byValue("broken").textContent).toContain("Unavailable");
    expect(byValue("cpa").disabled).toBe(false);
  });

  it("keeps every provider visible in the budget dialog and disables unusable ones", async () => {
    const controller = makeRoleApi();
    controller.api.catalogue = async () => catalogueWithUnusableProviders;
    await openRoles(controller.api);
    await click(buttonByText(document.body, "Adjust budget"));

    const panel = document.querySelector<HTMLElement>(".pstack-budget-panel")!;
    const scope = Array.from(panel.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "unconfigured"),
    )!;
    await act(async () => {
      scope.value = "unconfigured";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    const provider = Array.from(panel.querySelectorAll<HTMLSelectElement>("select")).find(
      (select) => Array.from(select.options).some((option) => option.value === "deepseek"),
    )!;
    const byValue = (value: string): HTMLOptionElement =>
      Array.from(provider.options).find((option) => option.value === value)!;

    expect(provider.value).toBe("cpa");
    expect(byValue("deepseek").disabled).toBe(true);
    expect(byValue("deepseek").textContent).toContain("No models");
    expect(byValue("broken").disabled).toBe(true);
    expect(byValue("broken").textContent).toContain("Unavailable");
    expect(byValue("cpa").disabled).toBe(false);
  });

  it("shows a placeholder when no provider has a usable model", async () => {
    const controller = makeRoleApi();
    controller.api.catalogue = async () => ({
      truncated: false,
      providers: [{ provider: "deepseek", name: "DeepSeek", models: [] }],
    });
    await openRoles(controller.api);
    await click(buttonByText(document.body, "Adjust budget"));

    const panel = document.querySelector<HTMLElement>(".pstack-budget-panel")!;
    const scope = Array.from(panel.querySelectorAll<HTMLSelectElement>("select")).find((select) =>
      Array.from(select.options).some((option) => option.value === "unconfigured"),
    )!;
    await act(async () => {
      scope.value = "unconfigured";
      scope.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    const provider = Array.from(panel.querySelectorAll<HTMLSelectElement>("select")).find(
      (select) => Array.from(select.options).some((option) => option.value === "deepseek"),
    )!;
    expect(provider.disabled).toBe(true);
    expect(provider.textContent).toContain("No provider with a usable model");
  });
});

describe("budget dialog", () => {
  it("opens from the role page and renders a preview", async () => {
    await openRoles(makeRoleApi().api);
    await click(buttonByText(document.body, "Adjust budget"));
    expect(document.body.textContent).toContain("Reasoning budget");
    expect(document.body.textContent).toContain("Apply budget");
    expect(document.querySelector(".pstack-budget-panel")).not.toBeNull();
  });

  it("disables apply when the file already matches the budget", async () => {
    const snapshot = snapshotWithBudget();
    await openRoles({
      status: async () => snapshot,
      catalogue: async () => catalogue,
      save: async () => ({ ok: true, snapshot }),
      budget: async () => ({ ok: true, snapshot }),
    });
    await click(buttonByText(document.body, "Adjust budget"));
    expect(buttonByText(document.body, "Apply budget").disabled).toBe(true);
  });

  it("discards dirty drafts when opening the budget after confirmation", async () => {
    const controller = makeRoleApi();
    await openRoles(controller.api);
    const effort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    )!;
    await act(async () => {
      effort.value = "low";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();
    expect(buttonByText(document.body, "Save all (1)")).not.toBeNull();

    const original = window.confirm;
    try {
      window.confirm = () => true;
      await click(buttonByText(document.body, "Adjust budget"));
      await click(buttonByText(document.querySelector(".pstack-budget-panel")!, "Close"));
      expect(buttonByText(document.body, "Save all").disabled).toBe(true);
    } finally {
      window.confirm = original;
    }
  });
});

describe("bulk save feedback", () => {
  it("shows a temporary toast instead of an inline list message", async () => {
    const controller = makeRoleApi();
    await openRoles(controller.api);
    const effort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    )!;
    await act(async () => {
      effort.value = "low";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(buttonByText(document.body, "Save all (1)"));

    const toast = document.body.querySelector<HTMLElement>('[role="status"]')!;
    expect(toast.className).toBe("pstack-toast");
    expect(toast.parentElement).toBe(document.body);
    expect(toast.textContent).toBe("Saved 1 roles");
    expect(container.textContent).not.toContain("Saved 1 roles");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3100));
    });
    expect(document.body.querySelector(".pstack-toast")).toBeNull();
  }, 6000);
});

describe("unsaved-close confirmation", () => {
  it("keeps the dialog open when discard is declined and closes when accepted", async () => {
    const controller = makeRoleApi();
    const closes: number[] = [];
    await act(async () => {
      root.render(
        createElement(PstackConfigDialog, {
          roleApi: controller.api,
          pluginApi: undefined,
          translations: translations(),
          onClose: () => closes.push(1),
        }),
      );
    });
    await flush();
    await click(tab("Role models"));

    const effort = document.querySelector<HTMLSelectElement>(
      'select[aria-label="Bug fix Reasoning effort"]',
    )!;
    await act(async () => {
      effort.value = "low";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    const original = window.confirm;
    try {
      window.confirm = () => false;
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await flush();
      expect(closes).toHaveLength(0);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();

      window.confirm = () => true;
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      await flush();
      expect(closes).toHaveLength(1);
    } finally {
      window.confirm = original;
    }
  });
});

describe("dialog focus management", () => {
  it("traps Tab inside the panel and wraps in both directions", async () => {
    await openRoles(makeRoleApi().api);
    const panel = document.querySelector<HTMLElement>(".pstack-panel")!;
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.closest("[hidden]") === null,
    );
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    last.focus();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(first);

    first.focus();
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the Configure trigger on close", async () => {
    const Action = createPstackConfigAction(makeRoleApi().api, undefined, translations());
    await act(async () => {
      root.render(
        createElement(Action as never, {
          subject: { kind: "bundle", pkg: { name: "dsh-pstack" } },
        }),
      );
    });
    await flush();

    const configure = buttonByText(container, "Configure");
    await click(configure);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    const closeButton = document.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="Close"]',
    )!;
    await click(closeButton);
    await flush();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(configure);
  });
});

describe("remote adapter unwrap", () => {
  interface Harness {
    component: (props: unknown) => unknown;
    statusCalls: () => number;
  }

  async function mountThroughApply(
    status: () => Promise<{ ok: true; value: RoleFileSnapshot } | { ok: false; error: Error }>,
  ): Promise<Harness> {
    const dictionaries = new Map<string, Record<string, string>>();
    const registered: { name: string; component: unknown }[] = [];
    const slotHost = {
      inject: (_name: string, register: () => void) => register(),
      register: (options: { name: string }, component: unknown) => {
        registered.push({ name: options.name, component });
        return () => {};
      },
    };
    let statusCalls = 0;
    const pstackRoles = {
      status: async () => {
        statusCalls += 1;
        return status();
      },
      catalogue: async () => ({ ok: true as const, value: catalogue }),
      save: async () => ({ ok: true as const, value: { ok: false as const, reason: "no" } }),
    };
    const ctx = {
      remote: { $mount: async () => async () => {} },
      slots: slotHost,
      locale: {
        register: (namespace: string, value: Record<string, string>) => {
          dictionaries.set(namespace, value);
          return () => {};
        },
        bind: (namespace: string) => {
          const value = dictionaries.get(namespace);
          const flat =
            value !== undefined && typeof value === "object" && "en" in value
              ? (value as unknown as { en: Record<string, string> }).en
              : (value ?? {});
          return translator(flat);
        },
      },
      effect: (callback: () => unknown) => callback(),
      inject: (_deps: string[], callback: (scope: unknown) => void) => {
        callback({ remote: { pstackRoles }, slots: slotHost });
        return () => {};
      },
    } as unknown as Context;
    await apply(ctx);
    const action = registered.find((entry) => entry.name === "plugins.detail.actions");
    return {
      component: action!.component as (props: unknown) => unknown,
      statusCalls: () => statusCalls,
    };
  }

  it("returns the decoded value instead of discarding it", async () => {
    const harness = await mountThroughApply(async () => ({ ok: true, value: snapshotFor() }));
    const Component = harness.component;
    await act(async () => {
      root.render(
        createElement(Component as never, {
          subject: { kind: "bundle", pkg: { name: "dsh-pstack" } },
        }),
      );
    });
    await flush();
    await click(buttonByText(container, "Configure"));
    await click(tab("Role models"));

    expect(harness.statusCalls()).toBe(1);
    expect(document.body.textContent).toContain("Bug fix");
  });

  it("surfaces the carrier error when the envelope is not ok", async () => {
    const harness = await mountThroughApply(async () => ({
      ok: false,
      error: new Error("remote exploded"),
    }));
    const Component = harness.component;
    await act(async () => {
      root.render(
        createElement(Component as never, {
          subject: { kind: "bundle", pkg: { name: "dsh-pstack" } },
        }),
      );
    });
    await flush();
    await click(buttonByText(container, "Configure"));
    await click(tab("Role models"));

    expect(document.body.textContent).toContain("remote exploded");
  });

  it("keeps the recommendation tab available with a clear error when plugin manager is absent", async () => {
    const harness = await mountThroughApply(async () => ({ ok: true, value: snapshotFor() }));
    const Component = harness.component;
    await act(async () => {
      root.render(
        createElement(Component as never, {
          subject: { kind: "bundle", pkg: { name: "dsh-pstack" } },
        }),
      );
    });
    await flush();
    await click(buttonByText(container, "Configure"));

    expect(document.body.textContent).toContain("Could not read plugin status");
    expect(document.body.textContent).toContain("Plugin manager unavailable");
    expect(document.body.textContent).not.toContain("plugin manager is not available yet");
  });
});
