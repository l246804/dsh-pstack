import { describe, expect, it } from "vite-plus/test";

import {
  potetoSupportsPreset,
  resolvePotetoEnabled,
  shouldSeedPotetoDefault,
} from "../poteto/preset-gate.ts";

describe("poteto preset gate", () => {
  it("blocks the Minimal preset", () => {
    expect(potetoSupportsPreset("minimal")).toBe(false);
  });

  it("allows the presets that carry skills and the standard prompt", () => {
    expect(potetoSupportsPreset("standard")).toBe(true);
    expect(potetoSupportsPreset("ptc")).toBe(true);
    expect(potetoSupportsPreset("cordis")).toBe(true);
  });

  it("allows a session with no composed preset id", () => {
    expect(potetoSupportsPreset(undefined)).toBe(true);
  });
});

describe("resolvePotetoEnabled", () => {
  it("never enables under the Minimal preset, even when the global default is on", () => {
    expect(
      resolvePotetoEnabled({ agentPreset: "minimal", selected: undefined, byDefault: true }),
    ).toBe(false);
  });

  it("ignores a stale saved-on switch when the session is Minimal", () => {
    expect(resolvePotetoEnabled({ agentPreset: "minimal", selected: true, byDefault: false })).toBe(
      false,
    );
  });

  it("honors an explicit per-session selection over the default", () => {
    expect(
      resolvePotetoEnabled({ agentPreset: "standard", selected: false, byDefault: true }),
    ).toBe(false);
    expect(
      resolvePotetoEnabled({ agentPreset: "standard", selected: true, byDefault: false }),
    ).toBe(true);
  });

  it("falls back to the global default when the session has no saved selection", () => {
    expect(
      resolvePotetoEnabled({ agentPreset: "standard", selected: undefined, byDefault: true }),
    ).toBe(true);
    expect(
      resolvePotetoEnabled({ agentPreset: "standard", selected: undefined, byDefault: false }),
    ).toBe(false);
  });
});

describe("shouldSeedPotetoDefault", () => {
  it("seeds an explicit on selection for a default-on capable session", () => {
    expect(
      shouldSeedPotetoDefault({ agentPreset: "standard", selected: undefined, byDefault: true }),
    ).toBe(true);
  });

  it("does not seed when the default is off", () => {
    expect(
      shouldSeedPotetoDefault({ agentPreset: "standard", selected: undefined, byDefault: false }),
    ).toBe(false);
  });

  it("does not overwrite an explicit selection", () => {
    expect(
      shouldSeedPotetoDefault({ agentPreset: "standard", selected: false, byDefault: true }),
    ).toBe(false);
    expect(
      shouldSeedPotetoDefault({ agentPreset: "standard", selected: true, byDefault: true }),
    ).toBe(false);
  });

  it("does not seed under the Minimal preset", () => {
    expect(
      shouldSeedPotetoDefault({ agentPreset: "minimal", selected: undefined, byDefault: true }),
    ).toBe(false);
  });
});
