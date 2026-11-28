import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { zstdCompressSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  latestSessionFile,
  readSessionEvents,
  type SessionEvent,
} from "../runner/storage/sessions.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  mkdirSync(".tmp", { recursive: true });
  const home = mkdtempSync(resolve(".tmp/session-storage-"));
  directories.push(home);
  return { home };
}

function writeSession(
  home: string,
  scenario: string,
  id: string,
  events: SessionEvent[],
  time: number,
) {
  const file = join(home, "sessions", scenario, id, "session.v4.jsonl.zstd");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    zstdCompressSync(Buffer.from(events.map((event) => JSON.stringify(event)).join("\n"))),
  );
  utimesSync(file, time, time);
  return file;
}

describe("DSH session storage", () => {
  it("locates the current root session without selecting a newer subagent or another scenario", () => {
    const paths = fixture();
    const started = 1_800_000_000;
    writeSession(paths.home, "probe", "old", [{ type: "session" }], started - 1);
    const events: SessionEvent[] = [
      { type: "session", cwd: "/dsh/workspace/probe" },
      { type: "turn/end", seq: 2, time: started * 1000, data: { reason: { kind: "completed" } } },
    ];
    const file = writeSession(paths.home, "probe", "current", events, started + 1);
    writeSession(
      paths.home,
      "probe",
      "child",
      [{ type: "session", origin: "subagent", delegationDepth: 1 }],
      started + 2,
    );
    writeSession(paths.home, "another", "other", [{ type: "session" }], started + 3);
    expect(
      latestSessionFile(paths, {
        scenarioId: "probe",
        rootOnly: true,
        startedAt: new Date(started * 1000).toISOString(),
      }),
    ).toEqual({ id: "current", file });
    expect(readSessionEvents(file)).toEqual(events);
  });

  it("distinguishes missing logs from malformed event data", () => {
    const paths = fixture();
    expect(latestSessionFile(paths)).toBeNull();
    const file = join(paths.home, "broken.zstd");
    expect(() => readSessionEvents(file)).toThrow("session log is missing");
    writeFileSync(file, zstdCompressSync(Buffer.from('{"type":"session"}\ninvalid')));
    expect(() => readSessionEvents(file)).toThrow(`invalid session event at line 2 in ${file}`);
  });
});
