/**
 * Guards selected facts this repository mirrors from the installed DSH tools.
 *
 * The wrapped tools are reimplemented rather than imported. Their packages
 * export a plugin `apply` and a config schema, not a tool factory, so the type
 * checker cannot see every model-facing change. These checks cover the facts
 * asserted below; the remaining upgrade review is manual.
 *
 * The ledgers below are the data half of `src/docs/dsh-tool-adapters.md`. Read
 * that file for what may differ and why; this file holds the current rows.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { ToolArgsError } from "@deepseek-ai/dsh-tools";

import {
  AGENT_KINDS,
  normalizeConfig,
  parseControlArgs,
  parseDelegationArgs,
} from "../subagent.ts";
const DELEGATION = "@deepseek-ai/dsh-tool-subagent";
const CONTROL = "@deepseek-ai/dsh-tool-subagent-control";

function packageFile(name: string, file: string): string {
  return readFileSync(join("node_modules", name, file), "utf8");
}

function installedVersion(name: string): string {
  const manifest = JSON.parse(packageFile(name, "package.json")) as { version?: string };
  if (manifest.version === undefined) throw new Error(`${name} has no version`);
  return manifest.version;
}

/** The exact pin this repository declares for one package, from the workspace catalog. */
function catalogPin(name: string): string {
  const prefix = `"${name}":`;
  const line = readFileSync("pnpm-workspace.yaml", "utf8")
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.startsWith(prefix));
  if (line === undefined) throw new Error(`${name} has no catalog pin`);
  return line.slice(prefix.length).trim();
}

/** Field names declared directly on one `interface Config` block. */
function configFields(name: string, file: string): string[] {
  const text = packageFile(name, file);
  const start = text.indexOf("export interface Config");
  if (start < 0) throw new Error(`${name} ${file} has no Config interface`);
  const body = text.slice(start, text.indexOf("\n}", start));
  return [...body.matchAll(/^\s{4}([A-Za-z]+)\??:/gm)].map((match) => match[1]!);
}

/** One deliberate difference between a wrapped tool and the native one. */
interface Divergence {
  /** The input whose handling differs. */
  readonly topic: string;
  /** What the native tool does. */
  readonly native: string;
  /** What this repository does instead. */
  readonly ours: string;
  /** Why the difference earns its place. */
  readonly reason: string;
  /** Fails when this repository drifts away from the declared behaviour. */
  readonly check: () => void;
}

const DIVERGENCES: readonly Divergence[] = [
  {
    topic: "model route authorization",
    native: "explicit model selection follows the Host subagent-model-selection policy",
    ours: "provider/model/effort are preflighted and passed directly to the activation",
    reason:
      "Role-based workflows need cross-route delegation without a separate global Host setting; see the plugin-owned-delegation-authority decision.",
    check: () => {
      // planDelegation and startChild route forwarding are covered in subagent.test.ts.
      // Whether the Host still leaves authorization to the tool is an upgrade review.
      expect(
        parseDelegationArgs({
          description: "review",
          prompt: "Review this change",
          provider: "other-provider",
          model: "other-model",
          reasoning_effort: "high",
        }),
      ).toMatchObject({
        provider: "other-provider",
        model: "other-model",
        reasoningEffort: "high",
      });
    },
  },
  {
    topic: "agent preset selection",
    native: "agent_preset is exposed only when deployment config supplies a preset allowlist",
    ours: "the fixed pstack presets are always selectable; general inherits the parent preset",
    reason:
      "The bundle owns these child compositions, including the poteto delegate brief and read-only sandbox.",
    check: () => {
      for (const preset of AGENT_KINDS) {
        expect(
          parseDelegationArgs({ description: "review", prompt: "Review", agent_preset: preset })
            .agent,
        ).toBe(preset);
      }
      expect(() =>
        parseDelegationArgs({ description: "review", prompt: "Review", agent_preset: "custom" }),
      ).toThrow(ToolArgsError);
    },
  },
  {
    topic: "maxDepth",
    native: "accepts a number or 'provider-managed', and omission reads the Host depth setting",
    ours: "accepts a positive integer or null, with a per-call cap bounded by the row and Host limit; 'provider-managed' is rejected",
    reason:
      "pstack rows configure a numeric cap. 'provider-managed' exists for out-of-process providers that own their recursion budget, which this bundle does not target.",
    check: () => {
      expect(() => normalizeConfig({ provider: "spawn", maxDepth: "provider-managed" })).toThrow(
        /maxDepth/,
      );
      expect(normalizeConfig({ provider: "spawn", maxDepth: 2 }).maxDepth).toBe(2);
    },
  },
];

describe("mirrored DSH tool facts", () => {
  it("pins each wrapped tool to the installed version", () => {
    for (const name of [DELEGATION, CONTROL]) {
      expect(catalogPin(name)).toBe(installedVersion(name));
    }
  });

  it("keeps the delegation config fields this bundle mirrors", () => {
    const fields = configFields(DELEGATION, "lib/types/index.d.ts");
    for (const field of ["provider", "toolName", "modelSelection", "modelDiscovery", "maxDepth"]) {
      expect(fields).toContain(field);
    }
  });

  it("keeps the native agent preset allowlist declaration", () => {
    const preset = packageFile(DELEGATION, "lib/types/preset-selection.d.ts");
    expect(preset).toContain("allowedAgentPresets?: string[] | undefined");
  });

  it("keeps the native delegation tool free of a directory argument", () => {
    // 0.2.2-rc.3 removed it; the adapter's no-directory rule and its Task row
    // both rest on this staying true.
    expect(packageFile(DELEGATION, "src/index.ts")).not.toContain("cwd");
  });

  it("keeps the native interrupt registration and its plugin default", () => {
    expect(packageFile(CONTROL, "lib/types/index.d.ts")).toContain("Defaults to true");
    expect(packageFile(CONTROL, "src/index.ts")).toContain("interrupt_agent");
  });
});

describe("declared tool divergences", () => {
  it("records a reason for every difference", () => {
    for (const divergence of DIVERGENCES) {
      expect(divergence.reason.trim()).not.toBe("");
      expect(divergence.native.trim()).not.toBe("");
      expect(divergence.ours.trim()).not.toBe("");
    }
  });

  it.each(DIVERGENCES)("holds the $topic difference", ({ check }) => {
    check();
  });

  it("passes the caller's task text through unedited", () => {
    // The native tool reads the strings as given; trimming here would change
    // what the child receives.
    const args = parseDelegationArgs({ prompt: "  keep leading spaces", description: "probe" });
    expect(args.prompt).toBe("  keep leading spaces");
  });

  it("reports a bad argument on the runtime's argument channel", () => {
    // The runtime renders ToolArgsError as a correctable mistake and a plain
    // Error as a tool failure, so the two send the model down different paths.
    expect(() => parseDelegationArgs({ prompt: "p" })).toThrow(ToolArgsError);
    expect(() => parseDelegationArgs({ description: "d", prompt: "p", model: "m" })).toThrow(
      ToolArgsError,
    );
    expect(() => parseControlArgs({}, ["agent"])).toThrow(ToolArgsError);
    expect(() => parseControlArgs({ agent: "" }, ["agent"])).toThrow(ToolArgsError);
    expect(() => parseControlArgs({ nope: "x" }, ["agent"])).toThrow(ToolArgsError);
  });
});
