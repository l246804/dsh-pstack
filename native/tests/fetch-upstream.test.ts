import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { resolveVersionCommit, versionAt } from "../scripts/lib/upstream.ts";

const repository = process.cwd();
mkdirSync(join(repository, ".tmp"), { recursive: true });
const temporary = mkdtempSync(join(repository, ".tmp", "native-fetch-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

describe("upstream pin", () => {
  it("restores same-version commits after a lock switch and reuses an unchanged pin offline", () => {
    const root = join(temporary, "fetch-upstream");
    const source = join(root, "source");
    const native = join(root, "native");
    mkdirSync(join(source, "pstack"), { recursive: true });
    mkdirSync(join(native, "scripts"), { recursive: true });
    const script = join(native, "scripts", "fetch-upstream.ts");
    cpSync(join(repository, "native", "scripts"), join(root, "native", "scripts"), {
      recursive: true,
    });
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("remote", "add", "origin", source);
    writeFileSync(join(source, "pstack", "plugin.json"), JSON.stringify({ version: "1.0.0" }));
    const commit = (content: string): string => {
      writeFileSync(join(source, "pstack", "content.txt"), content);
      git("add", ".");
      git("-c", "commit.gpgsign=false", "commit", "-qm", content);
      return git("rev-parse", "HEAD");
    };
    const first = commit("first");
    const second = commit("second");
    const fetch = (...args: string[]): string =>
      execFileSync("vpx", [resolve(script), ...args], { cwd: root, encoding: "utf8" });
    fetch("--version", "1.0.0", "--commit", first, "--source", source);
    const firstLock = readFileSync(join(native, "upstream.lock.json"), "utf8");
    fetch("--version", "1.0.0", "--commit", second, "--source", source);
    expect(readFileSync(join(native, "upstream", "content.txt"), "utf8")).toBe("second");
    writeFileSync(join(native, "upstream.lock.json"), firstLock);
    fetch();
    expect(readFileSync(join(native, "upstream", "content.txt"), "utf8")).toBe("first");
    renameSync(source, `${source}-offline`);
    expect(fetch()).toContain("nothing to fetch");
  });

  it("preserves an SSH source in the lock and restores it after the clone is removed", () => {
    const root = join(temporary, "fetch-ssh");
    const source = join(root, "source");
    mkdirSync(join(source, "pstack"), { recursive: true });
    const script = join(root, "native", "scripts", "fetch-upstream.ts");
    mkdirSync(join(root, "native", "scripts"), { recursive: true });
    cpSync(join(repository, "native", "scripts"), join(root, "native", "scripts"), {
      recursive: true,
    });
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
    git("init", "-q");
    writeFileSync(join(source, "pstack", "plugin.json"), '{"version":"1.0.0"}\n');
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    const remote = "git@audit.invalid:custom/plugins.git";
    const env = {
      ...process.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: `url.${pathToFileURL(source).href}.insteadOf`,
      GIT_CONFIG_VALUE_0: remote,
    };
    const fetch = (...args: string[]): void => {
      execFileSync("vpx", [script, ...args], { cwd: root, env, encoding: "utf8" });
    };
    fetch("--source", remote, "--version", "1.0.0", "--commit", git("rev-parse", "HEAD"));
    expect(
      JSON.parse(readFileSync(join(root, "native", "upstream.lock.json"), "utf8")),
    ).toMatchObject({ source: remote });
    rmSync(join(root, "native", "upstream"), { recursive: true });
    fetch();
    expect(
      JSON.parse(readFileSync(join(root, "native", "upstream", "plugin.json"), "utf8")),
    ).toEqual({ version: "1.0.0" });
  });
  it("resolves the first publication and later bumps without selecting same-version edits", () => {
    const source = join(temporary, "version-boundaries");
    mkdirSync(source);
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", "/dev/null");
    const commit = (): string => {
      git("add", ".");
      git("commit", "-qm", "fixture");
      return git("rev-parse", "HEAD");
    };
    writeFileSync(join(source, "README.md"), "Before plugin publication");
    const before = commit();
    mkdirSync(join(source, "pstack"));
    const manifest = "pstack/plugin.json";
    writeFileSync(join(source, manifest), '{"version":"1.0.0"}');
    const first = commit();
    writeFileSync(join(source, manifest), '{"version":"1.0.0","description":"updated"}');
    commit();
    writeFileSync(join(source, manifest), '{"version":"1.1.0"}');
    const next = commit();
    expect(versionAt(source, manifest, before)).toBeUndefined();
    expect(resolveVersionCommit(source, manifest, "1.0.0")).toBe(first);
    expect(resolveVersionCommit(source, manifest, "1.1.0")).toBe(next);
    expect(() => versionAt(source, manifest, "missing-ref")).toThrow(/git ls-tree/);
  });
});
