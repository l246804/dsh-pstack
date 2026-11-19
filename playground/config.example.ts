import { loadEnv } from "vite-plus";

import type { PlaygroundConfig } from "./runner/types.ts";

// Vite's env loader: .env, .env.local, .env.playground, .env.playground.local.
// Copy this file to config.ts and fill real values. config.ts is gitignored.
const env = loadEnv("playground", process.cwd(), "PLAYGROUND_");

export default {
  testModel: {
    provider: "magpie",
    model: "workbuddy/deepseek-v4.1-flash",
    effort: "high",
  },
  providers: {
    magpie: {
      kind: "pi-ai",
      apiKey: env.PLAYGROUND_MAGPIE_API_KEY ?? "",
      apiKeyEnv: "MAGPIE_API_KEY",
      api: "openai-responses",
      baseURL: "http://127.0.0.1:8317/v1",
      reasoning: "high",
      models: [
        {
          id: "workbuddy/deepseek-v4.1-flash",
          name: "DeepSeek-V4.1-Flash",
          contextWindow: 1_000_000,
          maxTokens: 128_000,
          input: ["text", "image"],
          reasoningEfforts: { off: null, low: "low", high: "high", max: "max" },
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
    //       id: "deepseek-flash",
    //       name: "DeepSeek Flash",
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
