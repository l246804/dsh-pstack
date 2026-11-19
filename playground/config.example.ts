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
  // DeepSeek account: fromHost({ "deepseek-account": { account: true } }) with copyCredentials: true.
  providers: fromHost(
    {
      "your-provider": {
        models: [{ id: "your-model", efforts: ["low", "high"] }],
        reasoning: "low",
      },
    },
    { env },
  ),

  testModel: {
    provider: "your-provider",
    model: "your-model",
    effort: "low",
  },

  roleModels: {
    // All entries use the provider/model declared above; effort is per role.
    "feature, refactoring": { provider: "your-provider", model: "your-model", effort: "low" },
    "bug-fix": { provider: "your-provider", model: "your-model", effort: "low" },
    "perf-issue": { provider: "your-provider", model: "your-model", effort: "low" },
    hillclimb: { provider: "your-provider", model: "your-model", effort: "high" },
    "judgment and prose": { provider: "your-provider", model: "your-model", effort: "high" },
    "arena runners": [
      { provider: "your-provider", model: "your-model", effort: "low" },
      { provider: "your-provider", model: "your-model", effort: "high" },
    ],
    "arena cross-judge pool": [
      { provider: "your-provider", model: "your-model", effort: "high" },
      { provider: "your-provider", model: "your-model", effort: "low" },
    ],
    "swarm workers": [
      { provider: "your-provider", model: "your-model", effort: "low" },
      { provider: "your-provider", model: "your-model", effort: "high" },
    ],
    "interrogate reviewers": [
      { provider: "your-provider", model: "your-model", effort: "high" },
      { provider: "your-provider", model: "your-model", effort: "low" },
    ],
  },

  browser: {
    mode: "managed",
    headed: false,
    // To drive a host Chrome instead, launch it with a dedicated --user-data-dir and:
    // mode: "cdp",
    // cdpUrl: "http://127.0.0.1:9222",
  },
} satisfies PlaygroundConfig;
