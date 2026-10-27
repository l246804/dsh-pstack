import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vite-plus/test";

import {
  AUTO_PANEL_ROLE_KEYS,
  BUDGET_TIERS,
  ROLE_KEYS,
  findRoleSpec,
  renderPstackModelsExample,
} from "../src/role-manifest.ts";
import {
  RouteSelectionError,
  modelsFilePath,
  parseRoleFile,
  parseRoute,
  parseRouteValue,
  readRoleFile,
  resolveDshHome,
  selectRoleRoutes,
  type RoleFileEntry,
} from "../src/models.ts";
import {
  RoleNameError,
  lookupRole,
  normalizeRoleName,
  requireRole,
  suggestRoles,
} from "../src/roles.ts";

const tempRoots: string[] = [];

afterAll(() => {
  for (const directory of tempRoots) rmSync(directory, { recursive: true, force: true });
});

function temporaryHome(): string {
  const path = mkdtempSync(join(tmpdir(), "dsh-pstack-roles-"));
  tempRoots.push(path);
  return path;
}

function loadedFile(text: string) {
  const state = parseRoleFile(text, "/tmp/pstack-models.md");
  if (state.status !== "loaded") throw new Error(`expected a loaded file, got ${state.status}`);
  return state;
}

function roleEntry(text: string, key: string): RoleFileEntry | undefined {
  return loadedFile(text).roles.get(key);
}

describe("role manifest", () => {
  it("holds the 17 design keys exactly once each", () => {
    expect(ROLE_KEYS).toHaveLength(17);
    expect(new Set(ROLE_KEYS).size).toBe(17);
    expect(ROLE_KEYS).toEqual([
      "feature, refactoring",
      "bug-fix",
      "perf-issue",
      "hillclimb",
      "judgment and prose",
      "hardest tasks",
      "how explorer",
      "how explainer",
      "why investigators",
      "why synthesizer",
      "reflect tooling",
      "reflect judgment, divergent, synthesizer",
      "arena runners",
      "arena cross-judge pool",
      "swarm workers",
      "architect runners",
      "interrogate reviewers",
    ]);
  });

  it("names exactly the three automatic panels", () => {
    expect(AUTO_PANEL_ROLE_KEYS).toEqual([
      "arena runners",
      "architect runners",
      "interrogate reviewers",
    ]);
    const crossJudge = findRoleSpec("arena cross-judge pool");
    expect(crossJudge?.shape).toBe("list");
    expect(crossJudge?.autoPanel).toBe(false);
    // `swarm workers` is list-valued so one race arm can pick another entry, but
    // it is not an automatic panel: the caller still starts one worker per call.
    expect(findRoleSpec("swarm workers")?.shape).toBe("list");
    expect(findRoleSpec("swarm workers")?.autoPanel).toBe(false);
    expect(AUTO_PANEL_ROLE_KEYS).not.toContain("swarm workers");
  });

  it("keeps the four budget tiers the setup skill offers", () => {
    expect(BUDGET_TIERS.map((tier) => tier.label)).toEqual([
      "unlimited",
      "large",
      "medium",
      "small",
    ]);
    expect(BUDGET_TIERS.map((tier) => tier.effort)).toEqual(["max", "xhigh", "high", "medium"]);
  });

  it("renders an example with one line per role and no model ids", () => {
    const example = renderPstackModelsExample();
    for (const key of ROLE_KEYS) {
      expect(example.split(`\n${key}: `).length - 1, key).toBe(1);
    }
    expect(example).not.toContain("claude-");
    expect(example).not.toContain("grok-");
  });
});

describe("role lookup", () => {
  it("normalizes case, whitespace, and comma spacing but nothing else", () => {
    expect(normalizeRoleName("  How   Explorer ")).toBe("how explorer");
    expect(normalizeRoleName("feature,refactoring")).toBe("feature, refactoring");
    expect(normalizeRoleName("feature ,  refactoring:")).toBe("feature, refactoring");
    expect(normalizeRoleName("arena-runners")).toBe("arena-runners");
  });

  it("finds a role by its exact normalized key", () => {
    expect(lookupRole("Arena Runners")?.key).toBe("arena runners");
    expect(lookupRole("feature,refactoring")?.key).toBe("feature, refactoring");
    expect(lookupRole("reflect judgment, divergent, synthesizer")?.shape).toBe("single");
  });

  it("never splits a comma key into separate roles", () => {
    expect(lookupRole("feature")).toBeUndefined();
    expect(lookupRole("refactoring")).toBeUndefined();
    expect(lookupRole("reflect judgment")).toBeUndefined();
    expect(lookupRole("divergent")).toBeUndefined();
  });

  it("hints near misses without guessing", () => {
    expect(suggestRoles("arena runner")).toContain("arena runners");
    expect(suggestRoles("how explore")).toContain("how explorer");
    expect(suggestRoles("swarm worker")).toContain("swarm workers");

    expect(() => requireRole("arena runner")).toThrow(RoleNameError);
    try {
      requireRole("arena runner");
    } catch (error) {
      expect((error as Error).message).toContain("arena runners");
      expect((error as Error).message).toContain("unknown pstack role");
    }
  });

  it("gives no hint for a name that resembles nothing", () => {
    expect(suggestRoles("zzzzzzzzzz")).toEqual([]);
    expect(() => requireRole("zzzzzzzzzz")).toThrow(/No role key is close/);
  });
});

describe("route values", () => {
  it("parses the parent-inheritance aliases", () => {
    expect(parseRouteValue("inherit-parent").routes).toEqual([{ kind: "inherit" }]);
    expect(parseRouteValue("AUTO").routes).toEqual([{ kind: "inherit" }]);
  });

  it("parses an exact route and an exact route with effort", () => {
    expect(parseRouteValue("local/model-a [xhigh]").routes).toEqual([
      { kind: "route", provider: "local", model: "model-a", effort: "xhigh" },
    ]);
    expect(parseRouteValue("local/model-a").routes).toEqual([
      { kind: "route", provider: "local", model: "model-a" },
    ]);
  });

  it("keeps a slash inside the model id by splitting at the first one", () => {
    expect(parseRouteValue("gateway/vendor-a/model-x [max]").routes).toEqual([
      { kind: "route", provider: "gateway", model: "vendor-a/model-x", effort: "max" },
    ]);
    expect(parseRouteValue("gateway/vendor-a/model-x").routes).toEqual([
      { kind: "route", provider: "gateway", model: "vendor-a/model-x" },
    ]);
    const panel = parseRouteValue("gateway/vendor-a/model-x [high], gateway/vendor-b/model-y");
    expect(panel.issues).toEqual([]);
    expect(panel.routes).toEqual([
      { kind: "route", provider: "gateway", model: "vendor-a/model-x", effort: "high" },
      { kind: "route", provider: "gateway", model: "vendor-b/model-y" },
    ]);
  });

  it("rejects an empty segment inside the model id", () => {
    // Letting `/` into the model also let the old character class accept `//`, a
    // trailing `vendor/`, and `vendor//model`. None of those is a route an adapter
    // serves, and accepting one moves the failure off this line, which reports with
    // a line number, and onto the first delegation's preflight.
    for (const value of ["gateway//model-x", "gateway/vendor-a/", "gateway/vendor-a//model-x"]) {
      const parsed = parseRouteValue(value);
      expect(parsed.routes, value).toEqual([]);
      expect(parsed.issues.length, value).toBeGreaterThan(0);
    }
  });

  it("still rejects a value that names no provider or no model", () => {
    for (const value of ["/model-a", "local/", "gateway/"]) {
      const parsed = parseRouteValue(value);
      expect(parsed.routes, value).toEqual([]);
      expect(parsed.issues.length, value).toBeGreaterThan(0);
    }
  });

  it("parses a panel list and keeps every entry", () => {
    const parsed = parseRouteValue("local/a [max], inherit-parent, vendor/b");
    expect(parsed.issues).toEqual([]);
    expect(parsed.routes).toEqual([
      { kind: "route", provider: "local", model: "a", effort: "max" },
      { kind: "inherit" },
      { kind: "route", provider: "vendor", model: "b" },
    ]);
  });

  it("rejects an empty effort bracket with a usable message", () => {
    const parsed = parseRouteValue("local/model-a []");
    expect(parsed.routes).toEqual([]);
    expect(parsed.issues.join("\n")).toContain("empty brackets");
  });

  it("rejects a malformed value instead of inventing a route", () => {
    for (const value of ["model-a", "local/", "/model-a", "local/model-a [two words]"]) {
      const parsed = parseRouteValue(value);
      expect(parsed.routes, value).toEqual([]);
      expect(parsed.issues.length, value).toBeGreaterThan(0);
    }
  });

  it("tolerates a trailing comma but reports a hole in the middle", () => {
    expect(parseRouteValue("inherit-parent,").routes).toHaveLength(1);
    const holed = parseRouteValue("inherit-parent,,inherit-parent");
    expect(holed.routes).toHaveLength(2);
    expect(holed.issues.join("\n")).toContain("entry 2 of the list is empty");
  });

  it("reports an empty value", () => {
    const parsed = parseRouteValue("   ");
    expect(parsed.routes).toEqual([]);
    expect(parsed.issues.join("\n")).toContain("the value is empty");
  });

  it("keeps an unknown effort token so the adapter preflight can judge it", () => {
    const parsed = parseRoute("local/model-a [ultra]");
    expect(parsed.issue).toBeUndefined();
    expect(parsed.route).toEqual({
      kind: "route",
      provider: "local",
      model: "model-a",
      effort: "ultra",
    });
  });
});

describe("role file parsing", () => {
  it("records the budget line and the configured roles", () => {
    const state = loadedFile(
      ["# pstack model configuration", "# budget: large (xhigh)", "bug-fix: local/model-a [xhigh]"].join(
        "\n",
      ),
    );
    expect(state.budget).toBe("large (xhigh)");
    expect(roleEntry("# budget: large (xhigh)\nbug-fix: local/model-a", "bug-fix")?.routes).toEqual([
      { kind: "route", provider: "local", model: "model-a" },
    ]);
  });

  it("ignores an optional frontmatter block", () => {
    const state = loadedFile(["---", "description: mine", "---", "bug-fix: inherit-parent"].join("\n"));
    expect(state.issues).toEqual([]);
    expect(state.roles.size).toBe(1);
  });

  it("reports a misspelled key with near misses and does not configure it", () => {
    const state = loadedFile("how explore: local/model-a");
    expect(state.roles.size).toBe(0);
    expect(state.issues[0]?.line).toBe(1);
    expect(state.issues[0]?.message).toContain("unknown role");
    expect(state.issues[0]?.message).toContain("how explorer");
  });

  it("reports a retired role instead of dropping it silently", () => {
    const state = loadedFile("how critics: local/model-a");
    expect(state.roles.size).toBe(0);
    expect(state.issues[0]?.message).toContain("retired or misspelled");
  });

  it("keeps the last duplicate and reports the override", () => {
    const state = loadedFile(["bug-fix: local/a", "bug-fix: local/b"].join("\n"));
    expect(state.roles.get("bug-fix")?.rawValue).toBe("local/b");
    expect(state.issues.map((issue) => issue.message).join("\n")).toContain("line 2 wins");
  });

  it("reports a line without a separator", () => {
    const state = loadedFile("bug-fix local/a");
    expect(state.roles.size).toBe(0);
    expect(state.issues[0]?.message).toContain("expected `<role>: <value>`");
  });
});

describe("role file states", () => {
  it("distinguishes a missing file from an unreadable one", () => {
    const home = temporaryHome();
    expect(readRoleFile(modelsFilePath(home))).toEqual({
      status: "missing",
      path: modelsFilePath(home),
    });

    // A directory where the file should be is not "no configuration".
    mkdirSync(modelsFilePath(home));
    const unreadable = readRoleFile(modelsFilePath(home));
    expect(unreadable.status).toBe("unreadable");
    if (unreadable.status === "unreadable") {
      expect(unreadable.reason).toContain("EISDIR");
    }
  });

  it("reads a written file back", () => {
    const home = temporaryHome();
    writeFileSync(modelsFilePath(home), "bug-fix: local/model-a [max]\n", "utf8");
    const state = readRoleFile(modelsFilePath(home));
    expect(state.status).toBe("loaded");
    if (state.status === "loaded") {
      expect(state.roles.get("bug-fix")?.routes).toEqual([
        { kind: "route", provider: "local", model: "model-a", effort: "max" },
      ]);
    }
  });

  it("resolves DSH_HOME from the environment, then the home directory", () => {
    expect(resolveDshHome({ DSH_HOME: "/custom" }, "/home/user")).toBe("/custom");
    expect(resolveDshHome({ DSH_HOME: "  " }, "/home/user")).toBe("/home/user/.dsh");
    expect(resolveDshHome({}, "/home/user")).toBe("/home/user/.dsh");
  });
});

describe("route selection", () => {
  const panel = findRoleSpec("arena runners") as NonNullable<ReturnType<typeof findRoleSpec>>;
  const pool = findRoleSpec("arena cross-judge pool") as NonNullable<
    ReturnType<typeof findRoleSpec>
  >;
  const single = findRoleSpec("bug-fix") as NonNullable<ReturnType<typeof findRoleSpec>>;

  it("inherits the parent route when the role has no line", () => {
    const selection = selectRoleRoutes(single, undefined, undefined);
    expect(selection.configured).toBe(false);
    expect(selection.routes).toEqual([{ kind: "inherit" }]);
    expect(selection.mode).toBe("single");
  });

  it("expands an automatic panel to one route per entry", () => {
    const entry = roleEntry("arena runners: local/a, vendor/b", "arena runners");
    const selection = selectRoleRoutes(panel, entry, undefined);
    expect(selection.mode).toBe("panel");
    expect(selection.routes).toHaveLength(2);
  });

  it("rejects roleIndex on an automatic panel", () => {
    const entry = roleEntry("arena runners: local/a, vendor/b", "arena runners");
    expect(() => selectRoleRoutes(panel, entry, 1)).toThrow(RouteSelectionError);
    expect(() => selectRoleRoutes(panel, entry, 1)).toThrow(/automatic panel/);
  });

  it("selects one entry of a list role that is not a panel", () => {
    const entry = roleEntry(
      "arena cross-judge pool: local/a, vendor/b, vendor/c",
      "arena cross-judge pool",
    );
    const first = selectRoleRoutes(pool, entry, undefined);
    expect(first.mode).toBe("selected");
    expect(first.routes).toEqual([{ kind: "route", provider: "local", model: "a" }]);

    const third = selectRoleRoutes(pool, entry, 2);
    expect(third.routes).toEqual([{ kind: "route", provider: "vendor", model: "c" }]);
    expect(third.roleIndex).toBe(2);
  });

  it("reports an out-of-range roleIndex with the valid indexes", () => {
    const entry = roleEntry("arena cross-judge pool: local/a, vendor/b", "arena cross-judge pool");
    expect(() => selectRoleRoutes(pool, entry, 2)).toThrow(/out of range/);
    expect(() => selectRoleRoutes(pool, entry, 2)).toThrow(/valid indexes are 0, 1/);
  });

  it("rejects roleIndex on a single-valued role", () => {
    const entry = roleEntry("bug-fix: local/a", "bug-fix");
    expect(() => selectRoleRoutes(single, entry, 0)).toThrow(/holds a single route/);
  });
});
