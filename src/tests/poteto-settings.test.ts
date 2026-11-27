import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_SETTINGS,
  readSettings,
  settingsFilePath,
  writeSettings,
} from "../poteto/settings.ts";

/** A fresh settings path inside a throwaway directory, cleaned after `run`. */
function inTempFile(run: (path: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "pstack-settings-"));
  try {
    run(join(dir, "settings.json"), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("pstack settings file", () => {
  it("resolves the settings path under the pstack home for one DSH home", () => {
    expect(settingsFilePath("/home/user/.dsh")).toBe("/home/user/.dsh/pstack/settings.json");
  });

  it("falls back to defaults when the file is missing", () => {
    inTempFile((path) => {
      expect(readSettings(path)).toEqual(EMPTY_SETTINGS);
    });
  });

  it("falls back to defaults when the file is corrupt", () => {
    inTempFile((path) => {
      writeFileSync(path, "{ not valid json");
      expect(readSettings(path)).toEqual(EMPTY_SETTINGS);
    });
  });

  it("round-trips a written value and leaves no temp file behind", () => {
    inTempFile((path, dir) => {
      writeSettings({ potetoDefault: true }, path);
      expect(readSettings(path)).toEqual({ potetoDefault: true });
      expect(readFileSync(path, "utf8")).toBe('{\n  "potetoDefault": true\n}\n');
      expect(readdirSync(dir)).toEqual(["settings.json"]);
    });
  });
});
