import { loadEnv } from "vite-plus";

import { fromHost } from "./runner/config/config-host.ts";
import type { PlaygroundConfig } from "./runner/types.ts";

// Vite's env loader: .env, .env.local, .env.playground, .env.playground.local.
// Copy this file to config.ts and fill real values. config.ts is gitignored.
const env = loadEnv("playground", process.cwd(), "PLAYGROUND_");
const isWsl =
  process.platform === "linux" &&
  (process.env.WSL_DISTRO_NAME !== undefined || process.env.WSL_INTEROP !== undefined);

export default {
  copyCredentials: false,

  // Providers become the worker's $DSH_HOME/cordis.patch.yml model rows.
  // fromHost extracts selected provider/model/effort subsets from the host profile.
  // A pi-ai route takes per-model efforts, as below. A DeepSeek route does not: it
  // selects models by id and takes one reasoning effort for the whole route.
  //   "deepseek-official": { models: [{ id: "deepseek-flash" }], reasoning: "high" }
  //   "deepseek-account": { account: true }   // requires copyCredentials: true
  // Defer host-profile discovery so status, collect and stop only need runtime settings.
  get providers() {
    return fromHost(
      {
        "your-provider": {
          // apiKey: "your-api-key", // optional; config.ts is gitignored
          models: [{ id: "your-model", efforts: ["low", "high"] }],
          reasoning: "low",
        },
      },
      { env },
    );
  },

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

  runtime: {
    scenarioTimeoutMs: 600_000,
    turnTimeoutMs: 180_000,
    subagentTimeoutMs: 600_000,
    networkMode: process.platform === "linux" && !isWsl ? "host" : "bridge",
    workerPortBase: 8080,
    workerCapacity: {
      coreHeadroom: 2,
      memoryFraction: 0.7,
      memoryPerWorkerGB: 1,
    },
    workspaceRoot: "playground/.workspace",
    workersDir: "playground/.workers",
    dockerBin: "docker",
    dshBin: "dsh",
    vpxBin: "vpx",
    pnpmBin: "pnpm",
    chromePath: process.env.AGENT_BROWSER_CHROME_PATH,
  },
} satisfies PlaygroundConfig;
