import type {
  DeepSeekModel,
  PlaygroundConfig,
  ProviderConfig,
  ProviderModel,
  TestTarget,
} from "../types.ts";

export const DEEPSEEK_OFFICIAL_ROUTE = "deepseek-official";
export const DEEPSEEK_ACCOUNT_ROUTE = "deepseek-account";

const DEFAULT_EFFORTS = ["low", "high"];

/** Reasoning tiers the DSH DeepSeek provider publishes at runtime. */
export const DEEPSEEK_REASONING_EFFORTS = ["off", "low", "high", "max"] as const;
type DeepSeekEffort = (typeof DEEPSEEK_REASONING_EFFORTS)[number];

function isDeepSeekEffort(effort: string): effort is DeepSeekEffort {
  return (DEEPSEEK_REASONING_EFFORTS as readonly string[]).includes(effort);
}

/**
 * Local mirror of the DSH `dsh-llm-deepseek` default catalog. Used only to
 * validate the playground's own selection; workers leave `models` unset so DSH
 * keeps owning the default catalog.
 */
export const DEEPSEEK_BUILTIN_MODELS: DeepSeekModel[] = [
  {
    id: "deepseek-flash",
    name: "DeepSeek-V4.1-Flash",
    contextWindow: 1_048_576,
    inputModalities: ["text", "image"],
    systemPromptUpdate: "in-history",
    toolUpdate: "addition-only",
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek-V4-Pro",
    contextWindow: 1_048_576,
  },
];

export interface ProviderPlan {
  providers: Record<string, ProviderConfig>;
  main: TestTarget;
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

function piModels(provider: ProviderConfig): ProviderModel[] | undefined {
  return provider.kind === "pi-ai" ? provider.models : undefined;
}

export function providerSecrets(config: PlaygroundConfig): string[] {
  return Object.values(config.providers).flatMap((provider) =>
    provider.kind === "deepseek-account" ? [] : [provider.apiKey],
  );
}

export function loadProviderPlan(config: PlaygroundConfig): ProviderPlan {
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
    } else if (!config.copyCredentials) {
      throw new Error(
        `provider ${name} uses the DeepSeek account route but copyCredentials is false; enable it or use deepseek-api-key`,
      );
    }
    const models = piModels(provider);
    if (models === undefined) continue;
    const byId = new Map<string, string[]>();
    for (const model of models) {
      const efforts = modelEfforts(model);
      byId.set(model.id, efforts);
    }
    modelsByProvider.set(name, byId);
  }

  const supports = (providerName: string, target: TestTarget): boolean => {
    const provider = config.providers[providerName];
    if (provider === undefined) return false;
    if (provider.kind === "deepseek-account") {
      return target.model !== "" && isDeepSeekEffort(target.effort);
    }
    if (provider.kind === "deepseek-api-key") {
      const models = provider.models ?? DEEPSEEK_BUILTIN_MODELS;
      const known = models.some((model) => model.id === target.model);
      return known && isDeepSeekEffort(target.effort);
    }
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
  return {
    providers: config.providers,
    main: {
      ...config.testModel,
      provider: providerRouteName(config.testModel.provider, mainProvider),
    },
  };
}
