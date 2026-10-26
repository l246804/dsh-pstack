import { describe, expect, it } from "vite-plus/test";

import { assertSupportedJsonSchema, jsonSchemaToTs, violations } from "./host-schema.ts";

import {
  DEFAULT_LIMIT,
  HistoryInputError,
  MAX_LIMIT,
  MAX_PAGE_BYTES,
  MISSING_SESSION_QUERY,
  TOOL_NAME,
  apply,
  assembleEventsResult,
  authorizeObserved,
  authorizeTarget,
  childrenResult,
  classifyBackendFailure,
  createHistoryTool,
  deniedResult,
  describeProvenance,
  describeRelations,
  inject,
  name,
  parseHistoryArgs,
  readHistory,
  renderHistoryResult,
  sliceEvents,
  unavailableResult,
  OUTPUT_SCHEMA,
} from "../src/history.ts";
import type {
  HistoryArgs,
  HistoryRuntime,
  HistoryResult,
  ObservationFacts,
  TargetAuthorization,
} from "../src/history.ts";
import type {
  SessionEvent,
  SessionHeader,
  SessionObservation,
  SessionQueryHost,
  SessionRecord,
  SubagentCatalogEntry,
  SubagentCatalogHost,
  ToolDefinition,
  ToolRunContext,
  ToolsHost,
} from "../src/host-contract.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CALLER_ID = "s-caller";
const CHILD_ID = "s-child";
const WORKSPACE = "/workspace/project";

function header(overrides: Partial<SessionHeader> & { id: string }): SessionHeader {
  return {
    version: 3,
    createdAt: 1_700_000_000_000,
    isSeeded: false,
    ...overrides,
  };
}

const CALLER = header({ id: CALLER_ID, cwd: WORKSPACE });
const CHILD = header({ id: CHILD_ID, cwd: WORKSPACE, parentSession: CALLER_ID, origin: "subagent" });

function events(count: number, from = 0): readonly SessionEvent[] {
  return Array.from({ length: count }, (_value, index) => ({
    type: index % 2 === 0 ? "user/message" : "assistant/message",
    seq: from + index,
    time: 1_700_000_000_000 + from + index,
    data: { text: `message ${from + index}`, turn: 1, step: 1 },
  }));
}

interface Lease {
  readonly observation: SessionObservation;
  readonly disposeCount: () => number;
}

function lease(input: {
  readonly header: SessionHeader;
  readonly events: readonly SessionEvent[];
  readonly source?: "live" | "prepared";
  readonly revision?: string;
  readonly cursor?: number;
}): Lease {
  let disposed = 0;
  const source = input.source ?? "live";
  const observation: SessionObservation = {
    source,
    header: input.header,
    inheritedEventCount: 0,
    events: input.events,
    cursor: input.cursor ?? input.events.at(-1)?.seq ?? -1,
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    retain: () => observation,
    [Symbol.dispose]: () => {
      disposed += 1;
    },
  };
  return { observation, disposeCount: () => disposed };
}

interface HarnessOptions {
  readonly caller?: SessionHeader;
  readonly callerRecord?: SessionRecord | null;
  readonly children?: readonly SubagentCatalogEntry[];
  readonly catalogError?: unknown;
  readonly filterError?: unknown;
  readonly noSessionQuery?: boolean;
  readonly observe?: (sessionId: string) => Lease | Promise<never>;
  readonly events?: readonly SessionEvent[];
}

interface Harness {
  readonly runtime: HistoryRuntime;
  readonly calls: {
    readonly observe: string[];
    readonly filter: number;
    readonly listChildren: number;
    readonly dispatch: string[];
  };
  readonly rendered: string[];
  readonly registered: ToolDefinition[];
}

/**
 * Build one runtime over observable stubs.
 *
 * `dispatch` records every backend method in call order, which is how the
 * read-only test proves nothing but reads passes through this tool.
 */
function harness(options: HarnessOptions = {}): Harness {
  const calls = {
    observe: [] as string[],
    filter: 0,
    listChildren: 0,
    dispatch: [] as string[],
  };
  const rendered: string[] = [];
  const registered: ToolDefinition[] = [];

  const caller = options.caller ?? CALLER;
  const callerRecord: SessionRecord | null =
    options.callerRecord === undefined
      ? { header: caller, live: true, persisted: true, formatStatus: "current" }
      : options.callerRecord;

  const sessionQuery: SessionQueryHost = {
    async filterSessions(filters) {
      calls.filter += 1;
      calls.dispatch.push("filterSessions");
      if (options.filterError !== undefined) throw options.filterError;
      const ids = filters.flatMap((filter) => (filter.kind === "id" ? [...filter.values] : []));
      if (callerRecord === null) return [];
      return ids.includes(callerRecord.header.id) ? [callerRecord] : [];
    },
    async observeSession(sessionId) {
      calls.observe.push(sessionId);
      calls.dispatch.push("observeSession");
      if (options.observe !== undefined) {
        const result = await options.observe(sessionId);
        return result.observation;
      }
      return lease({ header: caller, events: options.events ?? events(3) }).observation;
    },
  };

  const subagents: SubagentCatalogHost = {
    async listChildren() {
      calls.listChildren += 1;
      calls.dispatch.push("listChildren");
      if (options.catalogError !== undefined) throw options.catalogError;
      return options.children ?? [];
    },
  };

  return {
    runtime: {
      subagents,
      getSessionQuery: () => (options.noSessionQuery === true ? undefined : sessionQuery),
    },
    calls,
    rendered,
    registered,
  };
}

function exec(agentId: string | undefined, callId = "call-current"): ToolRunContext {
  return {
    name: TOOL_NAME,
    callId,
    arguments: {},
    ...(agentId === undefined ? {} : { agent: { id: agentId } }),
    signal: new AbortController().signal,
    deferContext: () => {},
    concludeTurn: () => {},
  };
}

function args(overrides: Partial<HistoryArgs> = {}): HistoryArgs {
  return { scope: "current", fromSeq: 0, limit: DEFAULT_LIMIT, ...overrides };
}

const CHILD_ENTRY: SubagentCatalogEntry = {
  id: CHILD_ID,
  createdAt: 1_700_000_100_000,
  mode: "continuable",
  label: "reviewer",
};

function facts(overrides: Partial<ObservationFacts> = {}): ObservationFacts {
  const log = overrides.events ?? events(3);
  return {
    header: CALLER,
    source: "live",
    events: log,
    cursor: log.at(-1)?.seq ?? -1,
    inheritedEventCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Identity and authorization
// ---------------------------------------------------------------------------

describe("caller identity", () => {
  it("takes identity from exec.agent.id and reads the caller by default", async () => {
    const run = harness();
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    expect(result.kind === "events" && result.callerSessionId).toBe(CALLER_ID);
    expect(result.kind === "events" && result.session.id).toBe(CALLER_ID);
    expect(run.calls.observe).toEqual([CALLER_ID]);
  });

  it("refuses to guess a caller when exec.agent is missing", async () => {
    const run = harness();
    const result = await readHistory(args(), exec(undefined), run.runtime);

    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.code).toBe("missing-agent");
    expect(run.calls.observe).toEqual([]);
    expect(run.calls.dispatch).toEqual([]);
  });

  it("ignores an identity-looking string in the arguments", () => {
    expect(() => parseHistoryArgs({ scope: "current", sessionId: CALLER_ID })).toThrow(
      HistoryInputError,
    );
  });
});

describe("child authorization", () => {
  it("reads a continuable direct child whose header names the caller", async () => {
    const run = harness({
      children: [CHILD_ENTRY],
      observe: (sessionId) => lease({ header: CHILD, events: events(2) }),
    });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("events");
    expect(result.kind === "events" && result.requestedSessionId).toBe(CHILD_ID);
    expect(result.kind === "events" && result.relations.parentSessionId).toBe(CALLER_ID);
    expect(result.kind === "events" && result.relations.directChildren).toEqual([
      { sessionId: CHILD_ID, label: "reviewer", createdAt: 1_700_000_100_000 },
    ]);
  });

  it("denies a session that only matches fork lineage but is absent from the catalog", async () => {
    const run = harness({
      children: [],
      // The header claims the caller as its parent; lineage alone is not a grant.
      observe: () => lease({ header: CHILD, events: events(1) }),
    });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.code).toBe("not-a-direct-child");
    expect(run.calls.observe).toEqual([]);
  });

  it("denies a catalog row whose observed header names another parent", async () => {
    const run = harness({
      children: [CHILD_ENTRY],
      observe: () =>
        lease({
          header: header({ id: CHILD_ID, cwd: WORKSPACE, parentSession: "s-other-parent" }),
          events: events(1),
        }),
    });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.code).toBe("lineage-mismatch");
  });

  it("denies external, one-shot, and unknown-mode children", async () => {
    for (const mode of ["external", "one-shot", "unknown"] as const) {
      const run = harness({
        children: [{ id: CHILD_ID, createdAt: 1, mode, label: "x" }],
        observe: () => lease({ header: CHILD, events: events(1) }),
      });
      const result = await readHistory(
        args({ scope: "children", sessionId: CHILD_ID }),
        exec(CALLER_ID),
        run.runtime,
      );

      expect(result.kind, mode).toBe("denied");
      expect(result.kind === "denied" && result.code, mode).toBe("child-not-reviewable");
      expect(run.calls.observe, mode).toEqual([]);
    }
  });

  it("denies a same-role child that lives in another workspace", async () => {
    const run = harness({
      children: [CHILD_ENTRY],
      observe: () =>
        lease({ header: header({ ...CHILD, cwd: "/workspace/other" }), events: events(1) }),
    });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.code).toBe("cross-workspace");
  });

  it("denies a child read when the caller has no workspace", async () => {
    const homeless = header({ id: CALLER_ID });
    const run = harness({
      caller: homeless,
      children: [CHILD_ENTRY],
      observe: () => lease({ header: CHILD, events: events(1) }),
    });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.code).toBe("workspace-unknown");
  });

  it("returns the same denial for an unknown id and an unauthorized id", async () => {
    const run = harness({ children: [CHILD_ENTRY] });
    const unknown = await readHistory(
      args({ scope: "children", sessionId: "s-does-not-exist" }),
      exec(CALLER_ID),
      run.runtime,
    );
    const sibling = await readHistory(
      args({ scope: "children", sessionId: "s-someone-elses-child" }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(unknown.kind).toBe("denied");
    expect(sibling.kind).toBe("denied");
    expect(unknown.kind === "denied" && unknown.code).toBe(
      sibling.kind === "denied" && sibling.code,
    );
    expect(unknown.kind === "denied" && unknown.message).toBe(
      sibling.kind === "denied" && sibling.message,
    );
  });

  it("never lists ids of children it will not read", () => {
    const relations = describeRelations(CALLER_ID, [
      CHILD_ENTRY,
      { id: "s-ext", createdAt: 1, mode: "external", label: "cloud" },
      { id: "s-one", createdAt: 1, mode: "one-shot" },
      { id: "s-unknown", createdAt: 1, mode: "unknown" },
    ]);

    expect(relations.directChildren.map((child) => child.sessionId)).toEqual([CHILD_ID]);
    expect(relations.excluded).toEqual({ external: 1, oneShot: 1, unknown: 1 });
    expect(JSON.stringify(relations)).not.toContain("s-ext");
    expect(JSON.stringify(relations)).not.toContain("s-one");
    expect(JSON.stringify(relations)).not.toContain("s-unknown");
  });

  it("keeps the pure matrix honest about each half of the check", () => {
    expect(authorizeTarget(CALLER_ID, CALLER_ID, [])).toEqual({ kind: "self" });
    expect(authorizeTarget(CALLER_ID, CHILD_ID, [CHILD_ENTRY])).toEqual({
      kind: "child",
      label: "reviewer",
    });
    expect(authorizeTarget(CALLER_ID, CHILD_ID, [])).toBe("not-a-direct-child");
    expect(authorizeTarget(null, CHILD_ID, [CHILD_ENTRY])).toBe("missing-agent");

    const child: TargetAuthorization = { kind: "child", label: "reviewer" };
    expect(
      authorizeObserved({
        callerId: CALLER_ID,
        targetId: CHILD_ID,
        target: child,
        observedHeader: CHILD,
        callerCwd: WORKSPACE,
      }),
    ).toBeNull();
    expect(
      authorizeObserved({
        callerId: CALLER_ID,
        targetId: CHILD_ID,
        target: child,
        observedHeader: header({ id: CHILD_ID, cwd: WORKSPACE }),
        callerCwd: WORKSPACE,
      }),
    ).toBe("lineage-mismatch");
    expect(
      authorizeObserved({
        callerId: CALLER_ID,
        targetId: "s-other",
        target: child,
        observedHeader: CHILD,
        callerCwd: WORKSPACE,
      }),
    ).toBe("target-changed");
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe("pagination", () => {
  it("defaults the limit and slices by fromSeq", () => {
    const parsed = parseHistoryArgs({});
    expect(parsed.limit).toBe(DEFAULT_LIMIT);
    expect(parsed.fromSeq).toBe(0);

    const sliced = sliceEvents({
      events: events(10),
      fromSeq: 4,
      limit: 3,
      throughSeq: 9,
    });
    expect(sliced.events.map((event) => event.seq)).toEqual([4, 5, 6]);
    expect(sliced.nextFromSeq).toBe(7);
    expect(sliced.hasMore).toBe(true);
  });

  it("returns the tail without truncating near the boundary", () => {
    const sliced = sliceEvents({
      events: events(10),
      fromSeq: 7,
      limit: 50,
      throughSeq: 9,
    });
    expect(sliced.events.map((event) => event.seq)).toEqual([7, 8, 9]);
    expect(sliced.nextFromSeq).toBeNull();
    expect(sliced.hasMore).toBe(false);
  });

  it("stops before throughSeq even when more events exist", () => {
    const sliced = sliceEvents({
      events: events(10),
      fromSeq: 0,
      limit: 4,
      throughSeq: 4,
    });
    expect(sliced.events.map((event) => event.seq)).toEqual([0, 1, 2, 3]);
    expect(sliced.nextFromSeq).toBe(4);
    expect(sliced.hasMore).toBe(true);
  });

  it("rejects a page larger than the cap instead of clamping it", () => {
    expect(() => parseHistoryArgs({ limit: MAX_LIMIT + 1 })).toThrow(/capped at 200/);
    expect(parseHistoryArgs({ limit: MAX_LIMIT }).limit).toBe(MAX_LIMIT);
    expect(() => parseHistoryArgs({ limit: 0 })).toThrow(/positive integer/);
    expect(() => parseHistoryArgs({ limit: 2.5 })).toThrow(/positive integer/);
  });

  it("reports an empty page past the snapshot boundary without pretending it is the end", async () => {
    const run = harness({ events: events(3) });
    const result = await readHistory(args({ fromSeq: 40 }), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.events).toEqual([]);
    expect(result.page.throughSeq).toBe(2);
    expect(result.page.nextFromSeq).toBeNull();
    expect(result.page.hasMore).toBe(false);
    expect(result.notes.join("\n")).toContain("beyond the snapshot boundary");
  });

  it("advances the cursor across pages of one fixed snapshot", async () => {
    const run = harness({ events: events(5) });
    const first = await readHistory(args({ limit: 2 }), exec(CALLER_ID), run.runtime);
    const second = await readHistory(
      args({ fromSeq: 2, limit: 2 }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(first.kind).toBe("events");
    expect(second.kind).toBe("events");
    if (first.kind !== "events" || second.kind !== "events") return;
    expect(first.events.map((event) => event.seq)).toEqual([0, 1]);
    expect(first.page.nextFromSeq).toBe(2);
    expect(second.events.map((event) => event.seq)).toEqual([2, 3]);
    expect(second.page.nextFromSeq).toBe(4);
  });

  it("stops at the byte ceiling but still returns one event", () => {
    const huge: SessionEvent[] = [
      { type: "tool/result", seq: 0, time: 1, data: { text: "x".repeat(MAX_PAGE_BYTES) } },
      { type: "tool/result", seq: 1, time: 2, data: { text: "y" } },
    ];
    const sliced = sliceEvents({ events: huge, fromSeq: 0, limit: 10, throughSeq: 1 });

    expect(sliced.events.map((event) => event.seq)).toEqual([0]);
    expect(sliced.truncatedByBytes).toBe(true);
    expect(sliced.nextFromSeq).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Snapshot semantics
// ---------------------------------------------------------------------------

describe("snapshot semantics", () => {
  it("allows an open step and turn: an unbalanced tail is not an error", async () => {
    const open: SessionEvent[] = [
      { type: "turn/start", seq: 0, time: 1, data: { turn: 1 } },
      { type: "step/start", seq: 1, time: 2, data: { turn: 1, step: 1 } },
    ];
    const run = harness({
      observe: () => lease({ header: CALLER, events: open }),
    });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.events.map((event) => event.type)).toEqual(["turn/start", "step/start"]);
    expect(result.audit.complete).toBe(true);
  });

  it("leaves this call's own tool/call out of the audit basis", () => {
    const log: SessionEvent[] = [
      ...events(2),
      {
        type: "tool/call",
        seq: 2,
        time: 3,
        data: { turn: 1, step: 1, callId: "call-current", name: TOOL_NAME, arguments: "{}" },
      },
    ];
    const sliced = sliceEvents({
      events: log,
      fromSeq: 0,
      limit: 10,
      throughSeq: 2,
      ownCallIds: ["call-current"],
    });

    expect(sliced.events.map((event) => event.seq)).toEqual([0, 1]);
    expect(sliced.excludedOwnCallSeqs).toEqual([2]);
    expect(sliced.nextFromSeq).toBeNull();
  });

  it("keeps an earlier call from the same tool and a different call id", () => {
    const log: SessionEvent[] = [
      {
        type: "tool/call",
        seq: 0,
        time: 1,
        data: { turn: 1, step: 1, callId: "call-earlier", name: TOOL_NAME, arguments: "{}" },
      },
    ];
    const sliced = sliceEvents({
      events: log,
      fromSeq: 0,
      limit: 10,
      throughSeq: 0,
      ownCallIds: ["call-current"],
    });

    expect(sliced.events.map((event) => event.seq)).toEqual([0]);
    expect(sliced.excludedOwnCallSeqs).toEqual([]);
  });

  it("does not absorb events appended after the observation started", async () => {
    const store = [...events(2)];
    const run = harness({
      observe: () => {
        // The real service captures `snapshotEvents(0, seq)` when the lease is
        // built; this stub freezes the same way.
        const frozen = [...store];
        store.push({
          type: "user/message",
          seq: 2,
          time: 9,
          data: { text: "late append", turn: 2, step: 1 },
        });
        return lease({ header: CALLER, events: frozen });
      },
    });
    const result = await readHistory(args({ limit: 50 }), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.events.map((event) => event.seq)).toEqual([0, 1]);
    expect(result.page.throughSeq).toBe(1);
    expect(result.page.hasMore).toBe(false);
    expect(run.calls.observe).toHaveLength(1);
  });

  it("honors a pinned throughSeq so a later page cannot absorb appends", async () => {
    const run = harness({ events: events(5) });
    const result = await readHistory(
      args({ fromSeq: 0, limit: 10, throughSeq: 2 }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.events.map((event) => event.seq)).toEqual([0, 1, 2]);
    expect(result.page.throughSeq).toBe(2);
    expect(result.page.hasMore).toBe(false);
  });

  it("clamps a requested throughSeq to the snapshot instead of extending it", async () => {
    const run = harness({ events: events(3) });
    const result = await readHistory(
      args({ throughSeq: 99 }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.page.throughSeq).toBe(2);
    expect(result.notes.join("\n")).toContain("beyond this snapshot's last seq 2");
  });
});

// ---------------------------------------------------------------------------
// Lease release
// ---------------------------------------------------------------------------

describe("lease release", () => {
  it("releases the observation after a successful page", async () => {
    const held = lease({ header: CALLER, events: events(2) });
    const run = harness({ observe: () => held });
    await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(held.disposeCount()).toBe(1);
  });

  it("releases the observation when the authorization of the observed header fails", async () => {
    const held = lease({
      header: header({ id: CHILD_ID, cwd: "/workspace/other", parentSession: CALLER_ID }),
      events: events(2),
    });
    const run = harness({ children: [CHILD_ENTRY], observe: () => held });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("denied");
    expect(held.disposeCount()).toBe(1);
  });

  it("releases the observation when assembly throws", async () => {
    const held = lease({ header: CALLER, events: events(2) });
    const run = harness({ observe: () => held });
    const exploding = new Proxy(CALLER, {
      get(target, property, receiver) {
        if (property === "version") throw new Error("header exploded");
        return Reflect.get(target, property, receiver);
      },
    });
    const observation = { ...held.observation, header: exploding } as SessionObservation;
    const throwingRun: HistoryRuntime = {
      subagents: run.runtime.subagents,
      getSessionQuery: () => ({
        async filterSessions() {
          return [{ header: CALLER, live: true, persisted: true }];
        },
        async observeSession() {
          return observation;
        },
      }),
    };

    await expect(readHistory(args(), exec(CALLER_ID), throwingRun)).rejects.toThrow(
      /header exploded/,
    );
    expect(held.disposeCount()).toBe(1);
  });

  it("never observes a session it did not authorize", async () => {
    const run = harness({ children: [] });
    await readHistory(
      args({ scope: "children", sessionId: "s-stranger" }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(run.calls.observe).toEqual([]);
    // The catalog is the only backend read: an unauthorized target is refused
    // before the caller's workspace is even resolved.
    expect(run.calls.dispatch).toEqual(["listChildren"]);
  });
});

// ---------------------------------------------------------------------------
// Provenance and snapshot boundary reporting
// ---------------------------------------------------------------------------

describe("provenance", () => {
  it("marks a live snapshot as first-party and omits a revision", async () => {
    const run = harness({ events: events(2) });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.snapshotSource).toBe("live");
    expect(result.revision).toBeNull();
    expect(result.provenance.determination).toBe("source-log");
    expect(result.provenance.persistedThroughSeq).toBeNull();
    expect(result.audit.complete).toBe(true);
  });

  it("marks a prepared snapshot undeterminable and reports its revision", async () => {
    const run = harness({
      observe: () =>
        lease({
          header: CALLER,
          events: events(3),
          source: "prepared",
          revision: "rev-7",
        }),
    });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.snapshotSource).toBe("prepared");
    expect(result.revision).toBe("rev-7");
    expect(result.provenance.determination).toBe("undeterminable");
    expect(result.audit.complete).toBe(false);
    expect(result.audit.blockers.join(" ")).toContain("cannot be determined");
  });

  it("never invents a persistence boundary", () => {
    for (const source of ["live", "prepared"] as const) {
      expect(describeProvenance({ source }).persistedThroughSeq).toBeNull();
    }
  });

  it("reports coverage from what the page actually covers", () => {
    const full = assembleEventsResult({
      args: args(),
      callerSessionId: CALLER_ID,
      targetId: CALLER_ID,
      target: { kind: "self" },
      facts: facts(),
      relations: describeRelations(CALLER_ID, []),
      ownCallIds: [],
    });
    expect(full.audit.coverage).toBe("full");

    const partial = assembleEventsResult({
      args: args({ limit: 1 }),
      callerSessionId: CALLER_ID,
      targetId: CALLER_ID,
      target: { kind: "self" },
      facts: facts(),
      relations: describeRelations(CALLER_ID, []),
      ownCallIds: [],
    });
    expect(partial.audit.coverage).toBe("partial");
    expect(partial.page.hasMore).toBe(true);

    const empty = assembleEventsResult({
      args: args(),
      callerSessionId: CALLER_ID,
      targetId: CALLER_ID,
      target: { kind: "self" },
      facts: facts({ events: [], cursor: -1 }),
      relations: describeRelations(CALLER_ID, []),
      ownCallIds: [],
    });
    expect(empty.audit.coverage).toBe("none");
    expect(empty.events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

describe("degradation", () => {
  it("reports a missing sessionQuery service instead of an empty history", async () => {
    const run = harness({ noSessionQuery: true });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("unavailable");
    expect(result.kind === "unavailable" && result.layer).toBe("session-query");
    expect(result.kind === "unavailable" && result.code).toBe(
      MISSING_SESSION_QUERY.code,
    );
    expect(result.notes.join(" ")).toContain("not evidence");
  });

  it("names the persistence layer when the log store is unavailable", async () => {
    const backendError = Object.assign(new Error("ENOENT /home/someone/.dsh/sessions/x"), {
      code: "SESSION_QUERY_PERSISTENCE_FAILED",
    });
    const run = harness({ observe: () => Promise.reject(backendError) });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("unavailable");
    if (result.kind !== "unavailable") return;
    expect(result.layer).toBe("persistence");
    expect(result.message).toContain("not an empty history");
    expect(JSON.stringify(result)).not.toContain("/home/someone");
    expect(JSON.stringify(result)).not.toContain("ENOENT");
  });

  it("redacts an unknown backend failure", async () => {
    const run = harness({
      observe: () => Promise.reject(new Error("boom at /tmp/private/session.jsonl")),
    });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("unavailable");
    if (result.kind !== "unavailable") return;
    expect(result.layer).toBe("backend");
    expect(result.code).toBe("session-query-failed");
    expect(JSON.stringify(result)).not.toContain("/tmp/private");
  });

  it("maps each documented backend code and never echoes the original message", () => {
    for (const code of [
      "SESSION_QUERY_PERSISTENCE_FAILED",
      "SESSION_QUERY_SESSION_NOT_FOUND",
      "SESSION_QUERY_CORRUPT_SESSION",
      "SESSION_QUERY_INVALID_LINEAGE",
      "SESSION_QUERY_INVALID_FILTER",
      "SESSION_QUERY_SOURCE_CONFLICT",
      "SESSION_QUERY_ABORTED",
      "SESSION_QUERY_SOMETHING_NEW",
    ]) {
      const failure = classifyBackendFailure(
        Object.assign(new Error(`secret detail for ${code}`), { code }),
      );
      expect(failure.message, code).not.toContain("secret detail");
      expect(failure.message.length, code).toBeGreaterThan(0);
    }
    expect(classifyBackendFailure("not an error").code).toBe("session-query-failed");
  });

  it("fails a caller lookup before reading any target", async () => {
    const run = harness({ callerRecord: null });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("unavailable");
    expect(result.kind === "unavailable" && result.code).toBe("caller-unavailable");
    expect(run.calls.observe).toEqual([]);
  });

  it("denies a child read when the catalog itself cannot be read", async () => {
    const run = harness({ catalogError: new Error("catalog down") });
    const result = await readHistory(
      args({ scope: "children", sessionId: CHILD_ID }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("denied");
    expect(result.kind === "denied" && result.code).toBe("catalog-unavailable");
    expect(JSON.stringify(result)).not.toContain("catalog down");
  });

  it("still reads the caller's own log when the catalog is unavailable", async () => {
    const run = harness({ catalogError: new Error("catalog down") });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(result.kind).toBe("events");
    if (result.kind !== "events") return;
    expect(result.relations.catalogAvailable).toBe(false);
    expect(result.audit.complete).toBe(false);
    expect(result.audit.blockers.join(" ")).toContain("catalog");
  });

  it("builds an unavailable result through the same closed taxonomy", () => {
    const result = unavailableResult({
      callerSessionId: CALLER_ID,
      requestedSessionId: null,
      scope: "current",
      failure: MISSING_SESSION_QUERY,
    });
    expect(result.kind).toBe("unavailable");
    expect(result.notes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Read-only guarantee
// ---------------------------------------------------------------------------

describe("read-only", () => {
  it("calls nothing but the read methods it needs", async () => {
    const run = harness({ children: [CHILD_ENTRY], events: events(4) });
    await readHistory(args(), exec(CALLER_ID), run.runtime);

    expect(run.calls.dispatch).toEqual(["listChildren", "filterSessions", "observeSession"]);
    expect(run.calls.listChildren).toBe(1);
    expect(run.calls.filter).toBe(1);
    expect(run.calls.observe).toHaveLength(1);
  });

  it("does not mutate the snapshot it reads", async () => {
    const held = lease({ header: CALLER, events: events(4) });
    const before = held.observation.events.slice();
    const run = harness({ observe: () => held });
    await readHistory(args({ limit: 2 }), exec(CALLER_ID), run.runtime);

    expect(held.observation.events).toEqual(before);
    expect(held.observation.events).toHaveLength(4);
  });

  it("declares the tool concurrency-safe and ready for parallel reads", () => {
    const run = harness();
    const tool = createHistoryTool(run.runtime);
    expect(tool.isConcurrencySafe?.({})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("input validation", () => {
  it("rejects unknown options and contradictory scopes", () => {
    expect(() => parseHistoryArgs({ nope: 1 })).toThrow(/no option "nope"/);
    expect(() => parseHistoryArgs({ scope: "current", sessionId: "s-1" })).toThrow(
      /scope "current" reads the calling Agent/,
    );
    expect(() => parseHistoryArgs({ scope: "descendants" })).toThrow(/must be "current"/);
  });

  it("rejects a value for includeDescendants, which is not implemented", () => {
    expect(() => parseHistoryArgs({ includeDescendants: true })).toThrow(/not implemented/);
    expect(parseHistoryArgs({ includeDescendants: false }).scope).toBe("current");
  });

  it("rejects ids that look like paths or carry control characters", () => {
    for (const bad of ["", "   ", "a/b", "a\\b", "a\u0000b"]) {
      expect(() => parseHistoryArgs({ scope: "children", sessionId: bad }), bad).toThrow(
        HistoryInputError,
      );
    }
    expect(parseHistoryArgs({ scope: "children", sessionId: "s-1" }).sessionId).toBe("s-1");
  });

  it("rejects inverted and negative sequence bounds", () => {
    expect(() => parseHistoryArgs({ fromSeq: -1 })).toThrow(/non-negative/);
    expect(() => parseHistoryArgs({ fromSeq: 5, throughSeq: 4 })).toThrow(/must not be greater/);
  });

  it("throws a typed error the registry can surface", () => {
    try {
      parseHistoryArgs({ limit: 10_000 });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(HistoryInputError);
      expect((error as HistoryInputError).code).toBe("LIMIT_TOO_LARGE");
    }
  });
});

// ---------------------------------------------------------------------------
// Catalog-only reads and rendering
// ---------------------------------------------------------------------------

describe("children catalog", () => {
  it("lists reviewable children without reading a log", async () => {
    const run = harness({
      children: [
        CHILD_ENTRY,
        { id: "s-ext", createdAt: 2, mode: "external", label: "cloud" },
      ],
    });
    const result = await readHistory(
      args({ scope: "children" }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("children");
    if (result.kind !== "children") return;
    expect(result.relations.directChildren).toHaveLength(1);
    expect(result.relations.excluded.external).toBe(1);
    expect(run.calls.observe).toEqual([]);
    expect(result.notes.join(" ")).toContain("Only continuable children are listed");
  });

  it("fails the catalog with a layer when the catalog is unavailable", async () => {
    const run = harness({ catalogError: new Error("nope") });
    const result = await readHistory(
      args({ scope: "children" }),
      exec(CALLER_ID),
      run.runtime,
    );

    expect(result.kind).toBe("unavailable");
    expect(result.kind === "unavailable" && result.code).toBe("catalog-unavailable");
  });

  it("builds a catalog result through the pure helper", () => {
    const result = childrenResult({
      callerSessionId: CALLER_ID,
      relations: describeRelations(CALLER_ID, [CHILD_ENTRY]),
    });
    expect(result.kind).toBe("children");
    expect(result.requestedSessionId).toBeNull();
  });
});

describe("rendering", () => {
  it("shows the basis an auditor needs and the untrusted-data warning", async () => {
    const run = harness({ events: events(2) });
    const result = await readHistory(args(), exec(CALLER_ID), run.runtime);
    const text = renderHistoryResult(result);

    expect(text).toContain(`pstack_history: events`);
    expect(text).toContain("source=live");
    expect(text).toContain("provenance=source-log");
    expect(text).toContain("audit complete=true");
    expect(text).toContain('"seq":0');
    expect(text).toContain("untrusted data");
  });

  it("renders a denial without pretending it is an empty log", () => {
    const text = renderHistoryResult(
      deniedResult({
        callerSessionId: CALLER_ID,
        requestedSessionId: "s-x",
        scope: "children",
        code: "not-a-direct-child",
        message: "refused",
      }),
    );

    expect(text).toContain("pstack_history: denied");
    expect(text).toContain("layer=authorization");
    expect(text).toContain("refused");
  });
});

// ---------------------------------------------------------------------------
// Row wiring
// ---------------------------------------------------------------------------

describe("row wiring", () => {
  it("registers the tool under its model-facing name", () => {
    const registered: ToolDefinition[] = [];
    const tools: ToolsHost = {
      register(definition) {
        registered.push(definition);
        return () => {};
      },
    };
    apply({
      tools,
      subagents: { listChildren: async () => [] },
    });

    expect(registered).toHaveLength(1);
    expect(registered[0]?.name).toBe(TOOL_NAME);
    expect(name).toBe("pstack-history");
    expect(inject).toEqual(["tools", "subagents", "sessionQuery"]);
  });

  it("declares the documented parameters and no extra field", () => {
    const run = harness();
    const tool = createHistoryTool(run.runtime);
    const parameters = tool.parameters as {
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };

    // `includeDescendants` stays out of the model-facing schema because this
    // version rejects it; a model that guesses it still gets a specific error.
    expect(Object.keys(parameters.properties)).toEqual([
      "scope",
      "sessionId",
      "fromSeq",
      "throughSeq",
      "limit",
    ]);
    expect(parameters.additionalProperties).toBe(false);
  });

  it("returns unavailable instead of failing when the row has no query service", async () => {
    const tool = createHistoryTool({
      subagents: { listChildren: async () => [] },
      getSessionQuery: () => undefined,
    });
    const value = await tool.execute({}, exec(CALLER_ID));
    expect((value as { kind: string }).kind).toBe("unavailable");
  });
});

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

/**
 * Every DTO variant must survive the Host's validator.
 *
 * `OUTPUT_SCHEMA` was declared at `src/history.ts` and referenced only by the
 * tool's `output.schema`; no test ever fed a result to it. That is how two
 * `string` fields that three variants write as `null` shipped: the registry
 * validates before rendering, so a `children` or `denied` result would have
 * reached the model as `tool "pstack_history" returned invalid output`.
 */
describe("every result variant satisfies the declared output schema", () => {
  const relations = describeRelations(CALLER_ID, []);

  it("is inside the Host's supported schema subset", () => {
    expect(() => assertSupportedJsonSchema(OUTPUT_SCHEMA)).not.toThrow();
    expect(jsonSchemaToTs(OUTPUT_SCHEMA as never)).not.toBe("unknown");
  });

  const cases: readonly [string, () => HistoryResult][] = [
    ["children", () => childrenResult({ callerSessionId: CALLER_ID, relations })],
    [
      "denied with null ids",
      () =>
        deniedResult({
          callerSessionId: null,
          requestedSessionId: null,
          scope: "current",
          code: "missing-agent",
          message: "This call had no Agent, so there is no session to read.",
        }),
    ],
    [
      "denied with a caller only",
      () =>
        deniedResult({
          callerSessionId: CALLER_ID,
          requestedSessionId: null,
          scope: "current",
          code: "cross-workspace",
          message: "m",
        }),
    ],
    [
      "unavailable with null ids",
      () =>
        unavailableResult({
          callerSessionId: null,
          requestedSessionId: null,
          scope: "current",
          failure: MISSING_SESSION_QUERY,
        }),
    ],
    [
      "unavailable with a caller only",
      () =>
        unavailableResult({
          callerSessionId: CALLER_ID,
          requestedSessionId: CHILD_ID,
          scope: "children",
          failure: MISSING_SESSION_QUERY,
        }),
    ],
  ];

  for (const [label, build] of cases) {
    it(label, () => {
      expect(violations(OUTPUT_SCHEMA, build())).toEqual([]);
    });
  }

  it("events page built from a real read", async () => {
    const { runtime } = harness({ events: events(3) });
    const value = await readHistory(parseHistoryArgs({}), exec(CALLER_ID), runtime);
    expect(value.kind).toBe("events");
    expect(violations(OUTPUT_SCHEMA, value)).toEqual([]);
  });

  it("unavailable from the real execute path, with no query service", async () => {
    const tool = createHistoryTool({
      subagents: { listChildren: async () => [] },
      getSessionQuery: () => undefined,
    });
    // A caller must be present here: the missing-Agent denial is checked first,
    // so passing no Agent would exercise that branch instead of this one.
    const value = await tool.execute({}, exec(CALLER_ID));
    expect((value as { kind: string }).kind).toBe("unavailable");
    expect((value as { code: string }).code).toBe(MISSING_SESSION_QUERY.code);
    expect(violations(OUTPUT_SCHEMA, value)).toEqual([]);
  });

  it("denied from the real execute path, with no Agent", async () => {
    const tool = createHistoryTool(harness().runtime);
    const value = await tool.execute({}, exec(undefined));
    expect((value as { kind: string }).kind).toBe("denied");
    expect(violations(OUTPUT_SCHEMA, value)).toEqual([]);
  });
});
