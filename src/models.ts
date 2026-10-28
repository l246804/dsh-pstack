/**
 * `pstack_models`: a read-only model directory for `/setup-pstack`.
 *
 * It asks `ctx.llm` which providers are registered, which models each one advertises,
 * and the exact reasoning-effort tokens each route accepts. Because a route is only real
 * when the deployment serves it, this tool never infers a slug from an upstream name:
 * every entry is what the live adapters report.
 *
 * Writes no files. One provider whose discovery fails does not discard the others, and
 * the result is bounded so a large deployment still returns a complete page.
 */

import type {
  JsonSchemaNode,
  LlmHost,
  LlmResolvedModelInfo,
  ToolDefinition,
  ToolsHost,
} from "./internal/host-contract.ts";

/** Cordis row name, used by Loader diagnostics. */
export const name = "pstack-models";

/** The hard dependencies: the adapter registry and the tool registry. */
export const inject = ["llm", "tools"];

/** Model-facing tool name. */
export const TOOL_NAME = "pstack_models";

const MAX_PROVIDERS = 64;
const MAX_MODELS_PER_PROVIDER = 200;

export interface ModelEntry {
  /** `<provider>/<model>`, the exact route a role line writes. */
  readonly route: string;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly contextWindow?: number;
  readonly maxTokens?: number;
  /** Advertised reasoning efforts, in the adapter's least-to-greatest order. */
  readonly efforts: readonly string[];
  readonly defaultEffort?: string;
  /** Set when this one model could not be resolved; the route is still listed. */
  readonly error?: string;
}

export interface ProviderEntry {
  readonly provider: string;
  readonly name: string;
  readonly models: readonly ModelEntry[];
  /** Set when this provider's model list could not be read. */
  readonly error?: string;
}

export interface CatalogueResult {
  readonly providers: readonly ProviderEntry[];
  readonly truncated: boolean;
  readonly providerFilter?: string;
}

function entryFromInfo(provider: string, info: LlmResolvedModelInfo): ModelEntry {
  const efforts = info.reasoning?.efforts.map((effort) => effort.id) ?? [];
  return {
    route: `${provider}/${info.id}`,
    id: info.id,
    name: info.name,
    ...(info.description === undefined ? {} : { description: info.description }),
    ...(info.context?.contextWindow === undefined ? {} : { contextWindow: info.context.contextWindow }),
    ...(info.defaultMaxTokens === undefined ? {} : { maxTokens: info.defaultMaxTokens }),
    efforts,
    ...(info.reasoning?.defaultEffort === undefined ? {} : { defaultEffort: info.reasoning.defaultEffort }),
  };
}

/** Collect the catalogue from the live adapters. */
export async function collectCatalogue(
  llm: LlmHost,
  providerFilter: string | undefined,
  signal: AbortSignal,
): Promise<CatalogueResult> {
  const all = llm.listProviders();
  const selected =
    providerFilter === undefined ? all : all.filter((provider) => provider.id === providerFilter || provider.name === providerFilter);

  const providers: ProviderEntry[] = [];
  let truncated = false;

  for (const provider of selected.slice(0, MAX_PROVIDERS)) {
    let models;
    try {
      models = await llm.listModels(provider.id);
    } catch (error) {
      providers.push({ provider: provider.id, name: provider.name, models: [], error: describeError(error) });
      continue;
    }
    if (models.length > MAX_MODELS_PER_PROVIDER) truncated = true;

    const entries: ModelEntry[] = [];
    for (const model of models.slice(0, MAX_MODELS_PER_PROVIDER)) {
      signal.throwIfAborted();
      try {
        entries.push(entryFromInfo(provider.id, await llm.resolveModelInfo(provider.id, model.id, signal)));
      } catch (error) {
        entries.push({
          route: `${provider.id}/${model.id}`,
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
          efforts: [],
          error: describeError(error),
        });
      }
    }
    providers.push({ provider: provider.id, name: provider.name, models: entries });
  }

  if (selected.length > MAX_PROVIDERS) truncated = true;

  return {
    providers,
    truncated,
    ...(providerFilter === undefined ? {} : { providerFilter }),
  };
}

export function renderCatalogue(result: CatalogueResult): string {
  if (result.providers.length === 0) {
    return result.providerFilter === undefined
      ? "No provider is registered with the live adapter registry."
      : `No provider matches "${result.providerFilter}". Registered providers are listed when \`provider\` is omitted.`;
  }

  const lines: string[] = [];
  for (const provider of result.providers) {
    lines.push(`${provider.provider} (${provider.name})`);
    if (provider.error !== undefined) {
      lines.push(`  model discovery failed: ${provider.error}`);
      continue;
    }
    if (provider.models.length === 0) {
      lines.push("  no models advertised");
      continue;
    }
    for (const model of provider.models) {
      const efforts = model.efforts.length === 0 ? "no reasoning efforts" : `efforts: ${model.efforts.join(", ")}`;
      const defaultEffort = model.defaultEffort === undefined ? "" : `; default: ${model.defaultEffort}`;
      const failure = model.error === undefined ? "" : `; error: ${model.error}`;
      lines.push(`  ${model.route} — ${efforts}${defaultEffort}${failure}`);
    }
  }
  if (result.truncated) lines.push("", `Truncated at ${MAX_PROVIDERS} providers and ${MAX_MODELS_PER_PROVIDER} models each.`);
  return lines.join("\n");
}

const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: "object",
  additionalProperties: false,
  properties: {
    providers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          provider: { type: "string" },
          name: { type: "string" },
          error: { type: "string" },
          models: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                route: { type: "string" },
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                contextWindow: { type: "integer" },
                maxTokens: { type: "integer" },
                efforts: { type: "array", items: { type: "string" } },
                defaultEffort: { type: "string" },
                error: { type: "string" },
              },
              required: ["route", "id", "name", "efforts"],
            },
          },
        },
        required: ["provider", "name", "models"],
      },
    },
    truncated: { type: "boolean" },
    providerFilter: { type: "string" },
  },
  required: ["providers", "truncated"],
};

const TOOL_DESCRIPTION = [
  "List the exact model routes this deployment serves, with each route's advertised reasoning-effort tokens.",
  "",
  "Read-only. Use it before writing `$DSH_HOME/pstack-models.md`: it reports what the live adapters actually serve, so a role line names a route that exists instead of a slug guessed from an upstream name.",
  "",
  "`provider` limits discovery to one registered provider id or display name; omit it to list every provider.",
  "",
  "A route is written `<provider>/<model>`, and a role line may add `[effort]` using a token from that route's `efforts`. A provider whose discovery fails is reported beside the others rather than dropping the whole catalog.",
].join("\n");

export function createPstackModelsTool(llm: LlmHost): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        provider: {
          type: "string",
          description: "A registered provider id or display name to limit discovery to. Omit it to list every provider.",
        },
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: "text", text: renderCatalogue(value as unknown as CatalogueResult) }],
    },
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec) {
      const provider = readProviderArgument(rawArgs);
      const result = await collectCatalogue(llm, provider, exec.signal);
      return result;
    },
  };
}

function readProviderArgument(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("pstack_models arguments must be an object");
  const provider = (raw as Record<string, unknown>)["provider"];
  if (provider === undefined) return undefined;
  if (typeof provider !== "string" || provider.trim() === "") {
    throw new Error("`provider` must be a non-empty string when present");
  }
  return provider.trim();
}

/** The slice of the Cordis context this row uses. */
export interface PstackModelsHost {
  readonly llm: LlmHost;
  readonly tools: ToolsHost;
}

/** Register `pstack_models`. */
export function apply(ctx: PstackModelsHost): void {
  ctx.tools.register(createPstackModelsTool(ctx.llm));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? `${error.message} (${code})` : error.message;
  }
  return String(error);
}
