import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  COMPATIBILITY_FILES,
  releaseMetadata,
  syncCompatibility,
  verifyCompatibility,
} from "../scripts/release-compatibility.ts";

const ROOT = join(process.cwd(), ".tmp", "release-compatibility-tests");
const EN_HEADER = "| dsh-pstack release | pstack version |";
const ZH_HEADER = "| dsh-pstack 发布版本 | pstack 版本 |";

function group(dsh: string, rows: Array<[string, string]>, header = EN_HEADER): string {
  return [
    `**DSH \`${dsh}\`**`,
    "",
    header,
    "|---|---|",
    ...rows.map(([release, pstack]) => `| \`${release}\` | \`${pstack}\` |`),
  ].join("\n");
}

function document(heading: string, intro: string, groups: string[], tail = ""): string {
  const parts = [heading, "", intro];
  for (const block of groups) parts.push("", block);
  if (tail !== "") parts.push("", tail);
  return `${parts.join("\n")}\n`;
}

function enReadme(): string {
  return document(
    "## 📦 Compatibility",
    "Intro.",
    [
      group(">=0.2.2-rc.1", [["0.3.1", "0.15.36"]]),
      group(">=0.2.1-rc.5", [["0.2.2", "0.15.36"]]),
      group(">=0.2.0", [["0.1.0", "0.15.29"]]),
    ],
    "See tail.",
  );
}

function zhReadme(): string {
  return document(
    "## 📦 兼容性",
    "说明。",
    [
      group(">=0.2.2-rc.1", [["0.3.1", "0.15.36"]], ZH_HEADER),
      group(">=0.2.1-rc.5", [["0.2.2", "0.15.36"]], ZH_HEADER),
      group(">=0.2.0", [["0.1.0", "0.15.29"]], ZH_HEADER),
    ],
    "见尾部。",
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

function prepare(): void {
  mkdirSync(join(ROOT, "native"), { recursive: true });
  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeJson("package.json", { version: "0.4.0", engines: { dsh: ">=0.2.2-rc.1" } });
  writeJson("native/upstream.lock.json", { pstackVersion: "0.15.36" });
  writeFileSync(join(ROOT, "README.md"), enReadme());
  writeFileSync(join(ROOT, "README.zh.md"), zhReadme());
  writeFileSync(
    join(ROOT, "docs", "compatibility-history.md"),
    document("## 📦 Compatibility history", "Older.", []),
  );
  writeFileSync(
    join(ROOT, "docs", "compatibility-history.zh.md"),
    document("## 📦 兼容历史", "更早。", []),
  );
}

function meta(version: string, dshRange = ">=0.2.2-rc.1", pstackVersion = "0.15.36") {
  return { version, dshRange, pstackVersion };
}

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("release compatibility metadata", () => {
  it("reads the version, DSH range, and pstack version", () => {
    prepare();
    expect(releaseMetadata((path) => JSON.parse(readFileSync(join(ROOT, path), "utf8")))).toEqual(
      meta("0.4.0"),
    );
  });

  it("rejects an invalid package version", () => {
    prepare();
    writeJson("package.json", { version: "nope", engines: { dsh: ">=0.2.2-rc.1" } });
    expect(() =>
      releaseMetadata((path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"))),
    ).toThrow("invalid release version");
  });

  it("treats an unreleased DSH range as pending", () => {
    prepare();
    expect(verifyCompatibility(meta("0.4.0", ">=0.2.2-rc.2", "0.15.43"), ROOT)).toEqual({
      pending: true,
      releases: [],
    });
  });

  it("appends a new DSH group and moves the oldest range into history", () => {
    prepare();
    const next = meta("0.4.0", ">=0.2.2-rc.2", "0.15.43");
    expect(syncCompatibility(next, true, ROOT)).toEqual({ addedRow: true, releases: ["`0.4.0`"] });
    expect(verifyCompatibility(next, ROOT)).toEqual({ pending: false, releases: ["`0.4.0`"] });

    const readme = read("README.md");
    expect(readme).toContain("**DSH `>=0.2.2-rc.2`**");
    expect(readme).toContain("**DSH `>=0.2.2-rc.1`**");
    expect(readme).toContain("**DSH `>=0.2.1-rc.5`**");
    expect(readme).not.toContain("**DSH `>=0.2.0`**");

    const history = read("docs/compatibility-history.md");
    expect(history).toContain("**DSH `>=0.2.0`**");
    expect(history).not.toContain("**DSH `>=0.2.2-rc.1`**");
  });

  it("lists every file the release sync rewrites so the commit includes them", () => {
    expect([...COMPATIBILITY_FILES].sort()).toEqual(
      [
        "README.md",
        "README.zh.md",
        "docs/compatibility-history.md",
        "docs/compatibility-history.zh.md",
      ].sort(),
    );

    prepare();
    const before = new Map(COMPATIBILITY_FILES.map((file) => [file, read(file)]));
    syncCompatibility(meta("0.4.0", ">=0.2.2-rc.2", "0.15.43"), true, ROOT);
    for (const file of COMPATIBILITY_FILES) {
      expect(read(file), `${file} should be rewritten by the release sync`).not.toBe(
        before.get(file),
      );
    }
  });

  it("updates the matching group and keeps only the latest patch of a minor", () => {
    prepare();
    const next = meta("0.3.2", ">=0.2.2-rc.1", "0.15.36");
    expect(syncCompatibility(next, true, ROOT)).toEqual({ addedRow: false, releases: ["`0.3.2`"] });
    expect(verifyCompatibility(next, ROOT)).toEqual({ pending: false, releases: ["`0.3.2`"] });
    const readme = read("README.md");
    expect(readme).toContain("| `0.3.2` | `0.15.36` |");
    expect(readme).not.toContain("| `0.3.1` |");
  });

  it("rejects bilingual tables that differ", () => {
    prepare();
    writeFileSync(join(ROOT, "README.zh.md"), zhReadme().replace("`0.3.1`", "`0.9.9`"));
    expect(() => verifyCompatibility(meta("0.4.0"), ROOT)).toThrow(
      "Bilingual compatibility tables differ",
    );
  });
});
