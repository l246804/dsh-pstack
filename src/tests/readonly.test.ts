import { describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ setSandboxMode: vi.fn() }));

vi.mock("@deepseek-ai/dsh-sandbox-policy", () => ({ setSandboxMode: mocks.setSandboxMode }));

import { apply } from "../readonly.ts";

describe("readonly preset policy", () => {
  it("sets the read-only sandbox for readonly children only", () => {
    let listener:
      | ((value: { agent: { session: { header: { agentPreset: string } } } }) => void)
      | undefined;
    const ctx = {
      effect: (fn: () => void) => {
        fn();
      },
      on: (_event: string, callback: typeof listener) => {
        listener = callback;
        return () => {};
      },
    };
    apply(ctx as never);
    expect(listener).toBeDefined();
    listener?.({ agent: { session: { header: { agentPreset: "readonly" } } } });
    expect(mocks.setSandboxMode).toHaveBeenCalledWith(
      { header: { agentPreset: "readonly" } },
      "read-only",
    );
    mocks.setSandboxMode.mockClear();
    listener?.({ agent: { session: { header: { agentPreset: "poteto-agent" } } } });
    expect(mocks.setSandboxMode).not.toHaveBeenCalled();
  });
});
