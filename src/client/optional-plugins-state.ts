/**
 * Pure state and small async operations for the optional-plugin recommendation
 * section. Keeping status derivation and the one-click sequence here lets the
 * browser tests cover every decision without mounting the Plugins page.
 *
 * The two wire shapes below mirror the public `BundleInfo` and `ChangeResult`
 * fields this page reads from `pluginManager` (DSH 0.2.2-alpha.2), the same way
 * `remote.ts` hand-writes the role Remote contract.
 */

import {
  OPTIONAL_PLUGINS,
  type OptionalPluginDefinition,
  type OptionalPluginId,
} from "../internal/optional-plugins.ts";

/** The bundle facts the recommendation section reads. */
export interface BundleSnapshot {
  readonly name: string;
  readonly availability: "installation" | "profile" | "missing";
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly optional: boolean;
  readonly error?: { readonly code: string; readonly diagnostic?: string };
}

/** The change facts the page reports. */
export interface BundleChange {
  readonly application: "applied" | "restart-required" | "overridden" | "failed" | "cancelled";
  readonly enabled?: boolean;
  readonly error?: { readonly code: string; readonly diagnostic?: string };
}

/** The status a recommendation row shows. */
export type OptionalPluginStatus = "enabled" | "off" | "missing" | "unsupported-platform" | "error";

/** One catalogue row joined with the live bundle inventory. */
export interface OptionalPluginRow {
  readonly definition: OptionalPluginDefinition;
  readonly status: OptionalPluginStatus;
  readonly enabled: boolean;
  /** Whether the page offers a switch for this row. */
  readonly canToggle: boolean;
}

/** Read one bundle's display status, including platform and file failures. */
export function optionalPluginStatus(bundle: BundleSnapshot | undefined): OptionalPluginStatus {
  if (bundle === undefined) return "missing";
  if (bundle.error?.code === "unsupported-platform") return "unsupported-platform";
  if (bundle.availability === "missing") return "missing";
  if (bundle.error !== undefined) return "error";
  return bundle.enabled ? "enabled" : "off";
}

/** Join the catalogue with the Host's bundle list. */
export function optionalPluginRows(
  bundles: readonly BundleSnapshot[] | undefined,
): readonly OptionalPluginRow[] {
  const byName = new Map((bundles ?? []).map((bundle) => [bundle.name, bundle]));
  return OPTIONAL_PLUGINS.map((definition) => {
    const bundle = definition.bundle === undefined ? undefined : byName.get(definition.bundle);
    const status = definition.bundle === undefined ? "missing" : optionalPluginStatus(bundle);
    return {
      definition,
      status,
      enabled: status === "enabled",
      canToggle:
        definition.bundle !== undefined &&
        definition.switchable !== false &&
        (status === "off" || status === "enabled"),
    };
  });
}

/** How many default-recommended plugins are not on yet, for activation guidance. */
export function remainingRecommendedCount(rows: readonly OptionalPluginRow[]): number {
  return rows.filter((row) => row.definition.recommended === true && row.status !== "enabled")
    .length;
}

/** The bundle names the one-click action should try, in catalogue order. */
export function recommendedTargets(rows: readonly OptionalPluginRow[]): readonly string[] {
  return rows
    .filter((row) => row.definition.recommended === true && row.definition.bundle !== undefined)
    .map((row) => row.definition.bundle as string);
}

/** One row's attempted outcome; `error` is a rejected Remote call. */
export interface RecommendedOutcome {
  readonly id: OptionalPluginId;
  readonly bundle: string;
  readonly application: BundleChange["application"] | "error";
}

/** Aggregate result of “enable recommended plugins”. */
export interface RecommendedSummary {
  readonly applied: number;
  readonly restartRequired: number;
  readonly failed: number;
  readonly skipped: number;
  readonly outcomes: readonly RecommendedOutcome[];
}

/** The narrow plugin-manager face the section needs. */
export interface OptionalPluginsApi {
  listBundles(): Promise<readonly BundleSnapshot[]>;
  setBundleEnabled(name: string, enabled: boolean): Promise<BundleChange>;
}

/**
 * Enable the default recommendation one bundle at a time and keep going after
 * failures so the summary reports every attempted step.
 */
export async function enableRecommendedPlugins(
  api: Pick<OptionalPluginsApi, "setBundleEnabled">,
  rows: readonly OptionalPluginRow[],
): Promise<RecommendedSummary> {
  const outcomes: RecommendedOutcome[] = [];
  let applied = 0;
  let restartRequired = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.definition.recommended !== true || row.definition.bundle === undefined) continue;
    if (row.status === "enabled") continue;
    if (row.status !== "off") {
      skipped += 1;
      continue;
    }
    try {
      const result = await api.setBundleEnabled(row.definition.bundle, true);
      outcomes.push({
        id: row.definition.id,
        bundle: row.definition.bundle,
        application: result.application,
      });
      if (result.application === "applied") applied += 1;
      else if (result.application === "restart-required") restartRequired += 1;
      else failed += 1;
    } catch {
      outcomes.push({
        id: row.definition.id,
        bundle: row.definition.bundle,
        application: "error",
      });
      failed += 1;
    }
  }
  return { applied, restartRequired, failed, skipped, outcomes };
}

/** Minimal Persistent-storage face, kept injectable for tests. */
export interface GuidanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The one-time activation guidance marker. */
export const GUIDANCE_DISMISSED_KEY = "dsh-pstack.recommended-plugins.guidance.v1";

/** Browser storage, or undefined outside a browser or when access throws. */
export function browserStorage(): GuidanceStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Whether the activation guidance was already dismissed in this browser. */
export function guidanceDismissed(storage: GuidanceStorage | undefined): boolean {
  try {
    return storage?.getItem(GUIDANCE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remember that the activation guidance must not appear again. */
export function dismissGuidance(storage: GuidanceStorage | undefined): void {
  try {
    storage?.setItem(GUIDANCE_DISMISSED_KEY, "1");
  } catch {
    // A browser that refuses storage may still use the page; guidance is best effort.
  }
}
