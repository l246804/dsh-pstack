import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { load as yamlLoad } from "js-yaml";

import { setRuntimeSettings } from "./runtime.ts";
import { loadProviderPlan } from "./provider.ts";
import type {
  BrowserConfig,
  PlaygroundConfig,
  ProviderConfig,
  ProviderModel,
  RuntimeConfig,
  TestTarget,
} from "../types.ts";

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

function number(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
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

function resolveSecret(value: string, label: string, credentialsFile: string): string {
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

function model(value: unknown, label: string): ProviderModel {
  const parsed = object(value, label);
  const reasoningEfforts = parsed.reasoningEfforts;
  if (reasoningEfforts !== undefined) {
    const efforts = object(reasoningEfforts, `${label}.reasoningEfforts`);
    for (const [effort, mapped] of Object.entries(efforts)) {
      if (mapped !== null && typeof mapped !== "string") {
        throw new Error(`${label}.reasoningEfforts.${effort} must be a string or null`);
      }
    }
  }
  const input = parsed.input;
  if (
    input !== undefined &&
    (!Array.isArray(input) || input.some((entry) => entry !== "text" && entry !== "image"))
  ) {
    throw new Error(`${label}.input must be an array of text/image`);
  }
  const contextWindow = number(parsed.contextWindow, `${label}.contextWindow`);
  const maxTokens = number(parsed.maxTokens, `${label}.maxTokens`);
  return {
    id: string(parsed.id, `${label}.id`),
    ...(parsed.name === undefined ? {} : { name: string(parsed.name, `${label}.name`) }),
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(input === undefined ? {} : { input: [...input] }),
    ...(reasoningEfforts === undefined
      ? {}
      : {
          reasoningEfforts: Object.fromEntries(
            Object.entries(reasoningEfforts as Record<string, string | null>),
          ),
        }),
  };
}

function provider(value: unknown, label: string, credentialsFile: string): ProviderConfig {
  const parsed = object(value, label);
  const kind = string(parsed.kind, `${label}.kind`);
  const parseApiKey = (): string =>
    resolveSecret(string(parsed.apiKey, `${label}.apiKey`), `${label}.apiKey`, credentialsFile);
  if (kind === "pi-ai") {
    if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
      throw new Error(`${label}.models must be a non-empty array`);
    }
    return {
      kind,
      apiKey: parseApiKey(),
      apiKeyEnv: string(parsed.apiKeyEnv, `${label}.apiKeyEnv`),
      ...(parsed.api === undefined ? {} : { api: string(parsed.api, `${label}.api`) }),
      ...(parsed.baseURL === undefined
        ? {}
        : { baseURL: string(parsed.baseURL, `${label}.baseURL`) }),
      reasoning: string(parsed.reasoning, `${label}.reasoning`),
      models: parsed.models.map((entry, index) => model(entry, `${label}.models[${index}]`)),
    };
  }
  if (kind === "deepseek-api-key") {
    if (!Array.isArray(parsed.models) || parsed.models.length === 0) {
      throw new Error(`${label}.models must be a non-empty array`);
    }
    return {
      kind,
      apiKey: parseApiKey(),
      apiKeyEnv: string(parsed.apiKeyEnv, `${label}.apiKeyEnv`),
      models: parsed.models.map((entry, index) => model(entry, `${label}.models[${index}]`)),
    };
  }
  if (kind === "deepseek-account") {
    return {
      kind,
      ...(parsed.modelOverrides === undefined
        ? {}
        : { modelOverrides: object(parsed.modelOverrides, `${label}.modelOverrides`) }),
    };
  }
  throw new Error(`${label}.kind must be pi-ai, deepseek-api-key, or deepseek-account`);
}

function browser(value: unknown): BrowserConfig {
  const parsed = object(value, "browser");
  const mode = parsed.mode === undefined ? "managed" : string(parsed.mode, "browser.mode");
  if (mode !== "managed" && mode !== "cdp") {
    throw new Error("browser.mode must be managed or cdp");
  }
  if (mode === "cdp" && parsed.cdpUrl === undefined) {
    throw new Error("browser.cdpUrl is required when browser.mode is cdp");
  }
  return {
    mode,
    ...(parsed.cdpUrl === undefined ? {} : { cdpUrl: string(parsed.cdpUrl, "browser.cdpUrl") }),
    ...(parsed.headed === undefined
      ? {}
      : (() => {
          if (typeof parsed.headed !== "boolean") throw new Error("browser.headed must be boolean");
          return { headed: parsed.headed };
        })()),
  };
}

function runtime(value: unknown): RuntimeConfig {
  const parsed = object(value, "runtime");
  const timeout = parsed.scenarioTimeoutMs;
  if (typeof timeout !== "number" || !Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error("runtime.scenarioTimeoutMs must be a positive integer number of milliseconds");
  }
  const turnTimeout = number(parsed.turnTimeoutMs, "runtime.turnTimeoutMs");
  if (turnTimeout === undefined || !Number.isSafeInteger(turnTimeout) || turnTimeout <= 0) {
    throw new Error("runtime.turnTimeoutMs must be a positive integer number of milliseconds");
  }
  const subagentTimeout = number(parsed.subagentTimeoutMs, "runtime.subagentTimeoutMs");
  if (
    subagentTimeout === undefined ||
    !Number.isSafeInteger(subagentTimeout) ||
    subagentTimeout <= 0
  ) {
    throw new Error("runtime.subagentTimeoutMs must be a positive integer number of milliseconds");
  }
  const networkMode = parsed.networkMode;
  if (networkMode !== "host" && networkMode !== "bridge") {
    throw new Error("runtime.networkMode must be host or bridge");
  }
  const workerPortBase = number(parsed.workerPortBase, "runtime.workerPortBase");
  if (
    workerPortBase === undefined ||
    !Number.isSafeInteger(workerPortBase) ||
    workerPortBase < 1 ||
    workerPortBase > 65535
  ) {
    throw new Error("runtime.workerPortBase must be a valid port number");
  }
  const capacity = object(parsed.workerCapacity, "runtime.workerCapacity");
  const coreHeadroom = number(capacity.coreHeadroom, "runtime.workerCapacity.coreHeadroom");
  const memoryFraction = number(capacity.memoryFraction, "runtime.workerCapacity.memoryFraction");
  const memoryPerWorkerGB = number(
    capacity.memoryPerWorkerGB,
    "runtime.workerCapacity.memoryPerWorkerGB",
  );
  if (coreHeadroom === undefined || !Number.isSafeInteger(coreHeadroom) || coreHeadroom < 0) {
    throw new Error("runtime.workerCapacity.coreHeadroom must be a non-negative integer");
  }
  if (memoryFraction === undefined || memoryFraction <= 0 || memoryFraction > 1) {
    throw new Error("runtime.workerCapacity.memoryFraction must be in (0, 1]");
  }
  if (memoryPerWorkerGB === undefined || memoryPerWorkerGB <= 0) {
    throw new Error("runtime.workerCapacity.memoryPerWorkerGB must be positive");
  }
  return {
    scenarioTimeoutMs: timeout,
    turnTimeoutMs: turnTimeout,
    subagentTimeoutMs: subagentTimeout,
    networkMode,
    workerPortBase,
    workerCapacity: { coreHeadroom, memoryFraction, memoryPerWorkerGB },
    workspaceRoot: string(parsed.workspaceRoot, "runtime.workspaceRoot"),
    workersDir: string(parsed.workersDir, "runtime.workersDir"),
    dockerBin: string(parsed.dockerBin, "runtime.dockerBin"),
    dshBin: string(parsed.dshBin, "runtime.dshBin"),
    vpxBin: string(parsed.vpxBin, "runtime.vpxBin"),
    pnpmBin: string(parsed.pnpmBin, "runtime.pnpmBin"),
    ...(parsed.chromePath === undefined
      ? {}
      : { chromePath: string(parsed.chromePath, "runtime.chromePath") }),
  };
}

export function parseConfig(value: unknown, credentialsFileOption?: string): PlaygroundConfig {
  const input = object(value, "playground config");
  const credentialsFile =
    credentialsFileOption ??
    (input.credentialsFile === undefined
      ? join(homedir(), ".dsh/.credentials.yaml")
      : string(input.credentialsFile, "credentialsFile"));
  const providersInput = object(input.providers, "providers");
  const providers: Record<string, ProviderConfig> = {};
  for (const [name, value] of Object.entries(providersInput)) {
    providers[name] = provider(value, `providers.${name}`, credentialsFile);
  }
  if (Object.keys(providers).length === 0) throw new Error("providers must not be empty");
  const testModel = target(input.testModel, "testModel");
  if (providers[testModel.provider] === undefined) {
    throw new Error("testModel must name a configured provider");
  }
  const roleModels: PlaygroundConfig["roleModels"] = {};
  if (input.roleModels !== undefined) {
    for (const [role, value] of Object.entries(object(input.roleModels, "roleModels"))) {
      const values = Array.isArray(value) ? value : [value];
      roleModels[role] = Array.isArray(value)
        ? values.map((entry, index) => target(entry, `roleModels.${role}[${index}]`))
        : target(value, `roleModels.${role}`);
    }
  }
  if (input.runtime === undefined) throw new Error("runtime is required");
  return {
    testModel,
    providers,
    ...(Object.keys(roleModels).length === 0 ? {} : { roleModels }),
    ...(input.browser === undefined ? {} : { browser: browser(input.browser) }),
    runtime: runtime(input.runtime),
    ...(input.copyCredentials === undefined
      ? {}
      : (() => {
          if (typeof input.copyCredentials !== "boolean") {
            throw new Error("copyCredentials must be boolean");
          }
          return { copyCredentials: input.copyCredentials };
        })()),
    ...(input.credentialsFile === undefined
      ? {}
      : { credentialsFile: string(input.credentialsFile, "credentialsFile") }),
  };
}

function loaded(value: unknown): PlaygroundConfig {
  const config = parseConfig(value);
  loadProviderPlan(config);
  setRuntimeSettings(config.runtime);
  return config;
}

/** Load a TS or JSON config. TS is imported through the same runtime as every other script. */
export async function readConfig(file: string): Promise<PlaygroundConfig> {
  if (file.endsWith(".json")) {
    return loaded(JSON.parse(readFileSync(file, "utf8")));
  }
  const module = (await import(pathToFileURL(file).href)) as {
    default?: unknown;
    config?: unknown;
  };
  return loaded(module.default ?? module.config);
}
