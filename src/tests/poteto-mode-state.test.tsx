// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { POTETO_MODE_EVENT, usePotetoMode } from "../client/lib/poteto-mode.ts";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

function mount(
  readMode: () => Promise<boolean>,
  observe: (mode: boolean | undefined) => void,
): void {
  function Probe() {
    const { mode } = usePotetoMode("session-a", readMode);
    useEffect(() => observe(mode), [mode]);
    return null;
  }
  root = createRoot(document.createElement("div"));
  root.render(<Probe />);
}

describe("Poteto mode state", () => {
  it("keeps a newer successful toggle when an older status request resolves", async () => {
    const pending = Promise.withResolvers<boolean>();
    let mode: boolean | undefined;
    await act(async () =>
      mount(
        () => pending.promise,
        (value) => {
          mode = value;
        },
      ),
    );
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(POTETO_MODE_EVENT, { detail: { sessionId: "session-a", enabled: true } }),
      );
    });
    expect(mode).toBe(true);
    await act(async () => pending.resolve(false));
    expect(mode).toBe(true);
  });

  it("accepts the initial status when only another session changes", async () => {
    const pending = Promise.withResolvers<boolean>();
    let mode: boolean | undefined;
    await act(async () =>
      mount(
        () => pending.promise,
        (value) => {
          mode = value;
        },
      ),
    );
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(POTETO_MODE_EVENT, { detail: { sessionId: "session-b", enabled: true } }),
      );
      pending.resolve(false);
    });
    expect(mode).toBe(false);
  });
});
