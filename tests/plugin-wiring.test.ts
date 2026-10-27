/**
 * Real Cordis assembly of `cordis.patch.yml`.
 *
 * Every other test in this repository drives one module with a hand-shaped fake
 * context. That is enough for a tool's own logic and not enough for the two
 * defects that only a real composition shows:
 *
 * 1. A row that never declares `inject` cannot read `ctx.tools` at all — Cordis
 *    runs `apply` immediately and the service proxy throws
 *    `cannot get property "tools" without inject`. A fake context never throws,
 *    so the row looked like it registered.
 * 2. The worktree guard is evaluated by the Loader against a context whose entry
 *    is the row being judged. A hand-built `{ fiber: { entry: … } }` picks the
 *    entry the test author assumed, which is exactly the assumption under test.
 *
 * So this file mounts the shipped patch through the real
 * `Loader` + `cordis:include`, with every service provided by its own plugin
 * fiber, and asserts on what actually mounted.
 *
 * Module resolution is the one substitution: the Loader imports rows by package
 * name, and this repository is not installed as `dsh-pstack`. `ResolvingInclude`
 * maps those four names to `src/*.ts`, which Node imports natively at the version
 * this package requires. Everything below that — entry trees, `!!js` evaluation,
 * `inject` gating, service registration — is the real implementation.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { Context } from "@deepseek-ai/cordis";
import Include, { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import Loader from "@deepseek-ai/cordis-plugin-loader";
import { load as parseYaml } from "js-yaml";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";
import { WORKTREE_ROWS } from "../scripts/worktree-mount.ts";
import type { ToolDefinition } from "../src/host-contract.ts";

/** The two official worktree plugins, which the guard looks for by name. */
const OFFICIAL_WORKTREE = "@deepseek-ai/dsh-experimental-worktree";
const OFFICIAL_TOOL_WORKTREE = "@deepseek-ai/dsh-experimental-tool-worktree";

/** The shipped patch layer, parsed with the dialect the Loader reads. */
const PATCH = parseYaml(readFileSync(join(ROOT, "cordis.patch.yml"), "utf8"), {
  schema: entryListSchema,
}) as readonly unknown[];

/** Every row the patch inserts, in file order. */
const ROW_IDS = ["pstack", "pstack-subagent", "pstack-worktree", "pstack-tool-worktree", "pstack-history", "pstack-script"];

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "dsh-pstack-wiring-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A stub row that provides one service and nothing else. */
function providerPlugin(name: string, value: unknown): {
  name: string;
  apply(ctx: Context): void;
} {
  return {
    name: `provider:${name}`,
    apply(ctx: Context) {
      (ctx as unknown as { provide(name: string, value: unknown, check: () => boolean): () => void })
        .provide(name, value, () => true);
    },
  };
}

/** What one assembled composition reported. */
interface Assembly {
  /** Row id plus a `[DISABLED]` marker, per mounted entry. */
  readonly rows: readonly string[];
  /** Tool names the pstack rows registered. */
  readonly tools: readonly string[];
  /** The registered definitions, so a caller can execute them. */
  readonly definitions: ReadonlyMap<string, ToolDefinition>;
  /** Every message the context logged, which is where mount failures appear. */
  readonly logs: readonly string[];
  /** Skill provider factories the `pstack` row registered. */
  readonly providers: readonly unknown[];
  /** Prompt-context contributions registered against `systemPrompt`. */
  readonly contexts: readonly string[];
}

/**
 * Compose one profile and mount the shipped patch on top of it.
 *
 * `profileRows` stands in for the rows a user's own profile already has; the
 * shipped patch is applied after them, exactly as a bundle layer is.
 */
async function assemble(
  profileRows: readonly unknown[],
  options: { readonly sessionQuery?: boolean; readonly systemPrompt?: boolean } = {},
): Promise<Assembly> {
  const directory = temporaryDirectory();
  const profileFile = join(directory, "profile.json");
  writeFileSync(profileFile, JSON.stringify(profileRows, null, 2));

  // The official worktree plugins ship in no profile this repository can assume,
  // and the guard only reads their row `name`. Each stub provides the one service
  // the real package provides, because a second provider for it is what makes
  // Cordis throw at startup.
  const worktreeStub = join(directory, "worktree-stub.mjs");
  writeFileSync(
    worktreeStub,
    'export const name = "stub-worktree";\n' +
      'export function apply(ctx) { ctx.provide("worktrees", { kind: "stub" }, () => true); }\n',
  );
  const toolStub = join(directory, "tool-worktree-stub.mjs");
  writeFileSync(toolStub, 'export const name = "stub-tool-worktree";\nexport function apply() {}\n');

  const modules = new Map<string, string>([
    ["dsh-pstack", join(ROOT, "src/index.ts")],
    ["dsh-pstack/subagent", join(ROOT, "src/subagent.ts")],
    ["dsh-pstack/history", join(ROOT, "src/history.ts")],
    ["dsh-pstack/script", join(ROOT, "src/script.ts")],
    [OFFICIAL_WORKTREE, worktreeStub],
    [OFFICIAL_TOOL_WORKTREE, toolStub],
  ]);

  class ResolvingInclude extends Include {
    override import(name: string, getOuterStack: () => string[]): Promise<unknown> {
      const file = modules.get(name);
      if (file !== undefined) return import(pathToFileURL(file).href);
      return super.import(name, getOuterStack);
    }
  }

  const definitions = new Map<string, ToolDefinition>();
  const logs: string[] = [];
  const providers: unknown[] = [];
  const contexts: string[] = [];
  const ctx = new Context();
  const capture = (...args: unknown[]): void => {
    logs.push(args.map((value) => (value instanceof Error ? `${value.name}: ${value.message}` : String(value))).join(" "));
  };
  (ctx as unknown as { logger: unknown }).logger = {
    info(): void {},
    debug(): void {},
    trace(): void {},
    warn: capture,
    error: capture,
  };

  // One fiber per service, so `inject` gates the way it does in a real profile.
  // A service provided directly on the root context would be visible through the
  // prototype chain and hide the missing-`inject` failure this file exists for.
  ctx.plugin(
    providerPlugin("tools", {
      register(definition: ToolDefinition) {
        definitions.set(definition.name, definition);
        return () => definitions.delete(definition.name);
      },
    }),
  );
  // `pstack` calls `registerProvider`, not `register`. A stub with the wrong method
  // name still satisfies `inject`, and the resulting `TypeError` was not in the
  // `conflicts` filter, so every bundled skill went unregistered while every assertion
  // here passed. The provider count is captured for the same reason.
  ctx.plugin(
    providerPlugin("skills", {
      registerProvider(create: () => unknown) {
        providers.push(create);
        return () => {};
      },
    }),
  );
  ctx.plugin(providerPlugin("subagents", {}));
  ctx.plugin(providerPlugin("llm", {}));
  // `systemPrompt` is optional in this plugin: a tool-only composition still gets
  // every skill and tool, and only loses the placement sentence. Both shapes are
  // exercised, so neither branch can rot.
  if (options.systemPrompt !== false) {
    ctx.plugin(
      providerPlugin("systemPrompt", {
        context(contribution: { name: string }) {
          contexts.push(contribution.name);
          return () => {};
        },
      }),
    );
  }
  // `pstack-script` injects `workingDirectory` to resolve the Session's current
  // directory before spawning; without it the fiber stays inactive.
  ctx.plugin(providerPlugin("workingDirectory", { ensure: async () => directory }));
  // `sessionQuery` is optional on purpose: `pstack-history` must not inject it, so a
  // profile without it still has to register the tool.
  if (options.sessionQuery !== false) {
    ctx.plugin(
      providerPlugin("sessionQuery", {
        observeSession: async () => {
          throw new Error("unused in a wiring test");
        },
        filterSessions: async () => [],
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 80));

  ctx.plugin(Loader, { baseUrl: `${pathToFileURL(directory).href}/` });
  await new Promise((resolve) => setTimeout(resolve, 60));
  (ctx.loader as unknown as { builtins: Record<string, unknown> }).builtins.include = ResolvingInclude;

  // `EntryTree.create` is typed with the app-boot entry options, which do not
  // name `id`; the entry list here is the same shape `cordis.patch.yml` uses.
  const createRoot = ctx.loader.create.bind(ctx.loader) as (options: unknown) => Promise<string>;
  await createRoot({
    id: "root",
    name: "cordis:include",
    config: { path: pathToFileURL(profileFile).href, patches: PATCH },
  });
  await ctx.loader.await();
  // An entry's `init` is awaited by its own fiber after `create` resolves, so one
  // more turn of the event loop is what lets every `apply` finish.
  await new Promise((resolve) => setTimeout(resolve, 600));
  await ctx.loader.await();

  const entry = ctx.loader.resolve("root");
  const rows: string[] = [];
  const walk = (group: { data: readonly { id: string; name: string }[]; tree: { store: Record<string, { disabled?: boolean; subgroup?: unknown }> } }, indent: string): void => {
    for (const options of group.data) {
      const child = group.tree.store[options.id];
      rows.push(`${indent}${options.id}${child?.disabled === true ? " [DISABLED]" : ""}`);
      const subgroup = child?.subgroup as Parameters<typeof walk>[0] | undefined;
      if (subgroup !== undefined) walk(subgroup, `${indent}  `);
    }
  };
  const rootGroup = (entry as unknown as { subgroup?: Parameters<typeof walk>[0] }).subgroup;
  if (rootGroup !== undefined) walk(rootGroup, "");

  return { rows, tools: [...definitions.keys()], definitions, logs, providers, contexts };
}

/**
 * Failures that mean a row did not mount, a service was double-registered, or an
 * `apply` threw.
 *
 * The `TypeError` arm is load-bearing. The `skills` stub once offered `register`
 * instead of `registerProvider`, so the `pstack` row's `apply` threw on every
 * activation while all seven assertions in this file passed: the thrown error was
 * logged but matched none of the earlier patterns. Any `apply`-time exception has to
 * fail here, because a row that throws still appears in `rows`.
 */
function conflicts(logs: readonly string[]): readonly string[] {
  return logs.filter((line) =>
    /has been registered|without inject|Cannot find package|TypeError|is not a function|Error:/.test(line),
  );
}

describe("the shipped patch mounts in a real Cordis composition", () => {
  it("inserts all six rows", async () => {
    const assembly = await assemble([]);
    for (const id of ROW_IDS) {
      expect(assembly.rows.some((row) => row.startsWith(`${id} `) || row === id), id).toBe(true);
    }
  });

  it("registers all three tools the rows provide", async () => {
    const assembly = await assemble([]);
    expect(assembly.tools).toContain("pstack_subagent");
    expect(assembly.tools).toContain("pstack_history");
    // This is the §1 assertion. Without `export const inject` in `src/script.ts`
    // Cordis runs `apply` before the registry exists, the proxy throws, and this
    // name is missing while the other two are present.
    expect(assembly.tools).toContain("pstack_script");
  });

  it("logs no mount failure", async () => {
    const assembly = await assemble([]);
    expect(conflicts(assembly.logs)).toEqual([]);
  });

  it("registers the skill provider, so every bundled skill reaches the catalog", async () => {
    // The `skills` stub once offered `register` instead of `registerProvider`. The
    // row still mounted and the tools still appeared, so nothing failed — but every
    // skill was silently absent. Counting the providers is what makes that visible.
    const assembly = await assemble([]);
    expect(assembly.providers).toHaveLength(1);
    expect(conflicts(assembly.logs)).toEqual([]);
  });

  it("registers the audit placement context against a real prompt registry", async () => {
    const assembly = await assemble([]);
    expect(assembly.contexts).toEqual(["pstack:audit-store"]);
    expect(conflicts(assembly.logs)).toEqual([]);
  });

  it("registers skills and skips the context when the profile has no prompt registry", async () => {
    // `systemPrompt` is not in `inject`, so a tool-only composition must still
    // activate: reading it as a property would throw on every startup here.
    const assembly = await assemble([], { systemPrompt: false });
    expect(assembly.providers).toHaveLength(1);
    expect(assembly.contexts).toEqual([]);
    expect(conflicts(assembly.logs)).toEqual([]);
  });
});

describe("the worktree guard reads the row it is judging", () => {
  it("mounts both rows when the profile has no official worktree", async () => {
    const assembly = await assemble([]);
    for (const row of WORKTREE_ROWS) {
      expect(assembly.rows, row.id).not.toContain(`${row.id} [DISABLED]`);
    }
    expect(conflicts(assembly.logs)).toEqual([]);
  });

  it("disables both rows when the profile already mounts the official one", async () => {
    const assembly = await assemble([
      { id: "worktree", name: OFFICIAL_WORKTREE },
      { id: "tool-worktree", name: OFFICIAL_TOOL_WORKTREE },
    ]);
    for (const row of WORKTREE_ROWS) {
      expect(assembly.rows, row.id).toContain(`${row.id} [DISABLED]`);
    }
    // The service conflict is the failure this scenario exists for: two providers
    // for `worktrees` make Cordis throw during startup.
    expect(conflicts(assembly.logs)).toEqual([]);
  });

  it("still mounts the runtime row when the profile has only the tool row", async () => {
    const assembly = await assemble([{ id: "tool-worktree", name: OFFICIAL_TOOL_WORKTREE }]);
    const runtimeRow = WORKTREE_ROWS.find((row) => row.plugin === OFFICIAL_WORKTREE);
    expect(assembly.rows).not.toContain(`${runtimeRow?.id} [DISABLED]`);
    expect(conflicts(assembly.logs)).toEqual([]);
  });
});

describe("pstack_history survives a profile without sessionQuery", () => {
  it("registers the tool and answers unavailable instead of disappearing", async () => {
    // F19: with `sessionQuery` in `inject`, Cordis keeps the fiber inactive when the
    // service is missing, so the tool never registered and the model saw "no such
    // tool". The `unavailable` branch this module is built around was unreachable
    // outside a hand-built runtime. Now the row registers and the call is honest.
    const assembly = await assemble([], { sessionQuery: false });

    expect(assembly.tools).toContain("pstack_history");
    expect(conflicts(assembly.logs)).toEqual([]);

    const tool = assembly.definitions.get("pstack_history");
    expect(tool).toBeDefined();
    const value = await (tool as { execute(args: unknown, exec: unknown): Promise<unknown> }).execute(
      {},
      {
        name: "pstack_history",
        callId: "c-1",
        arguments: {},
        agent: { id: "s-caller" },
        signal: new AbortController().signal,
        deferContext: () => {},
        concludeTurn: () => {},
      },
    );
    expect((value as { kind: string }).kind).toBe("unavailable");
    expect((value as { code: string }).code).toBe("service-unavailable");
  });
});
