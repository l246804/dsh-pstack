/** Client snapshot of the durable poteto selection kept in the storage sidecar. */

import { z } from "zod";
import type { SessionHeader } from "@deepseek-ai/dsh-session";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionMap {
    /** Saved poteto-workflow selection of the projected Session. */
    potetoMode: PotetoModeView;
  }
}

export interface PotetoProjectionState {
  readonly enabled?: boolean;
}

/** Client view of one Session's poteto selection. */
export interface PotetoModeView {
  readonly enabled: boolean;
}

const stateSchema = z
  .object({ enabled: z.boolean().optional() })
  .strict() satisfies z.ZodType<PotetoProjectionState>;
const viewSchema = z.object({ enabled: z.boolean() }).strict() satisfies z.ZodType<PotetoModeView>;

/** Reuse the wire value so an unchanged selection publishes nothing. */
const ENABLED_VIEW: PotetoModeView = { enabled: true };
const DISABLED_VIEW: PotetoModeView = { enabled: false };

/** A wire-bearing projection, as required by the registry's public overload. */
type PotetoProjectionDefinition = Omit<
  ProjectionDefinition<"potetoMode", PotetoProjectionState>,
  "wire"
> & {
  wire: NonNullable<ProjectionDefinition<"potetoMode", PotetoProjectionState>["wire"]>;
};

/**
 * Build the projection from the resolved Session switch. The resolver folds the
 * preset, the storage sidecar, and the global default, so first paint does not
 * depend on the seed write order. Live toggle changes are applied by the client
 * component from the Remote result, so the projection does not fold events.
 */
export function createPotetoProjectionDefinition(
  resolveEnabled: (header: SessionHeader) => boolean,
): PotetoProjectionDefinition {
  return {
    key: "potetoMode",
    stateVersion: 2,
    stateSchema,
    init: (header: SessionHeader): PotetoProjectionState => ({
      enabled: resolveEnabled(header),
    }),
    apply: (state: PotetoProjectionState): PotetoProjectionState => state,
    wire: {
      viewSchema,
      view: (state: PotetoProjectionState): PotetoModeView =>
        state.enabled === true ? ENABLED_VIEW : DISABLED_VIEW,
    },
  } satisfies ProjectionDefinition<"potetoMode", PotetoProjectionState>;
}
