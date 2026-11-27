/**
 * `pstack_models`: a read-only directory of the routes this deployment serves.
 *
 * Every entry comes from the live LLM adapter registry. The tool never invents
 * a provider, model, or reasoning-effort token from a Cursor slug, and one
 * provider whose discovery fails does not hide the others.
 */

import type { Context } from "@deepseek-ai/cordis";
import type { LlmModelInfo, LlmResolvedModelInfo, LlmRuntime } from "@deepseek-ai/dsh-llm";
import type { ToolDefinition, ToolRunContext } from "@deepseek-ai/dsh-tools";

import {
  CATALOGUE_OUTPUT_SCHEMA,
  type CatalogueResult,
  type ModelEntry,
  type ProviderEntry,
} from "./models/catalogue.ts";

export type { CatalogueResult, ModelEntry, ProviderEntry } from "./models/catalogue.ts";

import { describeError } from "./lib/errors.ts";
import { textOutput } from "./lib/tool-output.ts";

export const name = "pstack-models";

export const inject = ["llm", "tools"];

export const TOOL_NAME = "pstack_models";

const MAX_PROVIDERS = 64;
const MAX_MODELS = 200;

/** Collect the live catalogue with bounded provider/model counts. */
export async function collectCatalogue(
  llm: LlmRuntime,
  providerFilter: string | undefined,
  signal: AbortSignal,
): Promise<CatalogueResult> {
  const registered = llm.listProviders();
  const providers =
    providerFilter === undefined
      ? registered
      : registered.filter(
          (provider) => provider.id === providerFilter || provider.name === providerFilter,
        );
  const selected = providers.slice(0, MAX_PROVIDERS);
  const output: ProviderEntry[] = [];
  let truncated = providers.length > selected.length;

  for (const provider of selected) {
    signal.throwIfAborted();
    let models: readonly LlmModelInfo[];
    try {
      models = await llm.listModels(provider.id);
    } catch (error) {
      if (signal.aborted) throw error;
      output.push({
        provider: provider.id,
        name: provider.name,
        models: [],
        error: describeError(error),
      });
      continue;
    }
    if (models.length > MAX_MODELS) truncated = true;
    const entries: ModelEntry[] = [];
    for (const model of models.slice(0, MAX_MODELS)) {
      signal.throwIfAborted();
      try {
        const info: LlmResolvedModelInfo = await llm.resolveModelInfo(
          provider.id,
          model.id,
          signal,
        );
        entries.push(entryFor(provider.id, info));
      } catch (error) {
        if (signal.aborted) throw error;
        entries.push({
          provider: provider.id,
          id: model.id,
          efforts: [],
          error: describeError(error),
        });
      }
    }
    output.push({ provider: provider.id, name: provider.name, models: entries });
  }

  return {
    providers: output,
    truncated,
    ...(providerFilter === undefined ? {} : { providerFilter }),
  };
}

/** Render the catalogue as compact model-facing text. */
export function renderCatalogue(result: CatalogueResult): string {
  if (result.providers.length === 0) {
    return result.providerFilter === undefined
      ? "No provider is registered with the live adapter registry."
      : `No provider matches "${result.providerFilter}".`;
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
      const efforts =
        model.efforts.length === 0
          ? "no reasoning efforts"
          : `efforts: ${model.efforts.join(", ")}`;
      const fallback = model.defaultEffort === undefined ? "" : `; default: ${model.defaultEffort}`;
      const error = model.error === undefined ? "" : `; error: ${model.error}`;
      lines.push(`  ${model.id} — ${efforts}${fallback}${error}`);
    }
  }
  if (result.truncated) lines.push("", "Truncated at the provider/model page limits.");
  return lines.join("\n");
}

function entryFor(provider: string, info: LlmResolvedModelInfo): ModelEntry {
  return {
    provider,
    id: info.id,
    efforts: info.reasoning?.efforts.map((effort) => effort.id) ?? [],
    ...(info.reasoning?.defaultEffort === undefined
      ? {}
      : { defaultEffort: info.reasoning.defaultEffort }),
  };
}

const TOOL_DESCRIPTION = [
  "List the exact model routes this deployment serves, with each route's advertised reasoning-effort tokens.",
  "",
  "Read-only. Use it only during `/setup-pstack` to discover which routes you can configure. It does not read the role configuration. Role-to-model lookups go through `pstack_roles`. A listed route can still fail at call time.",
  "",
  "`provider` limits discovery to one registered provider id or display name; omit it to list every provider.",
  "",
  "Each heading is `<provider id> (<display name>)`. Each line under it is a model id. To use one, pass the heading's provider id as `provider` and the listed id as `model`, with an optional `reasoning_effort` from that model's efforts. Keep provider, model, and effort as separate values; never join them into a `provider/model` string.",
].join("\n");

/** Build `pstack_models` for one LLM service. */
export function createPstackModelsTool(llm: LlmRuntime): ToolDefinition {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        provider: {
          type: "string",
          description: "A registered provider id or display name; omit for every provider.",
        },
      },
    },
    output: textOutput<CatalogueResult>(CATALOGUE_OUTPUT_SCHEMA, renderCatalogue),
    isConcurrencySafe: () => true,
    async execute(rawArgs, exec: ToolRunContext) {
      if (typeof rawArgs !== "object" || rawArgs === null || Array.isArray(rawArgs)) {
        throw new Error("pstack_models takes an object argument");
      }
      const provider = (rawArgs as Record<string, unknown>)["provider"];
      if (provider !== undefined && typeof provider !== "string") {
        throw new Error("provider must be a string when present");
      }
      return collectCatalogue(llm, provider, exec.signal);
    },
  };
}

export function apply(ctx: Context): void {
  ctx.tools.register(createPstackModelsTool(ctx.llm));
}
