import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import type { CatalogueResult } from "../src/models.ts";
import {
  parseRoleConfiguration,
  modelsFilePath,
  readRoleConfiguration,
} from "../src/internal/role-config.ts";
import {
  renderRoleValue,
  saveRoleConfiguration,
  snapshotFromConfiguration,
  updateRoleText,
  validateSaveRequest,
} from "../src/internal/role-editor.ts";

const directories: string[] = [];

function home(text?: string): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "pstack-role-editor-"));
  directories.push(directory);
  const path = modelsFilePath(directory);
  if (text !== undefined) writeFileSync(path, text);
  return { directory, path };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const catalogue: CatalogueResult = {
  truncated: false,
  providers: [
    {
      provider: "cpa",
      name: "CPA",
      models: [
        {
          route: "cpa/model-a",
          id: "model-a",
          name: "Model A",
          efforts: ["low", "high"],
          defaultEffort: "high",
        },
        { route: "cpa/model-b", id: "model-b", name: "Model B", efforts: [] },
      ],
    },
    { provider: "broken", name: "Broken", models: [], error: "adapter went away" },
  ],
};

describe("role file snapshot", () => {
  it("shows all 17 manifest roles in order for a missing file", () => {
    const { path } = home();
    const snapshot = snapshotFromConfiguration(readRoleConfiguration(path));
    expect(snapshot.status).toBe("missing");
    expect(snapshot.canSave).toBe(true);
    expect(snapshot.roles).toHaveLength(17);
    expect(snapshot.roles[0]!.key).toBe("feature, refactoring");
    expect(snapshot.roles[16]!.key).toBe("interrogate reviewers");
    expect(snapshot.roles.every((role) => !role.configured)).toBe(true);
  });

  it("keeps configured values and reports unknown lines by line number", () => {
    const { path } = home(
      "# budget: large\nfeature, refactoring: cpa/model-a [high]\nretired role: cpa/model-b\n",
    );
    const snapshot = snapshotFromConfiguration(readRoleConfiguration(path));
    expect(snapshot.status).toBe("loaded");
    expect(snapshot.budget).toBe("large");
    expect(snapshot.roles[0]!.configured).toBe(true);
    expect(snapshot.roles[0]!.line).toBe(2);
    expect(snapshot.roles[0]!.routes).toEqual([
      { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
    ]);
    expect(snapshot.issues).toEqual([
      {
        line: 3,
        message: expect.stringContaining("unknown role"),
      },
    ]);
  });

  it("reports an unreadable file instead of treating it as empty", () => {
    const { directory } = home();
    mkdirSync(modelsFilePath(directory));
    const snapshot = snapshotFromConfiguration(readRoleConfiguration(modelsFilePath(directory)));
    expect(snapshot.status).toBe("unreadable");
    expect(snapshot.canSave).toBe(false);
    expect(snapshot.reason).toMatch(/EISDIR|directory/i);
  });
});

describe("role text editing", () => {
  it("replaces exactly one role line and preserves comments, budget, and unknown lines", () => {
    const original = [
      "# budget: large (xhigh)",
      "feature, refactoring: cpa/model-a [high]",
      "retired role: cpa/model-b",
      "",
      "bug-fix: inherit-parent",
    ].join("\n");
    const spec = parseRoleConfiguration("feature, refactoring: cpa/model-a", "x");
    expect(spec.status).toBe("loaded");
    const next = updateRoleText(
      `${original}\n`,
      { key: "bug-fix", shape: "single", autoPanel: false },
      "cpa/model-b",
    );
    expect(next).toContain("# budget: large (xhigh)\n");
    expect(next).toContain("feature, refactoring: cpa/model-a [high]\n");
    expect(next).toContain("retired role: cpa/model-b\n");
    expect(next).toContain("bug-fix: cpa/model-b\n");
  });

  it("appends a role that the file does not configure", () => {
    const next = updateRoleText(
      "# budget: small\n",
      { key: "arena runners", shape: "list", autoPanel: true },
      "cpa/model-a, cpa/model-b",
    );
    expect(next).toContain("arena runners: cpa/model-a, cpa/model-b\n");
  });

  it("preserves CRLF line endings", () => {
    const next = updateRoleText(
      "bug-fix: inherit-parent\r\n",
      { key: "bug-fix", shape: "single", autoPanel: false },
      "cpa/model-a",
    );
    expect(next).toBe("bug-fix: cpa/model-a\r\n");
  });

  it("renders every list entry, never only the first", () => {
    expect(
      renderRoleValue([
        { kind: "route", provider: "cpa", model: "model-a", effort: "high" },
        { kind: "inherit", alias: "auto" },
        { kind: "route", provider: "cpa", model: "model-b" },
      ]),
    ).toBe("cpa/model-a [high], auto, cpa/model-b");
  });
});

describe("role save validation", () => {
  it("rejects an unknown provider, an unknown model, and an undeclared effort", () => {
    const base = {
      key: "bug-fix",
      routes: [{ kind: "route" as const, provider: "cpa", model: "model-a" }],
    };

    expect(
      validateSaveRequest(
        { ...base, routes: [{ kind: "route", provider: "nope", model: "model-a" }] },
        catalogue,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateSaveRequest(
        { ...base, routes: [{ kind: "route", provider: "cpa", model: "nope" }] },
        catalogue,
      ),
    ).toMatchObject({ ok: false });
    expect(
      validateSaveRequest(
        { ...base, routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "max" }] },
        catalogue,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("does not declare effort") });
  });

  it("rejects a single role with two routes and a list role with none", () => {
    expect(
      validateSaveRequest(
        {
          key: "bug-fix",
          routes: [
            { kind: "route", provider: "cpa", model: "model-a" },
            { kind: "route", provider: "cpa", model: "model-b" },
          ],
        },
        catalogue,
      ),
    ).toMatchObject({ ok: false });
    expect(validateSaveRequest({ key: "arena runners", routes: [] }, catalogue)).toMatchObject({
      ok: false,
    });
  });
});

describe("role file saves", () => {
  it("creates a missing file", () => {
    const { directory, path } = home();
    const result = saveRoleConfiguration(
      path,
      {
        key: "bug-fix",
        routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "high" }],
      },
      catalogue,
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("bug-fix: cpa/model-a [high]\n");
    expect(readRoleConfiguration(path)).toMatchObject({ status: "loaded" });
    expect(join(directory, "pstack-models.mdc")).toBe(path);
  });

  it("changes only the saved role and leaves other roles and budget untouched", () => {
    const original = [
      "# budget: large",
      "feature, refactoring: cpa/model-a [high]",
      "bug-fix: cpa/model-b",
      "unknown role: cpa/model-a",
      "",
    ].join("\n");
    const { path } = home(original);
    const result = saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [{ kind: "route", provider: "cpa", model: "model-a" }] },
      catalogue,
    );
    expect(result.ok).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("# budget: large\n");
    expect(text).toContain("feature, refactoring: cpa/model-a [high]\n");
    expect(text).toContain("unknown role: cpa/model-a\n");
    expect(text).toContain("bug-fix: cpa/model-a\n");
    expect(text).not.toContain("bug-fix: cpa/model-b");
  });

  it("resets a role to inherit-parent without leaving the old route", () => {
    const { path } = home("bug-fix: cpa/model-a [high]\n");
    const result = saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [{ kind: "inherit", alias: "inherit-parent" }] },
      catalogue,
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("bug-fix: inherit-parent\n");
    if (result.ok) {
      expect(result.snapshot.roles.find((role) => role.key === "bug-fix")?.routes).toEqual([
        { kind: "inherit", alias: "inherit-parent" },
      ]);
    }
  });

  it("is idempotent across two saves", () => {
    const { path } = home("# budget: small\nfeature, refactoring: inherit-parent\n");
    const request = {
      key: "arena runners",
      routes: [
        { kind: "route" as const, provider: "cpa", model: "model-a", effort: "high" },
        { kind: "route" as const, provider: "cpa", model: "model-b" },
      ],
    };
    expect(saveRoleConfiguration(path, request, catalogue).ok).toBe(true);
    const first = readFileSync(path, "utf8");
    expect(saveRoleConfiguration(path, request, catalogue).ok).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(first);
  });

  it("keeps every route of a list role when the saved draft holds them all", () => {
    const { path } = home("arena runners: cpa/model-a [high], cpa/model-b\n");
    const result = saveRoleConfiguration(
      path,
      {
        key: "arena runners",
        routes: [
          { kind: "route", provider: "cpa", model: "model-a", effort: "low" },
          { kind: "route", provider: "cpa", model: "model-b" },
          { kind: "inherit", alias: "auto" },
        ],
      },
      catalogue,
    );
    expect(result.ok).toBe(true);
    expect(readFileSync(path, "utf8")).toContain(
      "arena runners: cpa/model-a [low], cpa/model-b, auto\n",
    );
  });

  it("leaves the file byte-identical when validation refuses a save", () => {
    const original = "bug-fix: cpa/model-a [high]\n";
    const { path } = home(original);
    const result = saveRoleConfiguration(
      path,
      {
        key: "bug-fix",
        routes: [{ kind: "route", provider: "cpa", model: "model-a", effort: "max" }],
      },
      catalogue,
    );
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining("does not declare effort"),
    });
    expect(readFileSync(path, "utf8")).toBe(original);
  });

  it("never overwrites an unreadable file", () => {
    const { directory } = home();
    const path = modelsFilePath(directory);
    mkdirSync(path);
    const result = saveRoleConfiguration(
      path,
      { key: "bug-fix", routes: [{ kind: "route", provider: "cpa", model: "model-a" }] },
      catalogue,
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/unreadable/i) });
  });
});
