import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { parseLegacyRoute as parseRoute } from "../compat/legacy-route.ts";
import { findRole } from "../roles/role-manifest.ts";
import { parseRoleConfiguration, readRoleConfiguration } from "../roles/role-store.ts";

const directories: string[] = [];

function homeWithRoles(document: Record<string, unknown> | undefined): string {
  const directory = mkdtempSync(join(tmpdir(), "pstack-roles-"));
  directories.push(directory);
  if (document !== undefined) {
    writeFileSync(join(directory, "pstack-models.json"), `${JSON.stringify(document, null, 2)}\n`);
  }
  return directory;
}

function jsonPath(directory: string): string {
  return join(directory, "pstack-models.json");
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("role manifest, parser, and route selection", () => {
  it("keeps commas that belong to a role key", () => {
    expect(findRole("feature, refactoring")?.key).toBe("feature, refactoring");
    expect(findRole("  FEATURE ,  REFACTORING ")?.key).toBe("feature, refactoring");
  });

  it("parses an exact route with an effort token", () => {
    expect(parseRoute("provider/model [high]").route).toEqual({
      kind: "route",
      provider: "provider",
      model: "model",
      effort: "high",
    });
    expect(parseRoute("inherit-parent").route).toEqual({
      kind: "inherit",
      alias: "inherit-parent",
    });
    expect(parseRoute("AUTO").route).toEqual({ kind: "inherit", alias: "auto" });
  });

  it("rejects whitespace in provider, model, or effort", () => {
    expect(parseRoute("provider name/model").route).toBeUndefined();
    expect(parseRoute("provider/model name").route).toBeUndefined();
    expect(parseRoute("provider/model [high tier]").route).toBeUndefined();
  });

  it("parses a JSON document into budget and role routes", () => {
    const parsed = parseRoleConfiguration(
      JSON.stringify({
        version: 2,
        budget: "large (xhigh)",
        roles: {
          "bug-fix": [{ kind: "route", provider: "provider", model: "model", effort: "high" }],
          "arena runners": [
            { kind: "route", provider: "provider", model: "a", effort: "high" },
            { kind: "route", provider: "provider", model: "b", effort: "low" },
          ],
        },
      }),
      "/home/user/.dsh/pstack-models.json",
    );
    expect(parsed.status).toBe("loaded");
    if (parsed.status !== "loaded") return;
    expect(parsed.budget).toBe("large (xhigh)");
    expect(parsed.roles.get("bug-fix")?.routes[0]).toMatchObject({
      model: "model",
      effort: "high",
    });
    expect(parsed.roles.get("arena runners")?.routes).toHaveLength(2);
    expect(parsed.issues).toEqual([]);
  });

  it("reports unknown roles and malformed routes without inventing line numbers", () => {
    const parsed = parseRoleConfiguration(
      JSON.stringify({
        version: 2,
        roles: { "bug-fix": [{ kind: "route", provider: "" }], "retired role": [] },
      }),
      "/x",
    );
    expect(parsed.status).toBe("loaded");
    if (parsed.status !== "loaded") return;
    const messages = parsed.issues.map((issue) => issue.message);
    expect(messages).toContain("bug-fix: entry 1 provider must be a non-empty string");
    expect(messages).toContain('unknown pstack role "retired role"');
  });

  it("rejects an unsupported document version", () => {
    expect(() => parseRoleConfiguration(JSON.stringify({ version: 3, roles: {} }), "/x")).toThrow(
      /version/,
    );
    expect(() => parseRoleConfiguration("not json", "/x")).toThrow();
  });

  it("distinguishes a missing file from an unreadable path", () => {
    expect(readRoleConfiguration(jsonPath(homeWithRoles(undefined))).status).toBe("missing");
    expect(readRoleConfiguration(homeWithRoles(undefined)).status).toBe("unreadable");
  });
});

describe("legacy role file migration", () => {
  it("migrates an mdc file to json and removes the mdc when json is missing", () => {
    const directory = homeWithRoles(undefined);
    const legacy = join(directory, "pstack-models.mdc");
    writeFileSync(legacy, "# budget: large (xhigh)\nbug-fix: cpa/model-a [high]\n");
    const config = readRoleConfiguration(jsonPath(directory));
    expect(config.status).toBe("loaded");
    if (config.status !== "loaded") return;
    expect(config.budget).toBe("large (xhigh)");
    expect(config.roles.get("bug-fix")?.routes[0]).toMatchObject({ model: "model-a" });
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(jsonPath(directory))).toBe(true);
    expect(JSON.parse(readFileSync(jsonPath(directory), "utf8"))).toMatchObject({
      version: 2,
      budget: "large (xhigh)",
      roles: {
        "bug-fix": [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      },
    });
  });

  it("prefers json and keeps the mdc when both exist", () => {
    const directory = homeWithRoles({ version: 1, roles: { "bug-fix": ["json/model [low]"] } });
    const legacy = join(directory, "pstack-models.mdc");
    writeFileSync(legacy, "bug-fix: mdc/model [high]\n");
    const config = readRoleConfiguration(jsonPath(directory));
    expect(config.status).toBe("loaded");
    if (config.status !== "loaded") return;
    expect(config.roles.get("bug-fix")?.routes[0]).toMatchObject({ model: "model" });
    expect(config.roles.get("bug-fix")?.routes[0]).toMatchObject({ provider: "json" });
    expect(existsSync(legacy)).toBe(true);
  });

  it("upgrades a version 1 JSON document in place before reading", () => {
    const directory = homeWithRoles({ version: 1, roles: { "bug-fix": ["cpa/model-a [high]"] } });
    const config = readRoleConfiguration(jsonPath(directory));
    expect(config.status).toBe("loaded");
    const raw = JSON.parse(readFileSync(jsonPath(directory), "utf8")) as {
      version: number;
      roles: Record<string, unknown>;
    };
    expect(raw.version).toBe(2);
    expect(raw.roles["bug-fix"]).toEqual([
      { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
    ]);
  });

  it("drops retired roles and migrates the unlimited budget on read", () => {
    const directory = homeWithRoles({
      version: 2,
      budget: "unlimited (max)",
      roles: {
        "bug-fix": [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
        "hardest tasks": [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      },
    });
    const config = readRoleConfiguration(jsonPath(directory));
    expect(config.status).toBe("loaded");
    if (config.status !== "loaded") return;
    expect(config.budget).toBe("large (xhigh)");
    expect(config.roles.has("hardest tasks")).toBe(false);
    expect(config.issues).toEqual([]);
    const raw = JSON.parse(readFileSync(jsonPath(directory), "utf8")) as {
      budget?: string;
      roles: Record<string, unknown>;
    };
    expect(raw.budget).toBe("large (xhigh)");
    expect(raw.roles["hardest tasks"]).toBeUndefined();
    expect(raw.roles["bug-fix"]).toBeDefined();
  });

  it("is missing when neither file exists", () => {
    expect(readRoleConfiguration(jsonPath(homeWithRoles(undefined))).status).toBe("missing");
  });
});
