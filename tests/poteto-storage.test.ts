import { describe, expect, it } from "vite-plus/test";

import {
  potetoDomainSpec,
  readPotetoMode,
  writePotetoMode,
  type PotetoModeRecord,
  type PotetoModeTable,
} from "../src/poteto/storage.ts";

function memoryTable(): PotetoModeTable {
  const records = new Map<string, PotetoModeRecord>();
  return {
    get: (sessionId) => records.get(sessionId),
    put: async (sessionId, record) => {
      records.set(sessionId, record);
    },
  };
}

describe("poteto storage domain", () => {
  it("declares one per-record table for session sidecar state", () => {
    expect(potetoDomainSpec).toMatchObject({
      name: "pstack",
      version: 1,
      layout: "per-record",
    });
    expect(Object.keys(potetoDomainSpec.tables)).toEqual(["poteto_modes"]);
    expect(
      potetoDomainSpec.tables["poteto_modes"]?.valueSchema.safeParse({ enabled: true }).success,
    ).toBe(true);
  });

  it("round-trips the saved selection", async () => {
    const table = memoryTable();

    expect(readPotetoMode(table, "session-1")).toBeUndefined();
    await writePotetoMode(table, "session-1", true);
    expect(readPotetoMode(table, "session-1")).toBe(true);
    await writePotetoMode(table, "session-1", false);
    expect(readPotetoMode(table, "session-1")).toBe(false);
  });
});
