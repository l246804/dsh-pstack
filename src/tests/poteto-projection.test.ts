import { describe, expect, it } from "vite-plus/test";

import type { SessionEvent } from "@deepseek-ai/dsh-session";

import { potetoProjectionDefinition, type PotetoProjectionState } from "../poteto/projection.ts";

/** One recorded poteto selection event; `apply` reads only `type` and `data`. */
function modeEvent(enabled: boolean): SessionEvent {
  return { type: "poteto/mode", data: { enabled } } as SessionEvent;
}

describe("poteto projection client view", () => {
  it("declares a wire view so the browser reads the switch state synchronously", () => {
    expect(potetoProjectionDefinition.wire).toBeDefined();
  });

  it("maps the saved selection to the wire enabled flag", () => {
    const wire = potetoProjectionDefinition.wire;
    if (wire === undefined) throw new Error("poteto projection has no wire view");
    const view = (state: PotetoProjectionState): unknown => wire.view(state);

    expect(view({})).toEqual({ enabled: false });
    expect(view({ enabled: true })).toEqual({ enabled: true });
    expect(view({ enabled: false })).toEqual({ enabled: false });
  });

  it("reuses the wire value while the selection does not change", () => {
    const wire = potetoProjectionDefinition.wire;
    if (wire === undefined) throw new Error("poteto projection has no wire view");

    expect(wire.view({ enabled: true })).toBe(wire.view({ enabled: true }));
    expect(wire.view({ enabled: false })).toBe(wire.view({ enabled: false }));
  });

  it("folds an on then off selection into the wire value", () => {
    const wire = potetoProjectionDefinition.wire;
    if (wire === undefined) throw new Error("poteto projection has no wire view");

    const on = potetoProjectionDefinition.apply({}, modeEvent(true));
    expect(wire.view(on)).toEqual({ enabled: true });
    const off = potetoProjectionDefinition.apply(on, modeEvent(false));
    expect(wire.view(off)).toEqual({ enabled: false });
  });
});
