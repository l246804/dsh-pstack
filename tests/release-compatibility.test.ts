import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  compatibilityBlock,
  releaseMetadata,
  syncCompatibility,
} from "../port/release-compatibility.ts";

const ROOT = join(process.cwd(), ".tmp", "release-compatibility-tests");
const KEY = "dsh-0.2.2-rc.1+port-v1";
const RANGE = ">=0.2.2-rc.1";
const LEGACY_KEY = "dsh-0.2.1-rc.5+legacy-v1";

function metadata(version: string, key = KEY, pstackVersion = "0.15.36", dshRange = RANGE) {
  return { version, dshRange, compatibilityKey: key, pstackVersion };
}

function table(version = "0.3.0-beta.1") {
  return {
    keys: [KEY, LEGACY_KEY],
    rows: [
      { dshRange: `\`${RANGE}\``, releases: [`\`${version}\``], pstackVersion: "`0.15.36`" },
      {
        dshRange: "`>=0.2.1-rc.5`",
        releases: ["`0.2.2`"],
        pstackVersion: "`0.15.36`",
      },
    ],
  };
}

function readme(version = "0.3.0-beta.1", heading = "## 📦 Compatibility"): string {
  return `# English

${heading}

Choose a release.

<!-- compatibility-keys: ["${KEY}","${LEGACY_KEY}"] -->
| DSH version | Release | pstack |
|---|---|---|
| \`${RANGE}\` | \`${version}\` | \`0.15.36\` |
| \`>=0.2.1-rc.5\` | \`0.2.2\` | \`0.15.36\` |

Keep this English tail.
`;
}

function prepare(): void {
  mkdirSync(join(ROOT, "playground"), { recursive: true });
  mkdirSync(join(ROOT, "upstream", "cursor-plugins", "pstack"), { recursive: true });
  writeJson("package.json", { version: "0.3.0-beta.1", engines: { dsh: RANGE } });
  writeJson("playground/baseline.json", {
    compatibilityKey: KEY,
    dshVersion: RANGE,
    pstackCommit: "ae5650febf4320793844c12c4adaa937f417f8da",
  });
  writeJson("upstream/cursor-plugins/pstack/plugin.json", { version: "0.15.36" });
  writeFileSync(join(ROOT, "README.md"), readme());
  writeFileSync(
    join(ROOT, "README.zh.md"),
    readme("0.3.0-beta.1", "## 📦 兼容性").replace("Keep this English tail.", "保留这段中文。"),
  );
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

describe("release compatibility metadata", () => {
  it("reads the explicit key rather than deriving it from semver", () => {
    prepare();
    expect(releaseMetadata((path) => JSON.parse(readFileSync(join(ROOT, path), "utf8")))).toEqual(
      metadata("0.3.0-beta.1"),
    );
  });

  it("replaces one minor slot through prerelease, stable, and patch releases", () => {
    let current = table();
    for (const version of ["0.3.0-rc.1", "0.3.0", "0.3.1", "0.3.2"]) {
      current = compatibilityBlock(metadata(version), current);
    }
    expect(current.rows[0].releases).toEqual(["`0.3.2`"]);
  });

  it("keeps the latest patch of each minor when the key is unchanged", () => {
    let current = table("0.3.1");
    for (const version of ["0.3.2", "0.4.0", "0.4.1"]) {
      current = compatibilityBlock(metadata(version), current);
    }
    expect(current.rows[0].releases).toEqual(["`0.3.2`", "`0.4.1`"]);
    expect(current.rows[1].releases).toEqual(["`0.2.2`"]);
  });

  it("adds a row only for a new compatibility key", () => {
    const result = compatibilityBlock(
      metadata("0.4.0", "dsh-0.3.0+port-v2", "0.16.0", ">=0.3.0"),
      table(),
    );
    expect(result.appendedRow).toBe(true);
    expect(result.keys[0]).toBe("dsh-0.3.0+port-v2");
    expect(result.rows[0]).toEqual({
      dshRange: "`>=0.3.0`",
      releases: ["`0.4.0`"],
      pstackVersion: "`0.16.0`",
    });
    expect(result.rows[1]).toEqual(table().rows[0]);
  });

  it("rejects a changed DSH range under the same key", () => {
    const changed = table();
    changed.rows[0].dshRange = "`>=0.3.0`";
    expect(() => compatibilityBlock(metadata("0.4.0"), changed)).toThrow("DSH range differs");
  });

  it("rejects a release older than its existing minor slot", () => {
    expect(() => compatibilityBlock(metadata("0.3.0"), table("0.3.1"))).toThrow("older than");
  });

  it("sorts multi-digit minors and rejects duplicate slots or keys", () => {
    let current = table("0.9.1");
    current = compatibilityBlock(metadata("0.10.0"), current);
    expect(current.rows[0].releases).toEqual(["`0.9.1`", "`0.10.0`"]);
    const duplicate = table("0.3.1");
    duplicate.rows[0].releases.push("`0.3.2`");
    expect(() => compatibilityBlock(metadata("0.3.3"), duplicate)).toThrow("Duplicate 0.3");
    const duplicateKeys = table();
    duplicateKeys.keys[1] = KEY;
    expect(() => compatibilityBlock(metadata("0.3.1"), duplicateKeys)).toThrow("duplicates");
  });

  it("syncs both README files in an isolated release sequence", () => {
    prepare();
    const read = (path: string) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
    for (const version of ["0.3.1", "0.3.2", "0.4.0", "0.4.1"]) {
      const manifest = read("package.json");
      manifest.version = version;
      writeJson("package.json", manifest);
      expect(syncCompatibility(releaseMetadata(read), true, ROOT)).toEqual({
        addedRow: false,
        releases: version.startsWith("0.3") ? [`\`${version}\``] : ["`0.3.2`", `\`${version}\``],
      });
    }
    for (const file of ["README.md", "README.zh.md"]) {
      const text = readFileSync(join(ROOT, file), "utf8");
      expect(text).toContain("`0.3.2`、`0.4.1`");
      expect(text).toContain(LEGACY_KEY);
      expect(text).toContain(file === "README.md" ? "Keep this English tail." : "保留这段中文。");
    }
    expect(syncCompatibility(releaseMetadata(read), false, ROOT).releases).toEqual([
      "`0.3.2`",
      "`0.4.1`",
    ]);
  });
});
