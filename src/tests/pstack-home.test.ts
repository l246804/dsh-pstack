import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { EMPTY_SETTINGS, readSettings } from "../poteto/settings.ts";
import { migratePstackHome } from "../compat/migrate-pstack-home.ts";
import { pstackHomePaths } from "../pstack/home.ts";
import { snapshotFromConfiguration } from "../roles/role-editor.ts";
import { readRoleConfiguration } from "../roles/role-store.ts";

const directories: string[] = [];

function tempHome(): string {
  const directory = mkdtempSync(join(tmpdir(), "pstack-home-"));
  directories.push(directory);
  return directory;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const route = { kind: "route" as const, provider: "cpa", model: "model-a", effort: "high" };

describe("migratePstackHome", () => {
  it("moves a legacy-only home onto the current layout and leaves the repair file alone", () => {
    const home = tempHome();
    writeJson(join(home, "pstack-models.json"), { version: 2, roles: { "bug-fix": [route] } });
    writeJson(join(home, "pstack-settings.json"), { version: 1, potetoDefault: true });
    const legacyRepair = `${JSON.stringify({ version: 1, createdAt: 1, sessionIds: ["s1"] })}\n`;
    writeFile(join(home, "pstack-repair.json"), legacyRepair);

    migratePstackHome(home);

    expect(existsSync(pstackHomePaths(home).models)).toBe(true);
    expect(existsSync(pstackHomePaths(home).settings)).toBe(true);
    expect(readSettings(pstackHomePaths(home).settings)).toEqual({
      potetoDefault: true,
    });
    expect(existsSync(join(home, "pstack-models.json"))).toBe(false);
    expect(existsSync(join(home, "pstack-settings.json"))).toBe(false);
    expect(readFileSync(join(home, "pstack-repair.json"), "utf8")).toBe(legacyRepair);
    expect(existsSync(pstackHomePaths(home).repair)).toBe(false);
    expect(readdirSync(home).sort()).toEqual(["pstack", "pstack-repair.json"]);
    expect(readdirSync(pstackHomePaths(home).root).sort()).toEqual([
      "models.json",
      "settings.json",
    ]);
  });

  it("upgrades a version 1 pstack-models.json to version 2 in the pstack directory", () => {
    const home = tempHome();
    writeJson(join(home, "pstack-models.json"), {
      version: 1,
      roles: { "bug-fix": ["cpa/model-a [high]"] },
    });

    migratePstackHome(home);

    expect(existsSync(join(home, "pstack-models.json"))).toBe(false);
    const raw = JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.roles["bug-fix"]).toEqual([route]);
  });

  it("migrates a legacy pstack-models.mdc to version 2 models.json and removes the mdc", () => {
    const home = tempHome();
    writeFile(
      join(home, "pstack-models.mdc"),
      "# budget: large (xhigh)\nbug-fix: cpa/model-a [high]\n",
    );

    migratePstackHome(home);

    expect(existsSync(join(home, "pstack-models.mdc"))).toBe(false);
    const raw = JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.budget).toBe("large (xhigh)");
    expect(raw.roles["bug-fix"]).toEqual([route]);
    expect(existsSync(join(pstackHomePaths(home).root, "models.mdc.bak"))).toBe(false);
  });

  it("strips the Cursor frontmatter from a documented mdc file", () => {
    const home = tempHome();
    writeFile(
      join(home, "pstack-models.mdc"),
      [
        "---",
        "description: pstack per-role model choices (overrides skill defaults)",
        "alwaysApply: true",
        "---",
        "# pstack model configuration. One line per role.",
        "# budget: large (xhigh)",
        "bug-fix: cpa/model-a [high]",
        "arena runners: cpa/model-a [high], cpa/model-b [low]",
        "",
      ].join("\n"),
    );

    migratePstackHome(home);

    const raw = JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.budget).toBe("large (xhigh)");
    expect(raw.roles["bug-fix"]).toEqual([route]);
    expect(raw.roles["arena runners"]).toEqual([
      route,
      { kind: "route", provider: "cpa", model: "model-b", effort: "low" },
    ]);
  });

  it("upgrades a version 1 models.json at startup", () => {
    const home = tempHome();
    writeJson(pstackHomePaths(home).models, {
      version: 1,
      roles: { "bug-fix": ["cpa/model-a [high]"] },
    });

    migratePstackHome(home);

    const raw = JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.roles["bug-fix"]).toEqual([route]);
  });

  it("keeps the current settings.json when a legacy settings file also exists", () => {
    const home = tempHome();
    writeJson(pstackHomePaths(home).settings, { version: 1, potetoDefault: false });
    writeJson(join(home, "pstack-settings.json"), { version: 1, potetoDefault: true });

    migratePstackHome(home);

    expect(readSettings(pstackHomePaths(home).settings).potetoDefault).toBe(false);
    expect(existsSync(join(home, "pstack-settings.json"))).toBe(true);
  });

  it("keeps the current file and leaves a legacy sibling untouched when both exist", () => {
    const home = tempHome();
    const current = { version: 2, roles: { "bug-fix": [{ ...route, model: "new" }] } };
    writeJson(pstackHomePaths(home).models, current);
    const legacyMdc = "bug-fix: cpa/old [high]\n";
    writeFile(join(home, "pstack-models.mdc"), legacyMdc);

    migratePstackHome(home);

    expect(JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"))).toEqual(current);
    expect(readFileSync(join(home, "pstack-models.mdc"), "utf8")).toBe(legacyMdc);
  });

  it("keeps a legacy mdc when a legacy JSON file wins", () => {
    const home = tempHome();
    const legacy = { version: 2, roles: { "bug-fix": [{ ...route, model: "json" }] } };
    const legacyMdc = "bug-fix: cpa/mdc [high]\n";
    writeJson(join(home, "pstack-models.json"), legacy);
    writeFile(join(home, "pstack-models.mdc"), legacyMdc);

    migratePstackHome(home);

    expect(JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"))).toEqual(legacy);
    expect(readFileSync(join(home, "pstack-models.mdc"), "utf8")).toBe(legacyMdc);
  });

  it("keeps the current models.json when a legacy JSON file also exists", () => {
    const home = tempHome();
    const current = { version: 2, roles: { "bug-fix": [{ ...route, model: "new" }] } };
    const legacy = { version: 2, roles: { "bug-fix": [{ ...route, model: "old" }] } };
    writeJson(pstackHomePaths(home).models, current);
    writeJson(join(home, "pstack-models.json"), legacy);

    migratePstackHome(home);

    expect(JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"))).toEqual(current);
    expect(existsSync(join(home, "pstack-models.json"))).toBe(true);
  });

  it("ignores a malformed legacy mdc and still migrates settings", () => {
    const home = tempHome();
    writeFile(join(home, "pstack-models.mdc"), "not a role line\n");
    writeJson(join(home, "pstack-settings.json"), { version: 1, potetoDefault: true });

    migratePstackHome(home);

    expect(existsSync(pstackHomePaths(home).models)).toBe(false);
    expect(existsSync(join(home, "pstack-models.mdc"))).toBe(true);
    expect(readSettings(pstackHomePaths(home).settings).potetoDefault).toBe(true);
  });

  it("is idempotent across repeated runs", () => {
    const home = tempHome();
    writeJson(join(home, "pstack-models.json"), { version: 1, roles: { "bug-fix": [route] } });
    writeJson(join(home, "pstack-settings.json"), { version: 1, potetoDefault: true });

    migratePstackHome(home);
    const models = readFileSync(pstackHomePaths(home).models, "utf8");
    const settings = readFileSync(pstackHomePaths(home).settings, "utf8");
    migratePstackHome(home);

    expect(readFileSync(pstackHomePaths(home).models, "utf8")).toBe(models);
    expect(readFileSync(pstackHomePaths(home).settings, "utf8")).toBe(settings);
  });

  it("treats an empty home as a clean first run", () => {
    const home = tempHome();
    migratePstackHome(home);
    expect(readdirSync(home)).toEqual([]);
  });

  it("sanitizes retired roles in an already-current models.json at startup", () => {
    const home = tempHome();
    writeJson(pstackHomePaths(home).models, {
      version: 2,
      roles: { "bug-fix": [route], "hardest tasks": [route] },
    });

    migratePstackHome(home);

    const raw = JSON.parse(readFileSync(pstackHomePaths(home).models, "utf8"));
    expect(raw.roles["hardest tasks"]).toBeUndefined();
    expect(raw.roles["bug-fix"]).toEqual([route]);
  });

  it("leaves corrupt legacy role JSON at the root and keeps roles saveable", () => {
    const home = tempHome();
    writeFile(join(home, "pstack-models.json"), "{ not valid json");
    writeJson(join(home, "pstack-settings.json"), { version: 1, potetoDefault: true });

    migratePstackHome(home);

    const configuration = readRoleConfiguration(pstackHomePaths(home).models);
    expect(configuration.status).toBe("missing");
    expect(snapshotFromConfiguration(configuration).canSave).toBe(true);
    expect(existsSync(join(home, "pstack-models.json"))).toBe(true);
    expect(readSettings(pstackHomePaths(home).settings).potetoDefault).toBe(true);
  });

  it("falls back to defaults for corrupt settings", () => {
    const home = tempHome();
    writeFile(join(home, "pstack-settings.json"), "{ not valid json");

    migratePstackHome(home);

    expect(readSettings(pstackHomePaths(home).settings)).toEqual(EMPTY_SETTINGS);
  });

  it("keeps two DSH home directories independent", () => {
    const homeA = tempHome();
    const homeB = tempHome();
    writeJson(join(homeA, "pstack-models.json"), {
      version: 2,
      roles: { "bug-fix": [{ ...route, model: "a" }] },
    });
    writeJson(join(homeB, "pstack-models.json"), {
      version: 2,
      roles: { "bug-fix": [{ ...route, model: "b" }] },
    });

    migratePstackHome(homeA);
    migratePstackHome(homeB);

    expect(
      JSON.parse(readFileSync(pstackHomePaths(homeA).models, "utf8")).roles["bug-fix"],
    ).toEqual([{ ...route, model: "a" }]);
    expect(
      JSON.parse(readFileSync(pstackHomePaths(homeB).models, "utf8")).roles["bug-fix"],
    ).toEqual([{ ...route, model: "b" }]);
    expect(existsSync(join(homeA, "pstack-settings.json"))).toBe(false);
  });
});
