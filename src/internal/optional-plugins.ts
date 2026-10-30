/**
 * The optional DSH plugins pstack recommends on its Plugins page.
 *
 * This module is the single source for the `OPT-*` catalogue used by the page
 * and by the tests that check it against the harness adapter document and both
 * READMEs. `bundle` names the package the plugin manager can switch; rows
 * without one are package groups that only carry documentation guidance.
 */

/** The optional-plugin ids documented by the pstack harness adapter. */
export type OptionalPluginId =
  | "OPT-01"
  | "OPT-02"
  | "OPT-03"
  | "OPT-04"
  | "OPT-05"
  | "OPT-06"
  | "OPT-07"
  | "OPT-08"
  | "OPT-09";

/** The task-scenario groups the page renders. */
export type OptionalPluginGroup = "sessions" | "verification" | "multi-agent";

/** One documented optional plugin row. */
export interface OptionalPluginDefinition {
  /** `OPT-*` id from the harness adapter's table. */
  readonly id: OptionalPluginId;
  /** Task-scenario group. */
  readonly group: OptionalPluginGroup;
  /** Packages named by the documentation row, in documentation order. */
  readonly packages: readonly string[];
  /** The bundle `pluginManager.setBundleEnabled` addresses; absent for non-bundle rows. */
  readonly bundle?: string;
  /** Included in the default recommendation and in “enable recommended plugins”. */
  readonly recommended?: boolean;
  /** User-suggested entry, shown with its own tag and never in the default set. */
  readonly suggested?: boolean;
  /** Entry that only warns about a conflict and cannot be switched here. */
  readonly conflict?: boolean;
  /** Whether this page may offer a switch for the bundle. */
  readonly switchable?: boolean;
}

/** Group order shared by the page and its tests. */
export const OPTIONAL_PLUGIN_GROUPS: readonly OptionalPluginGroup[] = [
  "sessions",
  "verification",
  "multi-agent",
];

/** The complete optional-plugin catalogue in documentation order. */
export const OPTIONAL_PLUGINS: readonly OptionalPluginDefinition[] = [
  {
    id: "OPT-01",
    group: "sessions",
    packages: [
      "@deepseek-ai/dsh-experimental-worktree",
      "@deepseek-ai/dsh-experimental-tool-worktree",
    ],
    bundle: "@deepseek-ai/dsh-experimental-tool-worktree",
    recommended: true,
  },
  {
    id: "OPT-02",
    group: "sessions",
    packages: ["@deepseek-ai/dsh-experimental-forge-bundle"],
    bundle: "@deepseek-ai/dsh-experimental-forge-bundle",
    suggested: true,
  },
  {
    id: "OPT-03",
    group: "verification",
    packages: [
      "@deepseek-ai/dsh-browser-use",
      "@deepseek-ai/dsh-experimental-browser-use-stagehand-native",
      "@deepseek-ai/dsh-experimental-browser-use-playwright-mcp",
      "@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp",
    ],
  },
  {
    id: "OPT-04",
    group: "verification",
    packages: ["@deepseek-ai/dsh-cua-bundle"],
    bundle: "@deepseek-ai/dsh-cua-bundle",
  },
  {
    id: "OPT-05",
    group: "verification",
    packages: ["@deepseek-ai/dsh-experimental-terminal-bundle"],
    bundle: "@deepseek-ai/dsh-experimental-terminal-bundle",
  },
  {
    id: "OPT-06",
    group: "sessions",
    packages: ["@deepseek-ai/dsh-experimental-session-search"],
    bundle: "@deepseek-ai/dsh-experimental-session-search",
    recommended: true,
  },
  {
    id: "OPT-07",
    group: "verification",
    packages: ["@deepseek-ai/dsh-mcp-client"],
  },
  {
    id: "OPT-08",
    group: "multi-agent",
    packages: ["@deepseek-ai/dsh-experimental-agent-team-profile"],
    bundle: "@deepseek-ai/dsh-experimental-agent-team-profile",
    conflict: true,
    switchable: false,
  },
  {
    id: "OPT-09",
    group: "multi-agent",
    packages: ["@deepseek-ai/dsh-experimental-ralph-bundle"],
    bundle: "@deepseek-ai/dsh-experimental-ralph-bundle",
  },
];

/** The default recommendation set, in enable order. */
export const DEFAULT_RECOMMENDED_PLUGINS: readonly OptionalPluginId[] = ["OPT-01", "OPT-06"];

/** Find one catalogue row by id. */
export function optionalPlugin(id: OptionalPluginId): OptionalPluginDefinition {
  const found = OPTIONAL_PLUGINS.find((plugin) => plugin.id === id);
  if (found === undefined) throw new Error(`unknown optional plugin ${id}`);
  return found;
}

/** Bundle packages the one-click action enables, in documented order. */
export function recommendedBundleNames(): readonly string[] {
  return OPTIONAL_PLUGINS.filter(
    (plugin) => plugin.recommended === true && plugin.bundle !== undefined,
  ).map((plugin) => plugin.bundle as string);
}
