import { readFileSync } from "node:fs";

import type { Context } from "@deepseek-ai/cordis";
import type { PresetDefinition } from "@deepseek-ai/dsh-agent-preset-registry";
import { describe, expect, it } from "vite-plus/test";

import { FALLBACK_LOCALE, PRESET_COPY, presetCopyFor } from "../presets/preset-copy.ts";
import { localizePresetConfig, readWebUiLocale } from "../preset.ts";

const PATCH = readFileSync("cordis.patch.yml", "utf8");

const PRESET_IDS = ["poteto-agent", "comment-sicko", "readonly"] as const;

function presetBlock(id: string): string[] {
  const lines = PATCH.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `    - id: preset-${id}`);
  if (start < 0) throw new Error(`preset ${id} not found`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("    - id: "));
  return lines.slice(start, end < 0 ? undefined : end);
}

function configField(block: readonly string[], field: string): string | undefined {
  const config = block.findIndex((line) => line === "      config:");
  if (config < 0) return undefined;
  const line = block
    .slice(config + 1)
    .find((candidate) => candidate.startsWith(`        ${field}:`));
  return line?.replace(/^.*?:\s*/, "").trim();
}

function contextWithLocale(preference?: string): Context {
  return {
    get(name: string) {
      if (name !== "settings") return undefined;
      return {
        describe: () => [
          {
            ns: "locale",
            value: preference === undefined ? {} : { preference },
          },
        ],
      };
    },
  } as unknown as Context;
}

function preset(id: string): PresetDefinition {
  return {
    id,
    name: `source ${id}`,
    description: `source description for ${id}`,
    plugins: [],
  };
}

describe("presetCopyFor", () => {
  it("resolves an exact tag, a primary tag, and the fallback locale", () => {
    expect(presetCopyFor("poteto-agent", "zh-CN")?.name).toBe(PRESET_COPY.zh["poteto-agent"]?.name);
    expect(presetCopyFor("poteto-agent", "en-US")?.name).toBe(
      PRESET_COPY[FALLBACK_LOCALE]?.["poteto-agent"]?.name,
    );
    expect(presetCopyFor("poteto-agent", "ja")?.name).toBe(
      PRESET_COPY[FALLBACK_LOCALE]?.["poteto-agent"]?.name,
    );
    expect(presetCopyFor("poteto-agent", undefined)?.name).toBe(
      PRESET_COPY[FALLBACK_LOCALE]?.["poteto-agent"]?.name,
    );
  });
});

describe("preset copy", () => {
  it("ships copy for every preset in every catalog", () => {
    for (const catalog of Object.values(PRESET_COPY)) {
      for (const id of PRESET_IDS) {
        expect(catalog[id]?.name).not.toBe("");
        expect(catalog[id]?.description).not.toBe("");
      }
    }
  });

  it("keeps the fallback copy in sync with the preset declarations", () => {
    for (const id of PRESET_IDS) {
      const block = presetBlock(id);
      expect(PRESET_COPY[FALLBACK_LOCALE]?.[id]?.name).toBe(configField(block, "name"));
      expect(PRESET_COPY[FALLBACK_LOCALE]?.[id]?.description).toBe(
        configField(block, "description"),
      );
    }
  });

  it("routes every preset row through the localized wrapper", () => {
    expect(PATCH.match(/name: "dsh-pstack\/preset"/g)).toHaveLength(PRESET_IDS.length);
  });
});

describe("localizePresetConfig", () => {
  it("reads locale.preference from the Web UI settings", () => {
    expect(readWebUiLocale(contextWithLocale("zh-CN"))).toBe("zh-CN");
    expect(readWebUiLocale(contextWithLocale())).toBeUndefined();
    expect(readWebUiLocale({ get: () => undefined } as unknown as Context)).toBeUndefined();
  });

  it("uses the matching locale catalog", () => {
    const localized = localizePresetConfig(contextWithLocale("zh"), preset("poteto-agent"));
    expect(localized.name).toBe(PRESET_COPY.zh["poteto-agent"]?.name);
    expect(localized.description).toBe(PRESET_COPY.zh["poteto-agent"]?.description);
  });

  it("uses the fallback copy when the preference is absent or unknown", () => {
    const expected = {
      ...preset("poteto-agent"),
      name: PRESET_COPY[FALLBACK_LOCALE]?.["poteto-agent"]?.name,
      description: PRESET_COPY[FALLBACK_LOCALE]?.["poteto-agent"]?.description,
    };
    expect(localizePresetConfig(contextWithLocale(), preset("poteto-agent"))).toEqual(expected);
    expect(localizePresetConfig(contextWithLocale("ja"), preset("poteto-agent"))).toEqual(expected);
  });

  it("leaves unknown preset ids untouched", () => {
    expect(localizePresetConfig(contextWithLocale("zh"), preset("custom"))).toEqual(
      preset("custom"),
    );
  });
});
