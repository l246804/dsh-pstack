/** Durable poteto-workflow selection projected from Session events. */

import { z } from "zod";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";
import type { SessionEvent, SessionEventMap } from "@deepseek-ai/dsh-session";

declare module "@deepseek-ai/dsh-session" {
  interface SessionEventMap {
    "poteto/mode": { enabled: boolean };
  }
}

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
const eventSchema = z.object({ enabled: z.boolean() }).strict() as z.ZodType<
  SessionEventMap["poteto/mode"]
>;
const viewSchema = z.object({ enabled: z.boolean() }).strict() as z.ZodType<PotetoModeView>;

/** Reuse the wire value so an unchanged selection publishes nothing. */
const ENABLED_VIEW: PotetoModeView = { enabled: true };
const DISABLED_VIEW: PotetoModeView = { enabled: false };

/** Persisted selection for one root Session. */
export const potetoProjectionDefinition = {
  key: "potetoMode",
  stateVersion: 1,
  stateSchema,
  init: () => ({}),
  apply: (state: PotetoProjectionState, event: SessionEvent) =>
    event.type === "poteto/mode" ? { ...state, ...eventSchema.parse(event.data) } : state,
  wire: {
    viewSchema,
    view: (state: PotetoProjectionState) => (state.enabled === true ? ENABLED_VIEW : DISABLED_VIEW),
  },
} satisfies ProjectionDefinition<"potetoMode", PotetoProjectionState>;
