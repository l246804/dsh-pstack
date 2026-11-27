import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants, zstdCompressSync } from "node:zlib";

import { describe, expect, it } from "vite-plus/test";

import {
  clearRepairQueue,
  decodeZstdFrames,
  enqueueRepair,
  executeRepairQueue,
  queuedSessionIds,
  readRepairQueue,
  repairLegacySession,
  repairQueuePath,
  restoreLegacySession,
  scanLegacySessions,
  writeRepairQueue,
} from "../poteto/maintenance.ts";
import type { PotetoModeRecord, PotetoModeTable } from "../poteto/storage.ts";

const CHECKSUM = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };

function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "pstack-maintenance-"));
  return run(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function memoryTable(): PotetoModeTable {
  const records = new Map<string, PotetoModeRecord>();
  return {
    get: (sessionId) => records.get(sessionId),
    put: async (sessionId, record) => {
      records.set(sessionId, record);
    },
    delete: async (sessionId) => records.delete(sessionId),
  };
}

function writeLegacyLog(dir: string): string {
  const path = join(dir, "session.v4.jsonl.zstd");
  const header = {
    type: "session",
    version: 4,
    id: "session-1",
    createdAt: 1_700_000_000_000,
    isSeeded: false,
    delegationDepth: 0,
  };
  const events = [
    {
      type: "session/title",
      seq: 0,
      time: 1,
      data: { title: "Old session", messageSeqs: [], source: { kind: "user" } },
    },
    { type: "poteto/mode", seq: 1, time: 2, data: { enabled: false } },
    { type: "poteto/mode", seq: 2, time: 3, data: { enabled: true } },
  ];
  const headerFrame = zstdCompressSync(
    Buffer.from(`${JSON.stringify(header)}\n`, "utf8"),
    CHECKSUM,
  );
  const eventFrame = zstdCompressSync(
    Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8"),
    CHECKSUM,
  );
  writeFileSync(path, Buffer.concat([headerFrame, eventFrame]));
  return path;
}

function readEvents(path: string): readonly Record<string, unknown>[] {
  const lines = decodeZstdFrames(readFileSync(path)).toString("utf8").trim().split("\n");
  return lines.slice(1).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("poteto legacy session maintenance", () => {
  it("resolves the repair queue under the pstack home for one DSH home", () => {
    expect(repairQueuePath("/home/user/.dsh")).toBe("/home/user/.dsh/pstack/repair.json");
  });

  it("skips Zstandard skippable frames when decoding a log", () => {
    const payload = Buffer.from('header\n{"type":"session/title"}\n', "utf8");
    const skippable = Buffer.alloc(11);
    skippable.writeUInt32LE(0x184d2a50, 0);
    skippable.writeUInt32LE(3, 4);
    skippable.write("abc", 8);
    const frame = zstdCompressSync(payload, CHECKSUM);

    expect(decodeZstdFrames(Buffer.concat([skippable, frame])).toString("utf8")).toBe(
      payload.toString("utf8"),
    );
  });

  it("finds sessions with the retired event and reports the last selection", async () => {
    await withTempDir(async (dir) => {
      const logPath = writeLegacyLog(dir);
      const result = scanLegacySessions([
        { sessionId: "session-1", workspace: "/work/repo", logPath },
      ]);

      expect(result.failures).toEqual([]);
      expect(result.sessions).toEqual([
        {
          sessionId: "session-1",
          workspace: "/work/repo",
          title: "Old session",
          enabled: true,
          eventCount: 3,
        },
      ]);
    });
  });

  it("marks the old events ignorable and seeds the sidecar", async () => {
    await withTempDir(async (dir) => {
      const logPath = writeLegacyLog(dir);
      const table = memoryTable();
      const ref = { sessionId: "session-1", workspace: "/work/repo", logPath };

      const repaired = await repairLegacySession(ref, table);

      expect(repaired.changed).toBe(true);
      expect(table.get("session-1")).toEqual({ enabled: true });
      expect(readEvents(logPath).map((event) => event["ignorable"])).toEqual([
        undefined,
        true,
        true,
      ]);
      expect(scanLegacySessions([ref]).sessions).toEqual([]);
    });
  });

  it("restores both the log and the sidecar when validation fails", async () => {
    await withTempDir(async (dir) => {
      const logPath = writeLegacyLog(dir);
      const table = memoryTable();
      const ref = { sessionId: "session-1", workspace: "/work/repo", logPath };
      const repaired = await repairLegacySession(ref, table);

      await restoreLegacySession(ref, table, repaired);

      expect(table.get("session-1")).toBeUndefined();
      expect(readEvents(logPath).map((event) => event["ignorable"])).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
    });
  });

  it("executes queued repairs and skips live sessions", async () => {
    await withTempDir(async (dir) => {
      const logPath = writeLegacyLog(dir);
      const ref = { sessionId: "session-1", workspace: "/work/repo", logPath };
      const queue = { version: 1 as const, createdAt: 1, sessionIds: ["session-1"] };
      const table = memoryTable();

      const repaired = await executeRepairQueue(queue, [ref], {
        table,
        openRead: async () => ({ read: async () => undefined, close: async () => undefined }),
        isLive: () => false,
      });
      expect(repaired).toEqual({ repaired: 1, failed: [] });
      expect(readEvents(logPath).map((event) => event["ignorable"])).toEqual([
        undefined,
        true,
        true,
      ]);
      expect(table.get("session-1")).toEqual({ enabled: true });

      const skipped = await executeRepairQueue(queue, [ref], {
        table,
        openRead: async () => ({ read: async () => undefined, close: async () => undefined }),
        isLive: () => true,
      });
      expect(skipped).toEqual({
        repaired: 0,
        failed: [{ sessionId: "session-1", message: "session is live" }],
      });
    });
  });

  it("restores the log and sidecar when the rewritten log cannot be read", async () => {
    await withTempDir(async (dir) => {
      const logPath = writeLegacyLog(dir);
      const table = memoryTable();
      const ref = { sessionId: "session-1", workspace: "/work/repo", logPath };
      const queue = { version: 1 as const, createdAt: 1, sessionIds: ["session-1"] };

      const outcome = await executeRepairQueue(queue, [ref], {
        table,
        openRead: async () => ({
          read: async () => {
            throw new Error("invalid session log");
          },
          close: async () => undefined,
        }),
        isLive: () => false,
      });

      expect(outcome.repaired).toBe(0);
      expect(outcome.failed[0]?.message).toBe("invalid session log");
      expect(readEvents(logPath).map((event) => event["ignorable"])).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(table.get("session-1")).toBeUndefined();
    });
  });

  it("appends newly selected sessions without dropping earlier queue entries", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "repair.json");
      writeRepairQueue(["session-1"], path);
      expect(enqueueRepair(["session-2", "session-2"], path)).toBe(1);
      expect(queuedSessionIds(path)).toEqual(new Set(["session-1", "session-2"]));
    });
  });

  it("queues, reads, and clears the restart request", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "repair.json");
      expect(writeRepairQueue(["session-1", "session-1", "session-2"], path)).toBe(2);
      expect(readRepairQueue(path)).toMatchObject({
        version: 1,
        sessionIds: ["session-1", "session-2"],
      });
      clearRepairQueue(path);
      expect(readRepairQueue(path)).toBeUndefined();
    });
  });
});
