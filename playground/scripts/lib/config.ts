import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { load as yamlLoad } from "js-yaml";

import type { PlaygroundConfig, TestTarget } from "../../types.ts";

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function credentialReference(name: string, file: string): string | undefined {
  const store = yamlLoad(readFileSync(file, "utf8")) as { refs?: Record<string, unknown> };
  const reference = store.refs?.[name];
  if (typeof reference === "string") return reference;
  if (reference && typeof reference === "object") {
    const secret = (reference as { secret?: unknown }).secret;
    if (typeof secret === "string") return secret;
    const value = (reference as { value?: unknown }).value;
    if (typeof value === "string") return value;
  }
  return undefined;
}

function environmentReference(value: string, label: string, credentialsFile: string): string {
  const match = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(value);
  if (!match) return value;
  const name = match[1] as string;
  const resolved = process.env[name] ?? credentialReference(name, credentialsFile);
  if (!resolved)
    throw new Error(`${label} cannot resolve its environment or DSH credential reference`);
  return resolved;
}

function target(value: unknown, label: string): TestTarget {
  const parsed = object(value, label);
  return {
    provider: string(parsed.provider, `${label}.provider`),
    model: string(parsed.model, `${label}.model`),
    effort: string(parsed.effort, `${label}.effort`),
  };
}

export function parseConfig(
  value: unknown,
  credentialsFile = join(homedir(), ".dsh/.credentials.yaml"),
): PlaygroundConfig {
  const input = object(value, "playground config");
  const providersInput = object(input.providers, "providers");
  const providers: PlaygroundConfig["providers"] = {};
  for (const [provider, value] of Object.entries(providersInput)) {
    const entry = object(value, `providers.${provider}`);
    const modelsInput = object(entry.models, `providers.${provider}.models`);
    const models: Record<string, string[]> = {};
    for (const [model, value] of Object.entries(modelsInput)) {
      if (!Array.isArray(value) || value.some((effort) => typeof effort !== "string")) {
        throw new Error(`providers.${provider}.models.${model} must be an array of efforts`);
      }
      models[model] = [...new Set(value)];
    }
    providers[provider] = {
      apiKey: environmentReference(
        string(entry.apiKey, `providers.${provider}.apiKey`),
        `providers.${provider}.apiKey`,
        credentialsFile,
      ),
      models,
    };
  }
  if (Object.keys(providers).length === 0) throw new Error("providers must not be empty");
  const testModel = target(input.testModel, "testModel");
  const efforts = providers[testModel.provider]?.models[testModel.model];
  if (efforts === undefined) throw new Error("testModel must name an allowed provider and model");
  if (!efforts.includes(testModel.effort)) {
    throw new Error("testModel effort must be allowed for the selected model");
  }
  return {
    testModel,
    providers,
    ...(input.hostPatchFile === undefined
      ? {}
      : { hostPatchFile: string(input.hostPatchFile, "hostPatchFile") }),
    ...(input.credentialsFile === undefined
      ? {}
      : { credentialsFile: string(input.credentialsFile, "credentialsFile") }),
  };
}

export function readConfig(file: string): PlaygroundConfig {
  return parseConfig(JSON.parse(readFileSync(file, "utf8")));
}
