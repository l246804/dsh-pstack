import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

function badge(version: string): string {
  return `<a href="https://github.com/cursor/plugins/tree/main/pstack"><img src="https://img.shields.io/badge/pstack-${version}-d97706?style=flat-square" alt="pstack ${version}" /></a>`;
}

function releasedReadme(badgeVersion: string, release: string, pstack: string, zh = false): string {
  const heading = zh ? "## 📦 兼容性" : "## 📦 Compatibility";
  const intro = zh ? "说明。" : "Intro.";
  const header = zh ? ZH_HEADER : EN_HEADER;
  return `${badge(badgeVersion)}\n\n${document(heading, intro, [
    group(">=0.2.2-rc.1", [[release, pstack]], header),
  ])}`;
}

function enReadme(badgeVersion = "0.15.36"): string {
  return `${badge(badgeVersion)}\n\n${document(
    "## 📦 Compatibility",
    "Intro.",
    [
      group(">=0.2.2-rc.1", [["0.3.1", "0.15.36"]]),
      group(">=0.2.1-rc.5", [["0.2.2", "0.15.36"]]),
      group(">=0.2.0", [["0.1.0", "0.15.29"]]),
    ],
    "See tail.",
  )}`;
}

function zhReadme(badgeVersion = "0.15.36"): string {
  return `${badge(badgeVersion)}\n\n${document(
    "## 📦 兼容性",
    "说明。",
    [
      group(">=0.2.2-rc.1", [["0.3.1", "0.15.36"]], ZH_HEADER),
      group(">=0.2.1-rc.5", [["0.2.2", "0.15.36"]], ZH_HEADER),
      group(">=0.2.0", [["0.1.0", "0.15.29"]], ZH_HEADER),
    ],
    "见尾部。",
  )}`;
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
    expect(verifyCompatibility(meta("0.4.0", ">=0.2.2-rc.2", "0.15.36"), ROOT)).toEqual({
      pending: true,
      releases: [],
    });
  });

  it("writes the release pstack version into both README badges", () => {
    prepare();
    syncCompatibility(meta("0.4.0", ">=0.2.2-rc.2", "0.15.48"), true, ROOT);
    for (const file of ["README.md", "README.zh.md"]) {
      const text = read(file);
      expect(text, `${file} should carry the new badge version`).toContain(
        "badge/pstack-0.15.48-d97706",
      );
      expect(text).toContain('alt="pstack 0.15.48"');
      expect(text).not.toContain("pstack-0.15.36-d97706");
    }
  });

  it("rejects a README badge that does not match the newest release", () => {
    prepare();
    writeFileSync(join(ROOT, "README.zh.md"), zhReadme("0.15.43"));
    expect(() => verifyCompatibility(meta("0.4.0"), ROOT)).toThrow(
      "README.zh.md pstack badge says 0.15.43, but the newest release ships 0.15.36",
    );
  });

  it("keeps a released row when the pin moves ahead of it", () => {
    prepare();
    writeFileSync(join(ROOT, "README.md"), releasedReadme("0.15.36", "0.4.0", "0.15.36"));
    writeFileSync(join(ROOT, "README.zh.md"), releasedReadme("0.15.36", "0.4.0", "0.15.36", true));
    expect(verifyCompatibility(meta("0.4.0", ">=0.2.2-rc.1", "0.15.48"), ROOT)).toEqual({
      pending: false,
      releases: ["`0.4.0`"],
    });
  });

  it("refuses to rewrite a released row for a new pin", () => {
    prepare();
    writeFileSync(join(ROOT, "README.md"), releasedReadme("0.15.36", "0.4.0", "0.15.36"));
    writeFileSync(join(ROOT, "README.zh.md"), releasedReadme("0.15.36", "0.4.0", "0.15.36", true));
    expect(() => syncCompatibility(meta("0.4.0", ">=0.2.2-rc.1", "0.15.48"), true, ROOT)).toThrow(
      "0.4.0 already shipped pstack 0.15.36",
    );
  });

  it.each([">=0.2.2-rc.2", ">=0.2.1-rc.5"])(
    "refuses to reuse a released version under DSH %s",
    (range) => {
      prepare();
      const before = read("README.md");
      expect(() => syncCompatibility(meta("0.3.1", range, "0.15.36"), true, ROOT)).toThrow(
        "0.3.1 already appears under DSH >=0.2.2-rc.1; bump the package version before changing its DSH group",
      );
      expect(read("README.md")).toBe(before);
    },
  );

  it("rejects a README without the pstack badge", () => {
    prepare();
    writeFileSync(join(ROOT, "README.md"), enReadme().replace(badge("0.15.36"), ""));
    expect(() => verifyCompatibility(meta("0.4.0"), ROOT)).toThrow(
      "README.md pstack badge is missing or inconsistent",
    );
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

  it("preserves the real README layout and history prose across an idempotent release sync", () => {
    for (const file of COMPATIBILITY_FILES) {
      const target = join(ROOT, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(process.cwd(), file), target);
    }
    const current = releaseMetadata();
    const [major, minor, patch] = current.version.split(".");
    const next = { ...current, version: `${major}.${minor}.${Number.parseInt(patch, 10) + 1}` };
    const before = new Map(COMPATIBILITY_FILES.map((file) => [file, read(file)]));

    // Only the pstack badge and DSH release tables belong to the release writer.
    const withoutReleaseMetadata = (text: string): string =>
      text
        .replace(/<img src="https:\/\/img\.shields\.io\/badge\/pstack-[^"]+"[^>]*\/>/g, "")
        .replace(/^\*\*DSH .+\*\*\n(?:\n|\|[^\n]+\n)*/gm, "");

    syncCompatibility(next, true, ROOT);
    expect(verifyCompatibility(next, ROOT)).toMatchObject({
      pending: false,
      releases: expect.arrayContaining([`\`${next.version}\``]),
    });
    for (const [file, original] of before) {
      expect(withoutReleaseMetadata(read(file)), `${file} should preserve all other content`).toBe(
        withoutReleaseMetadata(original),
      );
    }
    for (const file of ["README.md", "README.zh.md"]) {
      expect(read(file)).toContain(`| \`${next.version}\` | \`${next.pstackVersion}\` |`);
    }

    const synced = new Map(COMPATIBILITY_FILES.map((file) => [file, read(file)]));
    syncCompatibility(next, true, ROOT);
    for (const [file, firstSync] of synced) {
      expect(read(file), `${file} should not change on a repeated sync`).toBe(firstSync);
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
