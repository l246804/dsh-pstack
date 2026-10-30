import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "pstack/scripts/check-harness-doc.mjs");
const FILES = [
  "docs/harness-doc.yaml",
  "pstack/harness/docs/harness/dsh.md",
  "pstack/README.md",
  "upstream/cursor-plugins/pstack/docs/harness/claude-code.md",
];
const DOC = "pstack/harness/docs/harness/dsh.md";
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** Copy the four documents into a temp tree; source facts keep pointing at the real repo. */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "harness-doc-"));
  directories.push(directory);
  for (const path of FILES) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    cpSync(join(ROOT, path), join(directory, path));
  }
  return directory;
}

function run(directory: string, args: string[] = []) {
  return spawnSync(process.execPath, [SCRIPT, "--root", directory, "--repo-root", ROOT, ...args], {
    encoding: "utf8",
  });
}

function edit(directory: string, change: (text: string) => string) {
  const path = join(directory, DOC);
  writeFileSync(path, change(readFileSync(path, "utf8")));
}

function dropRow(directory: string, marker: string) {
  edit(directory, (text) =>
    text
      .split("\n")
      .filter((line) => !line.includes(marker))
      .join("\n"),
  );
}

describe("check-harness-doc", () => {
  it("accepts the checked-in documents", () => {
    const result = run(fixture());
    expect(result?.status).toBe(0);
    expect(result?.stdout).toContain("consistent");
  });

  it("fails when the create-skill replacement row disappears", () => {
    const directory = fixture();
    dropRow(directory, "| `create-skill` |");
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("create-skill");
  });

  it("fails when the Cursor Projects exclusion row disappears", () => {
    const directory = fixture();
    dropRow(directory, "| Cursor Projects |");
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("Cursor Projects");
  });

  it("fails when an OPT id names a package README does not list", () => {
    const directory = fixture();
    edit(directory, (text) =>
      text.replaceAll(
        "`@deepseek-ai/dsh-experimental-terminal-bundle`",
        "`@deepseek-ai/dsh-terminal`",
      ),
    );
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("OPT-05");
  });

  it("fails on a stale role filename", () => {
    const directory = fixture();
    edit(directory, (text) => `${text}\npoteto-models.mdc\n`);
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("forbidden");
  });

  it("names the manifest row to add when a replacement is missing", () => {
    const directory = fixture();
    dropRow(directory, "| `create-skill` |");
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("C1 LR-01");
    expect(result?.stdout).toContain("writing-for-agents");
    expect(result?.stdout).toContain("Edit pstack/harness/docs/harness/dsh.md by hand");
  });

  it("fails when an upstream template row disappears", () => {
    const directory = fixture();
    dropRow(directory, "| `AskQuestion` |");
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("C2");
    expect(result?.stdout).toContain("AskQuestion");
  });

  it("fails when a README platform exclusion has no manifest claim", () => {
    const directory = fixture();
    const path = join(directory, "docs/harness-doc.yaml");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("capability: [EXCL-04]", "capability: []"),
    );
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("C4 EXCL-04");
  });

  it("fails when a required section is missing", () => {
    const directory = fixture();
    edit(directory, (text) => text.replace("## Local replacements", "## Replacements"));
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("C5");
    expect(result?.stdout).toContain("Local replacements");
  });

  it("fails when README cites a nonexistent adapter section", () => {
    const directory = fixture();
    const path = join(directory, "pstack/README.md");
    writeFileSync(path, `${readFileSync(path, "utf8")}\nSee dsh.md Missing section.\n`);
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("C6");
    expect(result?.stdout).toContain("Missing section");
  });

  it("fails when a documented subagent argument drifts from src", () => {
    const directory = fixture();
    edit(directory, (text) => text.replaceAll("roleIndex", "removedArgument"));
    const result = run(directory);
    expect(result?.status).toBe(1);
    expect(result?.stdout).toContain("C8");
    expect(result?.stdout).toContain("roleIndex");
  });
});
