import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";

import type { ProviderConfig, ProviderModel } from "../types.ts";
import { DEEPSEEK_BUILTIN_MODELS } from "./provider.ts";

export interface HostModelSelection {
  id: string;
  /** Effort tiers for this model; default low/high. */
  efforts?: string[];
}

export type HostProviderSelection =
  | {
      models: HostModelSelection[];
      /** Provider-level reasoning is required. */
      reasoning: string;
      /** Optional direct key for the gitignored config.ts; otherwise apiKeyEnv/credentials. */
      apiKey?: string;
    }
  | { account: true };

interface HostPatchRow {
  id?: string;
  config?: Record<string, unknown>;
}

const DEFAULT_HOST_PATCH = join(homedir(), ".dsh/profiles/web/cordis.patch.yml");

function rows(file: string): HostPatchRow[] {
  if (!existsSync(file)) {
    throw new Error(`host patch not found at ${file}; set PLAYGROUND_HOST_PATCH_FILE`);
  }
  return (yamlLoad(readFileSync(file, "utf8")) as HostPatchRow[]) ?? [];
}

function selectModel(model: ProviderModel, efforts: string[]): ProviderModel | null {
  const available = Object.keys(model.reasoningEfforts ?? {});
  const kept = efforts.filter((effort) => available.includes(effort));
  if (kept.length === 0) return null;
  return {
    ...model,
    reasoningEfforts: Object.fromEntries(
      kept.map((effort) => [effort, model.reasoningEfforts?.[effort] ?? null]),
    ),
  };
}

function selectedModels(
  models: ProviderModel[],
  wanted: HostModelSelection[],
  label: string,
): ProviderModel[] {
  if (wanted.length === 0) throw new Error(`${label} must select at least one model`);
  const perModel = new Map<string, string[] | undefined>();
  for (const entry of wanted) {
    if (!models.some((model) => model.id === entry.id)) {
      throw new Error(`${label} does not list model ${entry.id}`);
    }
    perModel.set(entry.id, entry.efforts);
  }
  const picked = models
    .filter((model) => perModel.has(model.id))
    .map((model) => selectModel(model, perModel.get(model.id) ?? ["low", "high"]))
    .filter((model): model is ProviderModel => model !== null);
  if (picked.length === 0) throw new Error(`${label} has no model with the selected efforts`);
  return picked;
}

function hostProvider(patch: HostPatchRow[], id: string): Record<string, unknown> {
  const row = patch.find((entry) => entry.id === id);
  if (!row?.config) throw new Error(`host patch has no ${id} config`);
  return row.config;
}

export interface FromHostOptions {
  /** Host DSH web profile patch; defaults to $PLAYGROUND_HOST_PATCH_FILE or ~/.dsh. */
  file?: string;
  /** Values from Vite loadEnv, used to resolve apiKeyEnv without copying secrets. */
  env?: Record<string, string>;
}

/**
 * Build worker provider rows from the host DSH web profile. The caller chooses
 * provider/model/effort subsets; credentials stay in env and never become part of
 * the returned object unless the caller passes them through `env`.
 */
export function fromHost(
  selections: Record<string, HostProviderSelection>,
  options: FromHostOptions = {},
): Record<string, ProviderConfig> {
  const file = options.file ?? process.env.PLAYGROUND_HOST_PATCH_FILE ?? DEFAULT_HOST_PATCH;
  const patch = rows(file);
  const env = options.env ?? {};
  const result: Record<string, ProviderConfig> = {};
  const pi = (hostProvider(patch, "llm-pi-ai").providers ?? {}) as Record<
    string,
    {
      apiKeyEnv?: string;
      api?: string;
      baseURL?: string;
      reasoning?: string;
      models?: ProviderModel[];
    }
  >;
  for (const [name, selection] of Object.entries(selections)) {
    const host = pi[name];
    if (host !== undefined) {
      if ("account" in selection) throw new Error(`host provider ${name} is not an account route`);
      if (!host.apiKeyEnv) throw new Error(`host pi-ai provider ${name} has no apiKeyEnv`);
      if (!host.models || host.models.length === 0) {
        throw new Error(`host pi-ai provider ${name} has no explicit models`);
      }
      result[name] = {
        kind: "pi-ai",
        apiKey: selection.apiKey ?? env[host.apiKeyEnv] ?? `\${${host.apiKeyEnv}}`,
        apiKeyEnv: host.apiKeyEnv,
        ...(host.api === undefined ? {} : { api: host.api }),
        ...(host.baseURL === undefined ? {} : { baseURL: host.baseURL }),
        reasoning: selection.reasoning,
        models: selectedModels(host.models, selection.models, `host pi-ai provider ${name}`),
      };
      continue;
    }
    if (name === "deepseek-official") {
      if ("account" in selection) throw new Error("deepseek-official is not an account route");
      const config = hostProvider(patch, "llm-deepseek");
      const apiKeyEnv = (config.apiKeyEnv as string | undefined) ?? "DEEPSEEK_API_KEY";
      const models = (config.models as ProviderModel[] | undefined) ?? DEEPSEEK_BUILTIN_MODELS;
      result[name] = {
        kind: "deepseek-api-key",
        apiKey: selection.apiKey ?? env[apiKeyEnv] ?? `\${${apiKeyEnv}}`,
        apiKeyEnv,
        models: selectedModels(models, selection.models, "host DeepSeek API-key route"),
      };
      continue;
    }
    if (name === "deepseek-account") {
      if (!("account" in selection)) {
        throw new Error("deepseek-account must be selected with { account: true }");
      }
      const config = hostProvider(patch, "llm-deepseek-account");
      result[name] = {
        kind: "deepseek-account",
        ...(config.modelOverrides === undefined
          ? {}
          : { modelOverrides: config.modelOverrides as Record<string, unknown> }),
      };
      continue;
    }
    throw new Error(`host patch has no provider ${name}`);
  }
  return result;
}
