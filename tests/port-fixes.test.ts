import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { load } from "js-yaml";

const ROOT = resolve(import.meta.dirname, "..");
const SCRIPT = join(ROOT, "pstack/scripts/port-fixes.mjs");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(active: unknown[], archive: unknown[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "port-fixes-"));
  directories.push(directory);
  return {
    directory,
    active: { schema: 1, fixes: active },
    archive: { schema: 1, fixes: archive },
  };
}

function fix(overrides: Record<string, unknown> = {}) {
  return {
    id: "FIX-001",
    issue: "#123",
    kind: "bug",
    title: "regression",
    files: ["tests/example.test.ts"],
    test: 'node -e "process.exit(0)"',
    status: "active",
    verified_against: { pstack: "abc", dsh: "def" },
    note: "keep",
    ...overrides,
  };
}

function run(
  command: "replay" | "compact",
  ledger: ReturnType<typeof fixture>,
  args: string[] = [],
) {
  const setup = `const fs=require('node:fs');fs.mkdirSync('docs',{recursive:true});fs.writeFileSync('docs/port-fixes.yaml',JSON.stringify(${JSON.stringify(ledger.active)}));fs.writeFileSync('docs/port-fixes-archive.yaml',JSON.stringify(${JSON.stringify(ledger.archive)}));`;
  const initialized = spawnSync(process.execPath, ["-e", setup], { cwd: ledger.directory });
  if (initialized.status !== 0) throw new Error("failed to initialize FIX fixture");
  return spawnSync(process.execPath, [SCRIPT, command, ...args], {
    cwd: ledger.directory,
    encoding: "utf8",
  });
}

describe("port-fixes", () => {
  it("passes an empty ledger without running tests", () => {
    const result = run("replay", fixture([]));
    expect(result?.status).toBe(0);
    expect(result?.stdout).toContain("No active FIX records");
  });

  it("replays active fixes only and returns failure for a failed test", () => {
    const ledger = fixture([
      fix({ id: "FIX-001", status: "open", test: 'node -e "process.exit(1)"' }),
      fix({ id: "FIX-002", test: 'node -e "process.exit(1)"' }),
      fix({ id: "FIX-003", test: 'node -e "process.exit(0)"' }),
    ]);
    const result = run("replay", ledger);
    expect(result?.stderr).toBe("");
    expect(result?.status).toBe(1);
    expect(result?.stdout).not.toContain("RUN FIX-001");
    expect(result?.stdout).toContain("FAIL FIX-002");
    expect(result?.stdout).toContain("PASS FIX-003");
  });

  it("compacts retired records into the archive without reusing ids", () => {
    const retired = fix({
      status: "upstream-fixed",
      retired_at: "2026-10-29",
      retired_reason: "upstream contains the fix",
    });
    const ledger = fixture([
      fix({ id: "FIX-001", status: "active" }),
      fix({ ...retired, id: "FIX-002" }),
    ]);
    const result = run("compact", ledger);
    expect(result?.status).toBe(0);
    const active = load(readFileSync(join(ledger.directory, "docs/port-fixes.yaml"), "utf8")) as {
      fixes: Array<{ id: string }>;
    };
    const archive = load(
      readFileSync(join(ledger.directory, "docs/port-fixes-archive.yaml"), "utf8"),
    ) as { fixes: unknown[] };
    expect(active.fixes.map(({ id }: { id: string }) => id)).toEqual(["FIX-001"]);
    expect(archive.fixes[0]).toMatchObject({
      id: "FIX-002",
      status: "upstream-fixed",
      retired_reason: "upstream contains the fix",
    });
    expect(run("replay", ledger)?.status).toBe(0);
    expect(
      run("compact", fixture([fix({ ...retired, id: "FIX-002" })], archive.fixes))?.status,
    ).toBe(1);
  });

  it("rejects invalid ledgers and unknown commands", () => {
    expect(run("replay", fixture([fix({ status: "active", test: "" })]))?.status).toBe(1);
    expect(run("replay", fixture([]), ["unexpected"])?.status).toBe(2);
  });
});
