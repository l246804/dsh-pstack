import type {
  AllowedRoute,
  PlaygroundConfig,
  ProviderConfig,
  ProviderModel,
  TestTarget,
} from "../types.ts";

export const DEEPSEEK_OFFICIAL_ROUTE = "deepseek-official";
export const DEEPSEEK_ACCOUNT_ROUTE = "deepseek-account";
export const DEFAULT_DEEPSEEK_API_KEY_ENV = "DEEPSEEK_API_KEY";

const DEFAULT_EFFORTS = ["off", "low", "high", "max"];

const DEEPSEEK_BUILTIN_MODELS: ProviderModel[] = [
  {
    id: "deepseek-flash",
    name: "DeepSeek Flash",
    reasoningEfforts: { off: null, low: "low", high: "high", max: "max" },
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    reasoningEfforts: { off: null, low: "low", high: "high", max: "max" },
  },
];

export interface ProviderPlan {
  routes: AllowedRoute[];
  providers: Record<string, ProviderConfig>;
  /** The main route's credential environment, when the route uses one. */
  apiKeyEnv?: string;
  apiKey?: string;
  /** Every configured secret, for record redaction checks. */
  secrets: string[];
  main: TestTarget & { name: string };
}

export function providerRouteName(name: string, provider: ProviderConfig): string {
  if (provider.kind === "deepseek-api-key") return DEEPSEEK_OFFICIAL_ROUTE;
  if (provider.kind === "deepseek-account") return DEEPSEEK_ACCOUNT_ROUTE;
  return name;
}

function modelEfforts(model: ProviderModel): string[] {
  const declared = Object.keys(model.reasoningEfforts ?? {});
  return declared.length > 0 ? declared : DEFAULT_EFFORTS;
}

function modelsFor(provider: ProviderConfig): ProviderModel[] | undefined {
  if (provider.kind === "pi-ai") return provider.models;
  if (provider.kind === "deepseek-api-key") return provider.models ?? DEEPSEEK_BUILTIN_MODELS;
  return undefined;
}

function apiKeyEnvFor(provider: ProviderConfig): string | undefined {
  if (provider.kind === "pi-ai") return provider.apiKeyEnv;
  if (provider.kind === "deepseek-api-key") {
    return provider.apiKeyEnv ?? DEFAULT_DEEPSEEK_API_KEY_ENV;
  }
  return undefined;
}

export function providerSecrets(config: PlaygroundConfig): string[] {
  return Object.values(config.providers).flatMap((provider) =>
    provider.kind === "deepseek-account" ? [] : [provider.apiKey],
  );
}

export function loadProviderPlan(config: PlaygroundConfig): ProviderPlan {
  const routes: AllowedRoute[] = [];
  const secrets: string[] = [];
  const modelsByProvider = new Map<string, Map<string, string[]>>();

  for (const [name, provider] of Object.entries(config.providers)) {
    if (provider.kind === "deepseek-api-key" && name !== DEEPSEEK_OFFICIAL_ROUTE) {
      throw new Error(
        `provider ${name} must be named ${DEEPSEEK_OFFICIAL_ROUTE} for the DeepSeek API-key route`,
      );
    }
    if (provider.kind === "deepseek-account" && name !== DEEPSEEK_ACCOUNT_ROUTE) {
      throw new Error(
        `provider ${name} must be named ${DEEPSEEK_ACCOUNT_ROUTE} for the DeepSeek account route`,
      );
    }
    if (provider.kind !== "deepseek-account") {
      if (!provider.apiKey) {
        throw new Error(`provider ${name} has no apiKey; set it from the environment in config.ts`);
      }
      secrets.push(provider.apiKey);
    }
    const models = modelsFor(provider);
    if (models === undefined) continue;
    const byId = new Map<string, string[]>();
    for (const model of models) {
      const efforts = modelEfforts(model);
      byId.set(model.id, efforts);
      routes.push({
        provider: providerRouteName(name, provider),
        model: model.id,
        effort: "",
        efforts,
        apiKey: provider.kind === "deepseek-account" ? "" : provider.apiKey,
      });
    }
    modelsByProvider.set(name, byId);
  }

  const supports = (providerName: string, target: TestTarget): boolean => {
    const provider = config.providers[providerName];
    if (provider === undefined) return false;
    if (provider.kind === "deepseek-account") return DEFAULT_EFFORTS.includes(target.effort);
    const byId = modelsByProvider.get(providerName);
    return byId?.get(target.model)?.includes(target.effort) ?? false;
  };

  if (!supports(config.testModel.provider, config.testModel)) {
    throw new Error(
      `testModel ${config.testModel.provider}/${config.testModel.model}[${config.testModel.effort}] is not allowed by config.providers`,
    );
  }
  for (const [role, value] of Object.entries(config.roleModels ?? {})) {
    for (const route of Array.isArray(value) ? value : [value]) {
      if (!supports(route.provider, route)) {
        throw new Error(`roleModels.${role} names an unknown provider, model, or effort`);
      }
    }
  }

  const mainProvider = config.providers[config.testModel.provider]!;
  const models = modelsFor(mainProvider);
  const modelName =
    models?.find((model) => model.id === config.testModel.model)?.name ?? config.testModel.model;
  return {
    routes,
    providers: config.providers,
    ...(apiKeyEnvFor(mainProvider) === undefined
      ? {}
      : { apiKeyEnv: apiKeyEnvFor(mainProvider) as string }),
    ...(mainProvider.kind === "deepseek-account" ? {} : { apiKey: mainProvider.apiKey }),
    secrets,
    main: {
      ...config.testModel,
      provider: providerRouteName(config.testModel.provider, mainProvider),
      name: modelName,
    },
  };
}
