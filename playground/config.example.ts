import { loadEnv } from "vite-plus";

import { fromHost } from "./runner/lib/config-host.ts";
import type { PlaygroundConfig } from "./runner/types.ts";

// Vite's env loader: .env, .env.local, .env.playground, .env.playground.local.
// Copy this file to config.ts and fill real values. config.ts is gitignored.
const env = loadEnv("playground", process.cwd(), "PLAYGROUND_");

export default {
  copyCredentials: false,

  // Providers become the worker's $DSH_HOME/cordis.patch.yml model rows.
  // fromHost extracts selected provider/model/effort subsets from the host profile.
  // DeepSeek account: fromHost({ "deepseek-account": {} }) with copyCredentials: true.
  providers: fromHost(
    {
      "your-provider": { models: ["your-model"], efforts: ["low", "high"] },
    },
    { env },
  ),

  testModel: {
    provider: "your-provider",
    model: "your-model",
    effort: "low",
  },

  roleModels: {},

  browser: {
    mode: "managed",
    headed: false,
    // To drive a host Chrome instead, launch it with a dedicated --user-data-dir and:
    // mode: "cdp",
    // cdpUrl: "http://127.0.0.1:9222",
  },
} satisfies PlaygroundConfig;
