import { describe, expect, it } from "vite-plus/test";
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionLogOffset,
  SessionSeq,
} from "@deepseek-ai/dsh-session";
import type { SessionEvent, SessionHeader } from "@deepseek-ai/dsh-session";

import {
  createPotetoProjectionDefinition,
  type PotetoProjectionState,
} from "../src/poteto/projection.ts";

const header: SessionHeader = {
  version: SESSION_FORMAT_VERSION,
  id: SessionId("session-1"),
  createdAt: 1_700_000_000_000,
  isSeeded: false,
};
const inheritedEventCount = SessionLogOffset(0);

function definitionFor(enabled: boolean | undefined) {
  return createPotetoProjectionDefinition(() => enabled);
}

describe("poteto projection snapshot", () => {
  it("invalidates the pre-sidecar projection cache", () => {
    expect(definitionFor(true).stateVersion).toBe(2);
  });

  it("uses the storage sidecar value on first paint", () => {
    expect(definitionFor(true).init(header, inheritedEventCount)).toEqual({ enabled: true });
    expect(definitionFor(false).init(header, inheritedEventCount)).toEqual({ enabled: false });
  });

  it("maps the saved selection to the wire enabled flag", () => {
    const wire = definitionFor(true).wire;
    if (wire === undefined) throw new Error("poteto projection has no wire view");
    const view = (state: PotetoProjectionState): unknown => wire.view(state);

    expect(view({})).toEqual({ enabled: false });
    expect(view({ enabled: true })).toEqual({ enabled: true });
    expect(view({ enabled: false })).toEqual({ enabled: false });
  });

  it("reuses the wire value while the selection does not change", () => {
    const wire = definitionFor(true).wire;
    if (wire === undefined) throw new Error("poteto projection has no wire view");

    expect(wire.view({ enabled: true })).toBe(wire.view({ enabled: true }));
    expect(wire.view({ enabled: false })).toBe(wire.view({ enabled: false }));
  });

  it("returns the same state for every committed event", () => {
    const definition = definitionFor(true);
    const state = definition.init(header, inheritedEventCount);
    const event: SessionEvent = {
      type: "session/end-seed",
      seq: SessionSeq(0),
      time: 0,
      data: {},
    };

    expect(definition.apply(state, event)).toBe(state);
  });
});
