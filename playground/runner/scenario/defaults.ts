import { VARIANTS } from "../types.ts";
import type { Variant } from "../types.ts";

/** Scenario defaults owned by one module so registry, hash, and CLI agree. */
export const DEFAULT_VARIANTS: readonly Variant[] = VARIANTS;
export const DEFAULT_ENVIRONMENTS: readonly string[] = ["base"];
