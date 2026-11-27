import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

const repository = process.cwd();
const scratch = join(repository, ".tmp");
mkdirSync(scratch, { recursive: true });
const temporary = mkdtempSync(join(scratch, "maintenance-scripts-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

function fixture(name: string, script: string): string {
  const root = join(temporary, name);
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(join(repository, "scripts", script), join(root, "scripts", script));
  return root;
}

function executable(file: string, content: string): void {
  writeFileSync(file, `#!/usr/bin/env bash\nset -euo pipefail\n${content}\n`, { mode: 0o755 });
}

describe("maintenance scripts", () => {
  it.each([
    { mode: "without-tag", flags: ["--no-tag", "--no-push"], tagged: false, pushed: false },
    { mode: "local-tag", flags: ["--no-push"], tagged: true, pushed: false },
    { mode: "published-tag", flags: [], tagged: true, pushed: true },
  ])("consumes notes only for a new release tag ($mode)", ({ mode, flags, tagged, pushed }) => {
    const root = fixture(`release-${mode}`, "release.sh");
    const remote = join(temporary, `remote-${mode}.git`);
    const git = (...args: string[]): string =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init", "-q", "--initial-branch=main");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");
    git("config", "core.hooksPath", "/dev/null");
    mkdirSync(join(root, "changes"));
    const notes = join(root, "changes", "RELEASE.md");
    writeFileSync(notes, "Prepared notes\n");
    writeFileSync(join(root, "bump.config.json"), "{}\n");
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "release-fixture", version: "1.0.0" }),
    );
    git("add", ".");
    git("commit", "-qm", "initial");
    git("init", "-q", "--bare", remote);
    git("remote", "add", "origin", remote);
    git("push", "-qu", "origin", "main");
    const before = git("rev-parse", "HEAD");
    const result = spawnSync(
      "bash",
      [
        join(root, "scripts", "release.sh"),
        "patch",
        "--configFilePath",
        join(root, "bump.config.json"),
        "--yes",
        "--ignore-scripts",
        "--no-verify",
        ...flags,
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${join(repository, "node_modules", ".bin")}:${process.env.PATH}`,
        },
        encoding: "utf8",
      },
    );
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    expect(result.status).toBe(0);
    expect(existsSync(notes)).toBe(!tagged);
    const remoteHead = git("--git-dir", remote, "rev-parse", "refs/heads/main");
    expect(remoteHead).toBe(pushed ? git("rev-parse", "HEAD") : before);
    if (tagged) expect(git("show", "v1.0.1:changes/RELEASE.md")).toBe("Prepared notes");
    else expect(readFileSync(notes, "utf8")).toBe("Prepared notes\n");
  });

  it.each(["--help", "-h", "--version", "-v"])(
    "forwards %s without consuming release notes or invoking git",
    (flag) => {
      const root = fixture(`release-${flag.replaceAll("-", "")}`, "release.sh");
      const bin = join(root, "bin");
      mkdirSync(bin);
      mkdirSync(join(root, "changes"));
      const notes = join(root, "changes", "RELEASE.md");
      writeFileSync(notes, "Prepared notes\n");
      executable(join(bin, "bumpp"), 'printf "bumpp %s\\n" "$*"');
      executable(join(bin, "git"), 'echo "git must not run" >&2; exit 99');
      const result = spawnSync("bash", [join(root, "scripts", "release.sh"), flag], {
        cwd: root,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe(`bumpp ${flag}\n`);
      expect(readFileSync(notes, "utf8")).toBe("Prepared notes\n");
    },
  );

  it("compares skills from repository roots and filters explicitly scoped sources", () => {
    const root = fixture("upstream-watch", "upstream-watch.sh");
    const bin = join(root, "bin");
    mkdirSync(bin);
    mkdirSync(join(root, "native"));
    mkdirSync(join(root, "skills"));
    writeFileSync(
      join(root, "native", "upstream.lock.json"),
      JSON.stringify({ pstackVersion: "1.0.0" }),
    );
    writeFileSync(
      join(root, "skills", "package.json"),
      JSON.stringify({
        skills: [
          { source: "owner/whole", ref: "old", skills: ["skill-root"] },
          { source: "owner/scoped/selected", ref: "old", skills: ["skill-scoped"] },
        ],
      }),
    );
    executable(join(bin, "curl"), 'echo \'{"version":"1.0.0"}\'');
    executable(
      join(bin, "gh"),
      `case "$2" in
      */git/trees/*) printf '%s\\n' 'nested/skill-root/SKILL.md' 'selected/skill-scoped/SKILL.md' 'elsewhere/skill-scoped/SKILL.md' ;;
      */commits*sha=*) echo old ;;
      */commits*) echo new ;;
      *) echo main ;;
    esac`,
    );
    const result = spawnSync("bash", [join(root, "scripts", "upstream-watch.sh")], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      "skill-root|old|new|https://github.com/owner/whole/commits/main/nested/skill-root",
      "skill-scoped|old|new|https://github.com/owner/scoped/commits/main/selected/skill-scoped",
    ]);
  });

  it("restores same-version commits after a lock switch and reuses an unchanged pin offline", () => {
    const root = join(temporary, "fetch-upstream");
    const source = join(root, "source");
    const native = join(root, "native");
    mkdirSync(join(source, "pstack"), { recursive: true });
    mkdirSync(join(native, "scripts"), { recursive: true });
    const script = join(native, "scripts", "fetch-upstream.ts");
    copyFileSync(join(repository, "native", "scripts", "fetch-upstream.ts"), script);
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
});
