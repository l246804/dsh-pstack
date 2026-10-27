import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/root.ts";
import { assertArtifact } from "../scripts/build-runtime.ts";
import {
  RUNTIME_CLIS,
  RUNTIME_ENTRIES,
  RUNTIME_TESTS,
  SHEBANG,
  isReplacedUpstreamScript,
} from "../scripts/runtime-manifest.ts";
import { HEADER as AUDIT_HEADER } from "../scripts/runtime/worktree-audit.ts";

/**
 * The contract every shipped script artifact has to keep.
 *
 * These assertions are about the bytes that ship, not about the sources: the whole
 * point of the runtime build is that an installed package can run each CLI with
 * nothing else present, and that is a property of the emitted file.
 */
const artifacts = RUNTIME_ENTRIES.map((entry) => ({
  entry,
  path: join(ROOT, ".build", "runtime", ...entry.out.split("/")),
}));

function text(path: string): string {
  return readFileSync(path, "utf8");
}

describe("shipped script artifacts", () => {
  it("ships five CLIs and five test bundles", () => {
    expect(RUNTIME_CLIS).toHaveLength(5);
    expect(RUNTIME_TESTS).toHaveLength(5);
    expect(RUNTIME_CLIS.map((entry) => entry.id)).toEqual([
      "check-plan",
      "orch",
      "watch-pr",
      "worktree-audit",
      "log",
    ]);
  });

  it("names every CLI with a .mjs extension", () => {
    for (const entry of RUNTIME_CLIS) {
      expect(entry.assetPath.endsWith(".mjs"), entry.assetPath).toBe(true);
      expect(entry.executable, entry.id).toBe(true);
    }
    for (const entry of RUNTIME_TESTS) {
      expect(entry.assetPath.endsWith(".test.mjs"), entry.assetPath).toBe(true);
      expect(entry.executable, entry.id).toBe(false);
    }
  });

  it("starts every artifact with one Node shebang and nothing before it", () => {
    for (const { entry, path } of artifacts) {
      const body = text(path);
      expect(body.startsWith(SHEBANG), entry.id).toBe(true);
      // Exactly one line-initial shebang, or Node rejects the file.
      const shebangs = body.split("\n").filter((line) => line.startsWith("#!"));
      expect(shebangs, entry.id).toHaveLength(1);
      expect(body.endsWith("\n"), entry.id).toBe(true);
      expect(body.includes("\r"), entry.id).toBe(false);
    }
  });

  it("passes its own bundle assertion", () => {
    for (const { entry, path } of artifacts) {
      expect(() => assertArtifact(entry, text(path)), entry.id).not.toThrow();
    }
  });

  it("carries no Bun, bash, or node_modules dependency", () => {
    for (const { entry, path } of artifacts) {
      const body = text(path);
      expect(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']bun:/.test(body), entry.id).toBe(false);
      expect(body.includes("#!/usr/bin/env bun"), entry.id).toBe(false);
      // A shell-out to install something would defeat the point of the build.
      expect(body.includes("bun install"), entry.id).toBe(false);
      expect(body.includes("--frozen-lockfile"), entry.id).toBe(false);
      expect(/["']node_modules\//.test(body), entry.id).toBe(false);
      // `commander` must be inlined, never resolved at runtime.
      expect(/require\s*\(\s*["']commander["']\s*\)/.test(body), entry.id).toBe(false);
      expect(/from\s*["']commander["']/.test(body), entry.id).toBe(false);
    }
  });

  it("inlines commander instead of importing it", () => {
    // The watcher is the one CLI that needs it, so this is the file that proves the
    // alias worked rather than leaving a bare specifier behind.
    const watcher = text(join(ROOT, ".build", "runtime", "watch-pr", "watch-pr.mjs"));
    expect(watcher).toContain("commander");
    expect(watcher).not.toMatch(/from\s*["']commander["']/);
  });

  it("marks the executable bit only on the CLIs", () => {
    for (const { entry, path } of artifacts) {
      const mode = statSync(path).mode & 0o777;
      expect(mode, entry.id).toBe(entry.executable ? 0o755 : 0o644);
    }
  });

  it("replaces exactly the two script directories", () => {
    expect(isReplacedUpstreamScript("skills/poteto-mode/scripts/orch/orch.ts")).toBe(true);
    expect(isReplacedUpstreamScript("skills/show-me-your-work/scripts/log.sh")).toBe(true);
    expect(isReplacedUpstreamScript("skills/poteto-mode/SKILL.md")).toBe(false);
    expect(isReplacedUpstreamScript("skills/poteto-mode/playbooks/eval.md")).toBe(false);
  });
});

describe("the worktree audit keeps its documented columns", () => {
  it("advertises the shipped file name in its usage text", () => {
    const body = text(join(ROOT, ".build", "runtime", "worktree-audit.mjs"));
    // The usage line names the file that actually ships. A doc comment may still say
    // which upstream script this replaced, so the assertion targets the usage string.
    expect(body).toContain("Usage: worktree-audit.mjs");
    expect(body).not.toContain("Usage: worktree-audit.sh");
  });

  it("keeps the ten columns in order", () => {
    expect(AUDIT_HEADER.join("\t")).toBe(
      "SIZE\tAGE\tMERGED\tDIRTY\tREMOTE\tPR\tLAST_CHAT\tPINNED\tBUCKET\tWORKTREE",
    );
    expect(AUDIT_HEADER).toHaveLength(10);
  });

  it("never reads the session store", () => {
    const body = text(join(ROOT, ".build", "runtime", "worktree-audit.mjs"));
    // No DSH session storage path, no transcript scan; the only usage input is the
    // caller's `--sessions` file.
    expect(body).not.toContain("agent-transcripts");
    expect(body).not.toContain(".dsh/sessions");
    expect(body).not.toContain(".cursor/projects");
    expect(body).toContain("--sessions");
  });

  it("keeps the unknown-usage and pinned guarantees", () => {
    const body = text(join(ROOT, ".build", "runtime", "worktree-audit.mjs"));
    expect(body).toContain("unknown-usage");
    expect(body).toContain("verify-recent-chat");
    expect(body).toContain("hold-wip");
    expect(body).toContain("hold-open-pr");
    expect(body).toContain("safe");
    expect(body).toContain("review");
    expect(body).toContain('"unknown"');
  });
});
