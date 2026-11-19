import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";

import type { AllowedRoute, PlaygroundConfig, TestTarget } from "../types.ts";

export const DEFAULT_HOST_PATCH_FILE = join(homedir(), ".dsh/profiles/web/cordis.patch.yml");

interface HostModel {
  id: string;
  name?: string;
  reasoningEfforts?: Record<string, string | null>;
}

interface HostProvider {
  apiKeyEnv?: string;
  models?: HostModel[];
  [key: string]: unknown;
}

export interface ProviderPlan {
  routes: AllowedRoute[];
  providers: Record<string, HostProvider>;
  apiKeyEnv: string;
  apiKey: string;
  main: TestTarget & { name: string };
}

function readHostProviders(file: string): Record<string, HostProvider> {
  if (!existsSync(file)) {
    throw new Error(
      `host provider patch not found at ${file}; set hostPatchFile in playground/config.json`,
    );
  }
  const entries = yamlLoad(readFileSync(file, "utf8")) as Array<{
    id?: string;
    config?: { providers?: Record<string, HostProvider> };
  }>;
  const providers = entries.find((entry) => entry.id === "llm-pi-ai")?.config?.providers;
  if (!providers || Object.keys(providers).length === 0) {
    throw new Error(`no llm-pi-ai providers in ${file}`);
  }
  return providers;
}

export function loadProviderPlan(
  config: PlaygroundConfig,
  hostFile = config.hostPatchFile ??
    process.env.PLAYGROUND_HOST_PATCH_FILE ??
    DEFAULT_HOST_PATCH_FILE,
): ProviderPlan {
  const hostProviders = readHostProviders(hostFile);
  const routes: AllowedRoute[] = [];
  const providers: Record<string, HostProvider> = {};
  for (const [provider, entry] of Object.entries(config.providers)) {
    const host = hostProviders[provider];
    if (!host?.apiKeyEnv) throw new Error(`host provider "${provider}" has no apiKeyEnv`);
    const hostById = new Map((host.models ?? []).map((model) => [model.id, model]));
    const filteredModels: HostModel[] = [];
    for (const [model, allowedEfforts] of Object.entries(entry.models)) {
      const hostModel = hostById.get(model);
      if (!hostModel) throw new Error(`host does not deploy ${provider}/${model}`);
      const efforts = allowedEfforts.filter(
        (effort) => effort in (hostModel.reasoningEfforts ?? {}),
      );
      if (efforts.length === 0)
        throw new Error(`host deploys no allowed effort for ${provider}/${model}`);
      routes.push({ provider, model, effort: "", efforts, apiKey: entry.apiKey });
      filteredModels.push({
        ...hostModel,
        reasoningEfforts: Object.fromEntries(
          efforts.map((effort) => [effort, hostModel.reasoningEfforts?.[effort] ?? null]),
        ),
      });
    }
    providers[provider] = { ...host, models: filteredModels };
  }
  const route = routes.find(
    (entry) =>
      entry.provider === config.testModel.provider &&
      entry.model === config.testModel.model &&
      entry.efforts.includes(config.testModel.effort),
  );
  if (!route) throw new Error("the host cannot serve testModel");
  const model = providers[route.provider]?.models?.find((entry) => entry.id === route.model);
  return {
    routes,
    providers,
    apiKeyEnv: hostProviders[route.provider]?.apiKeyEnv as string,
    apiKey: route.apiKey,
    main: { ...config.testModel, name: model?.name ?? route.model },
  };
}
