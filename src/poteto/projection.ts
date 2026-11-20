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
  .strict() as z.ZodType<PotetoProjectionState>;
const viewSchema = z.object({ enabled: z.boolean() }).strict() as z.ZodType<PotetoModeView>;

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
 * Build the projection from the storage sidecar. The projection is a
 * first-paint snapshot; live toggle changes are applied by the client
 * component from the Remote result, so it does not fold Session events.
 */
export function createPotetoProjectionDefinition(
  readEnabled: (sessionId: string) => boolean | undefined,
): PotetoProjectionDefinition {
  return {
    key: "potetoMode",
    stateVersion: 3,
    stateSchema,
    init: (header: SessionHeader): PotetoProjectionState => ({
      enabled: readEnabled(header.id),
    }),
    apply: (state: PotetoProjectionState): PotetoProjectionState => state,
    wire: {
      viewSchema,
      view: (state: PotetoProjectionState): PotetoModeView =>
        state.enabled === true ? ENABLED_VIEW : DISABLED_VIEW,
    },
  } satisfies ProjectionDefinition<"potetoMode", PotetoProjectionState>;
}
