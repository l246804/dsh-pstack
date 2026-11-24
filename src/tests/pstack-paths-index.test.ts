import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { resolvePackagePaths, type PstackPackagePaths } from "../lib/paths.ts";
import { pstackHomePaths } from "../pstack/home.ts";
import {
  buildPstackPathsDocument,
  scanSkillDirectories,
  writePstackPathsIndex,
} from "../pstack/paths-index.ts";

const directories: string[] = [];

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

/** Create a fake package root with a `dist/index.mjs` entry and return its paths. */
function fakePackage(): PstackPackagePaths {
  const root = tempDir("pstack-paths-");
  mkdirSync(join(root, "dist"), { recursive: true });
  const entry = join(root, "dist", "index.mjs");
  writeFileSync(entry, "");
  return resolvePackagePaths(pathToFileURL(entry).href);
}

/** Materialize a skill directory, optionally with a `SKILL.md` file. */
function writeSkill(root: string, name: string, withSkillFile = true): void {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  if (withSkillFile) writeFileSync(join(directory, "SKILL.md"), `# ${name}\n`);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("resolvePackagePaths", () => {
  it("derives every absolute path from the bundled entry", () => {
    const root = tempDir("pstack-paths-resolve-");
    mkdirSync(join(root, "dist"), { recursive: true });
    const entry = join(root, "dist", "index.mjs");
    writeFileSync(entry, "");

    const paths = resolvePackagePaths(pathToFileURL(entry).href);

    expect(paths.packageRoot).toBe(root);
    expect(paths.pstackRoot).toBe(join(root, "dist", "pstack"));
    expect(paths.docsRoot).toBe(join(root, "dist", "pstack", "docs"));
    expect(paths.dshAdapter).toBe(join(root, "dist", "pstack", "docs", "harness", "dsh.md"));
    expect(paths.skillsRoot).toBe(join(root, "dist", "pstack", "skills"));
    expect(paths.vendoredSkillsRoot).toBe(join(root, "dist", "skills", "vendored"));
    expect(paths.authoredSkillsRoot).toBe(join(root, "dist", "skills", "authored"));
  });
});

describe("scanSkillDirectories", () => {
  it("collects pstack, vendored and authored skills and skips non-skills", () => {
    const paths = fakePackage();
    writeSkill(paths.skillsRoot, "poteto-mode");
    writeSkill(paths.skillsRoot, "not-a-skill", false);
    writeFileSync(join(paths.skillsRoot, "loose-file.md"), "ignored");
    writeSkill(paths.vendoredSkillsRoot, "deslop");
    writeSkill(paths.authoredSkillsRoot, "control-cli");

    const skills = scanSkillDirectories(paths);

    expect(skills).toEqual({
      "poteto-mode": join(paths.skillsRoot, "poteto-mode"),
      deslop: join(paths.vendoredSkillsRoot, "deslop"),
      "control-cli": join(paths.authoredSkillsRoot, "control-cli"),
    });
  });

  it("ignores a missing root", () => {
    const paths = fakePackage();
    writeSkill(paths.skillsRoot, "poteto-mode");
    writeSkill(paths.vendoredSkillsRoot, "deslop");
    // authoredSkillsRoot is never created.

    expect(existsSync(paths.authoredSkillsRoot)).toBe(false);
    expect(Object.keys(scanSkillDirectories(paths)).sort()).toEqual(["deslop", "poteto-mode"]);
  });
});

describe("buildPstackPathsDocument", () => {
  it("carries the absolute roots and the skill map", () => {
    const paths = fakePackage();
    writeSkill(paths.skillsRoot, "poteto-mode");

    const document = buildPstackPathsDocument(paths);

    expect(document).toEqual({
      version: 1,
      packageRoot: paths.packageRoot,
      pstackRoot: paths.pstackRoot,
      docsRoot: paths.docsRoot,
      dshAdapter: paths.dshAdapter,
      skills: { "poteto-mode": join(paths.skillsRoot, "poteto-mode") },
    });
  });
});

describe("writePstackPathsIndex", () => {
  it("writes deterministic JSON, skips identical rewrites and updates a changed skill set", () => {
    const paths = fakePackage();
    writeSkill(paths.skillsRoot, "poteto-mode");
    const target = join(tempDir("pstack-paths-write-"), "pstack", "paths.json");

    writePstackPathsIndex(target, paths);
    const first = readFileSync(target, "utf8");
    expect(JSON.parse(first)).toEqual(buildPstackPathsDocument(paths));
    expect(first.endsWith("\n")).toBe(true);

    writePstackPathsIndex(target, paths);
    expect(readFileSync(target, "utf8")).toBe(first);

    writeSkill(paths.authoredSkillsRoot, "control-cli");
    writePstackPathsIndex(target, paths);
    const second = readFileSync(target, "utf8");
    expect(second).not.toBe(first);
    expect(JSON.parse(second).skills).toHaveProperty("control-cli");
  });
});

describe("pstackHomePaths", () => {
  it("points paths at <home>/pstack/paths.json", () => {
    const home = tempDir("pstack-paths-home-");
    expect(pstackHomePaths(home).paths).toBe(join(home, "pstack", "paths.json"));
  });
});
