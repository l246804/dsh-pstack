import type { EnvironmentMatrix } from "../types.ts";

/**
 * The official-plugin environments the port is verified against. `prepare` adds
 * `dsh-pstack` to every adapted profile automatically, so `enabledPluginPackages` holds
 * only the extra official packages layered on top of the base bundle.
 *
 * `agent-team-conflict` is not a capability sample: it loads the Agent Teams profile so
 * `run-conflict` can prove the pstack root preset refuses to start beside it.
 */
export const environments: readonly EnvironmentMatrix[] = [
  { id: "base", enabledPluginPackages: [] },
  {
    id: "session-search",
    enabledPluginPackages: ["@deepseek-ai/dsh-experimental-session-search"],
  },
  { id: "browser-use", enabledPluginPackages: ["@deepseek-ai/dsh-browser-use"] },
  {
    id: "terminal",
    enabledPluginPackages: ["@deepseek-ai/dsh-experimental-terminal-bundle"],
  },
  {
    id: "forge",
    enabledPluginPackages: ["@deepseek-ai/dsh-experimental-forge-bundle"],
  },
  {
    id: "agent-team-conflict",
    enabledPluginPackages: ["@deepseek-ai/dsh-experimental-agent-team-profile"],
  },
];
