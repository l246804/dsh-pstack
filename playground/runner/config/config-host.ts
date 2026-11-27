import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";
import { z } from "zod";

import type { DeepSeekModel, ProviderConfig, ProviderModel } from "../types.ts";

export interface HostModelSelection {
  id: string;
  /** Pi-ai effort tiers for this model; ignored on DeepSeek routes. */
  efforts?: string[];
}

export type HostProviderSelection =
  | {
      models?: HostModelSelection[];
      /** Provider-level reasoning; required for the pi-ai route. */
      reasoning?: string;
      /** Optional direct key for the gitignored config.ts; otherwise apiKeyEnv/credentials. */
      apiKey?: string;
    }
  | { account: true };

const hostPatchRows = z.array(
  z.object({ id: z.string().optional(), config: z.record(z.string(), z.unknown()).optional() }),
);
type HostPatchRow = z.infer<typeof hostPatchRows>[number];

const DEFAULT_HOST_PATCH = join(homedir(), ".dsh/profiles/web/cordis.patch.yml");

function rows(file: string): HostPatchRow[] {
  if (!existsSync(file)) {
    throw new Error(`host patch not found at ${file}; pass file to fromHost`);
  }
  const parsed = yamlLoad(readFileSync(file, "utf8"));
  if (parsed === undefined || parsed === null) return [];
  if (!Array.isArray(parsed)) {
    throw new Error(`host patch must be a YAML list: ${file}`);
  }
  const result = hostPatchRows.safeParse(parsed);
  if (!result.success)
    throw new Error(`host patch has an invalid row: ${file}: ${result.error.message}`);
  return result.data;
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

function selectedDeepSeekModels(
  models: DeepSeekModel[],
  wanted: HostModelSelection[],
  label: string,
): DeepSeekModel[] {
  // No selection inherits the host catalog; DSH would otherwise fall back to its default one.
  if (wanted.length === 0) return models;
  const ids = new Set(models.map((model) => model.id));
  for (const entry of wanted) {
    if (!ids.has(entry.id)) throw new Error(`${label} does not list model ${entry.id}`);
  }
  return models.filter((model) => wanted.some((entry) => entry.id === model.id));
}

function hostProvider(patch: HostPatchRow[], id: string): Record<string, unknown> | undefined {
  return patch.find((entry) => entry.id === id)?.config;
}

export interface FromHostOptions {
  /** Host DSH web profile patch; defaults to ~/.dsh/profiles/web. */
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
  const file = options.file ?? DEFAULT_HOST_PATCH;
  const patch = rows(file);
  const env = options.env ?? {};
  const result: Record<string, ProviderConfig> = {};
  const piRow = hostProvider(patch, "llm-pi-ai");
  const pi = (piRow?.providers ?? {}) as Record<
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
      if (selection.models === undefined || selection.models.length === 0) {
        throw new Error(`host pi-ai provider ${name} selection has no models`);
      }
      if (selection.reasoning === undefined) {
        throw new Error(`host pi-ai provider ${name} selection has no reasoning`);
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
      for (const entry of selection.models ?? []) {
        if (entry.efforts !== undefined) {
          throw new Error(
            `${name} sets per-model efforts; DeepSeek routes take provider-level reasoning instead`,
          );
        }
      }
      const config = hostProvider(patch, "llm-deepseek") ?? {};
      const apiKeyEnv =
        typeof config.apiKeyEnv === "string" && config.apiKeyEnv !== ""
          ? config.apiKeyEnv
          : "DEEPSEEK_API_KEY";
      const hostModels = config.models as DeepSeekModel[] | undefined;
      const reasoning =
        selection.reasoning ??
        (typeof config.reasoningEffort === "string" ? config.reasoningEffort : undefined);
      result[name] = {
        kind: "deepseek-api-key",
        apiKey: selection.apiKey ?? env[apiKeyEnv] ?? `\${${apiKeyEnv}}`,
        apiKeyEnv,
        ...(hostModels === undefined
          ? {}
          : {
              models: selectedDeepSeekModels(
                hostModels,
                selection.models ?? [],
                "host DeepSeek API-key route",
              ),
            }),
        ...(reasoning === undefined ? {} : { reasoning }),
      };
      continue;
    }
    if (name === "deepseek-account") {
      if (!("account" in selection)) {
        throw new Error("deepseek-account must be selected with { account: true }");
      }
      const config = hostProvider(patch, "llm-deepseek-account");
      if (config === undefined) {
        result[name] = { kind: "deepseek-account" };
        continue;
      }
      if ("models" in config && config.models !== undefined) {
        throw new Error(
          "host DeepSeek account route still configures models; DSH 0.2.3-alpha.2 no longer accepts account models, use modelOverrides instead",
        );
      }
      const reasoning =
        typeof config.reasoningEffort === "string" ? config.reasoningEffort : undefined;
      result[name] = {
        kind: "deepseek-account",
        ...(config.modelOverrides === undefined
          ? {}
          : { modelOverrides: config.modelOverrides as Record<string, unknown> }),
        ...(reasoning === undefined ? {} : { reasoning }),
      };
      continue;
    }
    throw new Error(`host patch has no provider ${name}`);
  }
  return result;
}
