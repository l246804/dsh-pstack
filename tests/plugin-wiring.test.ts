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
}

/**
 * Compose one profile and mount the shipped patch on top of it.
 *
 * `profileRows` stands in for the rows a user's own profile already has; the
 * shipped patch is applied after them, exactly as a bundle layer is.
 */
async function assemble(profileRows: readonly unknown[]): Promise<Assembly> {
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
  ctx.plugin(providerPlugin("skills", { register: () => () => {} }));
  ctx.plugin(providerPlugin("subagents", {}));
  ctx.plugin(providerPlugin("llm", {}));
  ctx.plugin(
    providerPlugin("sessionQuery", {
      observeSession: async () => {
        throw new Error("unused in a wiring test");
      },
      filterSessions: async () => [],
    }),
  );
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

  return { rows, tools: [...definitions.keys()], definitions, logs };
}

/** Failures that mean a row did not mount or a service was double-registered. */
function conflicts(logs: readonly string[]): readonly string[] {
  return logs.filter((line) => /has been registered|without inject|Cannot find package/.test(line));
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
