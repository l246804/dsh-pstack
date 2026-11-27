/** Shared catalogue types, schema, and wire decoder. */

import type { JsonSchemaNode } from "@deepseek-ai/dsh-tools";

import { WireTypeError, optionalString, parseRecord } from "../lib/wire-error.ts";

export interface ModelEntry {
  readonly provider: string;
  readonly id: string;
  readonly efforts: readonly string[];
  readonly defaultEffort?: string;
  readonly error?: string;
}

export interface ProviderEntry {
  readonly provider: string;
  readonly name: string;
  readonly models: readonly ModelEntry[];
  readonly error?: string;
}

export interface CatalogueResult {
  readonly providers: readonly ProviderEntry[];
  readonly truncated: boolean;
  readonly providerFilter?: string;
}

export const CATALOGUE_OUTPUT_SCHEMA: JsonSchemaNode = {
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
                provider: { type: "string" },
                id: { type: "string" },
                efforts: { type: "array", items: { type: "string" } },
                defaultEffort: { type: "string" },
                error: { type: "string" },
              },
              required: ["provider", "id", "efforts"],
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

/** Parse the live model catalogue returned by the Host. */
export function parseCatalogueResult(value: unknown): CatalogueResult {
  const record = parseRecord(value, "catalogue");
  if (!Array.isArray(record["providers"])) {
    throw new WireTypeError("catalogue.providers", "an array");
  }
  if (typeof record["truncated"] !== "boolean") {
    throw new WireTypeError("catalogue.truncated", "a boolean");
  }
  const providerFilter = optionalString(record, "providerFilter", "catalogue");
  return {
    providers: record["providers"].map((provider, index) => {
      const path = `catalogue.providers[${index}]`;
      const entry = parseRecord(provider, path);
      if (typeof entry["provider"] !== "string" || typeof entry["name"] !== "string") {
        throw new WireTypeError(path, "provider and name strings");
      }
      if (!Array.isArray(entry["models"])) {
        throw new WireTypeError(`${path}.models`, "an array");
      }
      const providerError = optionalString(entry, "error", path);
      return {
        provider: entry["provider"],
        name: entry["name"],
        ...(providerError === undefined ? {} : { error: providerError }),
        models: entry["models"].map((model, modelIndex) => {
          const modelPath = `${path}.models[${modelIndex}]`;
          const item = parseRecord(model, modelPath);
          if (typeof item["provider"] !== "string" || typeof item["id"] !== "string") {
            throw new WireTypeError(modelPath, "provider and id strings");
          }
          const efforts = item["efforts"];
          if (!Array.isArray(efforts) || efforts.some((effort) => typeof effort !== "string")) {
            throw new WireTypeError(`${modelPath}.efforts`, "an array of strings");
          }
          const defaultEffort = optionalString(item, "defaultEffort", modelPath);
          const modelError = optionalString(item, "error", modelPath);
          return {
            provider: item["provider"],
            id: item["id"],
            efforts,
            ...(defaultEffort === undefined ? {} : { defaultEffort }),
            ...(modelError === undefined ? {} : { error: modelError }),
          };
        }),
      };
    }),
    truncated: record["truncated"],
    ...(providerFilter === undefined ? {} : { providerFilter }),
  };
}
