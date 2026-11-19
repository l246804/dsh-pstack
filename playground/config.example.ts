import { loadEnv } from "vite-plus";

import type { PlaygroundConfig } from "./runner/types.ts";

// Vite's env loader: .env, .env.local, .env.playground, .env.playground.local.
// Copy this file to config.ts and fill real values. config.ts is gitignored.
const env = loadEnv("playground", process.cwd(), "PLAYGROUND_");

export default {
  testModel: {
    provider: "your-provider",
    model: "your-model",
    effort: "low",
  },
  providers: {
    "your-provider": {
      kind: "pi-ai",
      apiKey: env.PLAYGROUND_PROVIDER_API_KEY ?? "",
      apiKeyEnv: "PROVIDER_API_KEY",
      api: "openai-responses",
      baseURL: "https://your-gateway.example/v1",
      reasoning: "high",
      models: [
        {
          id: "your-model",
          name: "Your Model",
          contextWindow: 128000,
          maxTokens: 8192,
          input: ["text"],
          reasoningEfforts: { off: null, low: "low", medium: "medium", high: "high" },
        },
      ],
    },
    // DeepSeek API-key route (provider key must stay deepseek-official):
    //
    // "deepseek-official": {
    //   kind: "deepseek-api-key",
    //   apiKey: env.PLAYGROUND_DEEPSEEK_API_KEY ?? "",
    //   apiKeyEnv: "DEEPSEEK_API_KEY",
    //   models: [
    //     {
    //       id: "your-deepseek-model",
    //       name: "Your DeepSeek Model",
    //       reasoningEfforts: { off: null, low: "low", high: "high", max: "max" },
    //     },
    //   ],
    // },
    //
    // DeepSeek account route (provider key must stay deepseek-account):
    // The model list comes from the signed-in account; only field overrides are config.
    //
    // "deepseek-account": {
    //   kind: "deepseek-account",
    //   modelOverrides: {},
    // },
  },
  roleModels: {},
  browser: {
    mode: "managed",
    headed: false,
    // To drive a host Chrome instead, launch it with a dedicated --user-data-dir and:
    // mode: "cdp",
    // cdpUrl: "http://127.0.0.1:9222",
  },
  // Copying the host DSH credential file is opt-in. Model API keys come from env above.
  copyCredentials: false,
} satisfies PlaygroundConfig;
