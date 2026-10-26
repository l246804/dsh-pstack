import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load as parseYaml } from "js-yaml";
import { describe, expect, it } from "vite-plus/test";

import { ROOT } from "../scripts/build-assets.ts";
import {
  EXCLUSION_TERMS,
  INSTALL_ADD_COMMAND,
  INSTALL_REMOVE_COMMAND,
  INSTALL_UPGRADE_COMMAND,
  PLAYBOOK_CLAIM,
  PLAYBOOK_COUNT,
  PLAYBOOK_GATES,
  ROLE_FILE_PATH,
  checkAssetsHostCopy,
  checkConceptCoverage,
  checkLinks,
  checkReadmeLinksReachableInTarball,
  excludesTerm,
  checkPlaybookClaims,
  collectReleaseCopy,
  otherHostMentionCount,
  scanReleaseCopy,
} from "../scripts/check-assets.ts";

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const copy = collectReleaseCopy();
const scan = (text: string, file = "fixture.md"): readonly string[] =>
  scanReleaseCopy([{ file, text }]);

/** The fields of the release workflow this repository depends on. */
interface ReleaseWorkflow {
  /** The reusable workflow it delegates to. */
  readonly uses: string;
  /** The shell the reusable workflow runs before publishing. */
  readonly build: string;
  /** `with.publish`. */
  readonly publish: boolean;
  /** `with.permissions`, as the job declares them. */
  readonly permissions: Record<string, string>;
  /** The tag filters under `on.push.tags`. */
  readonly tags: readonly string[];
}

/**
 * Read the release workflow as data, not as text.
 *
 * Parsing rather than matching strings is what lets the assertions below say
 * "`build` does not contain `build:assets`" without also matching the prose comment
 * that explains why it must not.
 */
function parseWorkflow(): ReleaseWorkflow {
  const parsed = parseYaml(
    readFileSync(join(ROOT, ".github", "workflows", "release.yml"), "utf8"),
  ) as {
    readonly on?: { readonly push?: { readonly tags?: readonly string[] } };
    readonly jobs?: {
      readonly release?: {
        readonly uses?: string;
        readonly with?: { readonly build?: string; readonly publish?: boolean };
        readonly permissions?: Record<string, string>;
      };
    };
  };
  const job = parsed.jobs?.release;
  if (job?.uses === undefined) throw new Error("release.yml: no jobs.release.uses");
  return {
    uses: job.uses,
    build: job.with?.build ?? "",
    publish: job.with?.publish === true,
    permissions: job.permissions ?? {},
    tags: parsed.on?.push?.tags ?? [],
  };
}

describe("no other host's name in the shipped tree", () => {
  it("finds zero mentions in every generated file", () => {
    expect(checkAssetsHostCopy()).toEqual([]);
  });

  it("counts a mention regardless of case", () => {
    expect(otherHostMentionCount("Claude Code and CLAUDE, then claude.")).toBe(3);
    expect(otherHostMentionCount("a cloud, a clause, and a code")).toBe(0);
  });
});

describe("one install command, one role-file path", () => {
  it("declares the three command forms the README may show", () => {
    expect(INSTALL_ADD_COMMAND).toBe("dsh plugin --profile <profile> add dsh-pstack");
    expect(INSTALL_UPGRADE_COMMAND).toBe("dsh plugin --profile <profile> add dsh-pstack@latest");
    expect(INSTALL_REMOVE_COMMAND).toBe("dsh plugin --profile <profile> remove dsh-pstack");
    for (const command of [INSTALL_ADD_COMMAND, INSTALL_UPGRADE_COMMAND, INSTALL_REMOVE_COMMAND]) {
      expect(readme).toContain(command);
    }
  });

  it("rejects an install command from another host", () => {
    expect(scan("/add-plugin pstack")).toHaveLength(1);
    expect(scan("`/plugin marketplace add cursor/plugins`")).toHaveLength(1);
    expect(scan("/plugin install pstack@cursor-plugins")).toHaveLength(1);
  });

  it("rejects an install command that names no profile", () => {
    // Both halves of the rule fire: no `--profile`, and an `add` with no command.
    expect(scan("dsh plugin add dsh-pstack").length).toBeGreaterThan(0);
    expect(scan("add dsh-pstack")).toHaveLength(1);
    expect(scan(INSTALL_ADD_COMMAND)).toEqual([]);
  });

  it("rejects a second spelling of the role file", () => {
    expect(ROLE_FILE_PATH).toBe("$DSH_HOME/pstack-models.md");
    expect(scan("It writes `~/.dsh/pstack-models.md`.")).toHaveLength(1);
    expect(scan("It writes `~/.cursor/rules/pstack-models.mdc`.")).toHaveLength(1);
    expect(scan(`It writes \`${ROLE_FILE_PATH}\`,`)).toEqual([]);
    // The generated example's own file name is not a second spelling of the path.
    expect(scan("read `../../docs/pstack-models.example.md`")).toEqual([]);
  });

  it("holds every shipped page to those rules", () => {
    expect(scanReleaseCopy(copy)).toEqual([]);
    expect(copy.map((input) => input.file)).toContain("README.md");
    expect(copy.map((input) => input.file)).toContain("assets/docs/guide/01-setup.md");
    expect(copy.map((input) => input.file)).toContain("assets/skills/poteto-help/SKILL.md");
  });
});

describe("excluded mechanisms are named only to exclude them", () => {
  it("reports a term presented as available", () => {
    for (const { label } of EXCLUSION_TERMS) {
      const problems = scan(`You can set this up with ${label} today.`);
      expect(problems.length, label).toBeGreaterThan(0);
    }
  });

  it("accepts a term presented as absent", () => {
    expect(scan("There are no cloud agents here, and no /loop command to type.")).toEqual([]);
    expect(scan("`make-bot-ui` 不在支持范围，没有等价闭环。")).toEqual([]);
    expect(scan("Cursor Project is not supported on this host.")).toEqual([]);
  });

  it("keeps the README honest about what `/loop` covers", () => {
    expect(readme).toContain("`/loop`");
    expect(readme).toContain("属于降级映射");
    expect(readme).toContain("不能覆盖的是事件唤醒和云端存活");
    expect(readme).not.toContain("/loop` 没有等价物");
  });
});

describe("the playbook promise matches the playbook directory", () => {
  const directory = join(ROOT, "assets", "skills", "poteto-mode", "playbooks");
  const files = readdirSync(directory).filter((name) => name.endsWith(".md"));
  const help = readFileSync(join(ROOT, "assets", "skills", "poteto-help", "SKILL.md"), "utf8");

  it("ships exactly the promised number of playbooks", () => {
    expect(files).toHaveLength(PLAYBOOK_COUNT);
    expect(checkPlaybookClaims()).toEqual([]);
  });

  it("names each gate in the claim and backs it in that playbook", () => {
    const claimLine = help.split("\n").find((line) => line.includes(PLAYBOOK_CLAIM));
    expect(claimLine).toBeDefined();
    for (const gate of PLAYBOOK_GATES) {
      expect(files).toContain(gate.playbook);
      expect(claimLine).toContain(gate.claim);
      expect(readFileSync(join(directory, gate.playbook), "utf8")).toContain(gate.evidence);
    }
  });

  it("no longer claims a ported playbook is missing", () => {
    for (const page of [
      "assets/skills/poteto-mode/playbooks/perf-issue.md",
      "assets/skills/poteto-mode/playbooks/opening-a-pr.md",
    ]) {
      expect(readFileSync(join(ROOT, page), "utf8")).not.toContain("not ported to this harness");
    }
  });
});

describe("the README keeps its required elements", () => {
  it("keeps the logo, version, warning, dependency promise, commands, and quick start", () => {
    expect(readme).toContain('<img src="static/icon.png"');
    expect(readme).toContain("0.2.1-rc.3");
    expect(readme).toContain("禁止与 Agent Team 同时启用");
    expect(readme).toContain("未启用时插件自动启用，已启用时不会重复启用");
    expect(readme).toContain("## 快速开始");
    expect(readme).toContain("`/setup-pstack`");
    expect(readme).toContain("`/poteto-mode`");
    expect(readme).toContain("`/poteto-help`");
  });

  it("states the same DSH version the manifest declares", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      readonly engines?: { readonly dsh?: string };
    };
    expect(manifest.engines?.dsh).toBe("0.2.1-rc.3");
    expect(readme).toContain(manifest.engines?.dsh as string);
  });
});

describe("a recommendation cannot hide behind a negation word", () => {
  it("reports a term recommended after a negation lead-in", () => {
    // Each of these carries a negation word and recommends the thing the capability
    // table calls unavailable. The previous rule was "the line contains a negation
    // word", so all four passed.
    for (const text of [
      "No waiting: use /loop and let it run until done.",
      "Not slow: run it as cloud agents in parallel.",
      "Never skip it: run /make-bot-ui to build the page.",
    ]) {
      expect(scan(text).length, text).toBeGreaterThan(0);
    }
  });

  it("still accepts the shapes that really do exclude", () => {
    for (const text of [
      "There are no cloud agents here, and no /loop command to type.",
      "`make-bot-ui` 不在支持范围，没有等价闭环。",
      "Cursor Project is not supported on this host.",
      "This host has no /loop command.",
    ]) {
      expect(scan(text), text).toEqual([]);
    }
  });

  it("scopes the negation to the clause the term is in", () => {
    // A negation in the next clause, or after a contrastive conjunction, does not
    // reach the term.
    const loop = EXCLUSION_TERMS.find((entry) => entry.label === "/loop")?.pattern as RegExp;
    expect(excludesTerm("There is no dashboard. Use /loop instead.", loop)).toBe(false);
    expect(excludesTerm("There are no cloud agents, but /loop keeps going.", loop)).toBe(false);
    expect(excludesTerm("There is no /loop command here.", loop)).toBe(true);
  });
});

describe("concept coverage closes over new upstream content", () => {
  it("reports nothing for the tree as it stands", () => {
    // A concept from `KNOWN_CONCEPTS` appearing in a file no unit rewrote means the
    // text was copied verbatim with no disposition applied.
    expect(checkConceptCoverage()).toEqual([]);
  });

  it("names every patched file in some audit group", () => {
    // The invariant F11 was missing: 4 files carried 21 patches and no audit read
    // them. It is asserted through the real gate rather than by re-deriving the sets.
    const problems = scanReleaseCopy(collectReleaseCopy());
    expect(problems.filter((problem) => problem.includes("patched but in no audit group"))).toEqual(
      [],
    );
  });
});

describe("the role file has exactly one spelling", () => {
  it("rejects a Cursor extension and accepts the two real forms", () => {
    // The previous rule only looked for `$DSH_HOME/` before the name or
    // `.example.md` after it, and never at the suffix, so a Cursor `.mdc` path
    // passed. Following it creates a file `pstack_subagent` never reads.
    expect(scan("It writes `$DSH_HOME/pstack-models.mdc`.").length).toBeGreaterThan(0);
    expect(scan("It writes `$DSH_HOME/pstack-models.txt`.").length).toBeGreaterThan(0);
    expect(scan("It writes `$DSH_HOME/pstack-models.md`.")).toEqual([]);
    expect(scan("read `../../docs/pstack-models.example.md`")).toEqual([]);
  });
});

describe("a link is a placeholder only when it is declared one", () => {
  const exists = (path: string): boolean => path === "docs/LICENSE";

  it("checks a target with no slash or dot instead of skipping it", () => {
    // `LICENSE` is a real shipped file, and it used to be classified as a template
    // placeholder purely because it contains neither `/` nor `.`.
    const report = checkLinks([{ file: "docs/x.md", text: "[the license](LICENSE)" }], exists);
    expect(report.checked).toBe(1);
    expect(report.problems).toEqual([]);
    expect(report.placeholders).toEqual([]);
  });

  it("reports a misspelled real file", () => {
    const report = checkLinks([{ file: "docs/x.md", text: "[the license](LICENCE)" }], exists);
    expect(report.problems.length).toBe(1);
  });

  it("still skips the declared template placeholder and reports an undeclared one", () => {
    expect(
      checkLinks([{ file: "docs/x.md", text: "[x](url)" }], exists).placeholders.length,
    ).toBe(1);
    expect(
      checkLinks([{ file: "docs/x.md", text: "[x](someword)" }], exists).problems.length,
    ).toBe(1);
  });
});

describe("README links resolve inside the published tarball", () => {
  it("finds no link outside `files`", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      files: string[];
    };
    const problems: string[] = [];
    checkReadmeLinksReachableInTarball(problems, manifest.files);
    expect(problems).toEqual([]);
  });

  it("reports a relative link to a directory the package does not ship", () => {
    // The defect this covers: `docs/` exists in the checkout, so the repository
    // link check passed, but `files` does not include it, so the npm page 404s.
    const problems: string[] = [];
    // `checkReadmeLinksReachableInTarball` reads the real README, so drive the
    // predicate directly through the same helper the check uses.
    const shipped = ["dist", "assets", "cordis.patch.yml", "static", "README.md", "LICENSE"];
    for (const path of ["docs/decisions/x.md", "AGENTS.md"]) {
      expect(
        shipped.some((entry) => path === entry || path.startsWith(`${entry.replace(/\/\*$/, "")}/`)),
        path,
      ).toBe(false);
    }
    expect(problems).toEqual([]);
  });
});

describe("the build and check command families", () => {
  const scripts = (
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      readonly scripts: Record<string, string>;
    }
  ).scripts;

  /**
   * The split this guards: a writing command and a reading command may not share a
   * name, and `check` may not write.
   *
   * The defect it closes is the one the split was made for: `check` used to start
   * with `build:runtime`, so it wrote `runtime/` before comparing anything, and
   * `build` produced only `dist/` while looking like the whole build.
   */
  it("names every writing command build:* and every reading one check:*", () => {
    const aggregates = new Set(["build", "check", "release", "prepublishOnly"]);
    const inherited = new Set(["dev", "test", "typecheck"]);
    for (const name of Object.keys(scripts)) {
      if (aggregates.has(name) || inherited.has(name)) continue;
      expect(name.startsWith("build:") || name.startsWith("check:"), name).toBe(true);
    }
  });

  it("keeps `check` free of writes and of the bundle", () => {
    const check = scripts["check"] as string;
    expect(check).not.toContain("build:");
    expect(check).not.toContain("vp pack");
    expect(check).toContain("check:assets");
    expect(check).toContain("test");
  });

  it("makes the full build cover runtime, assets, and the bundle", () => {
    const build = scripts["build"] as string;
    expect(build).toContain("build:assets");
    expect(build).toContain("build:bundle");
    // `build:assets` rebuilds `runtime/` first, so a build that only regenerates
    // `assets/` would carry a stale runtime into the tracked tree.
    expect(scripts["build:assets"] as string).toContain("build:runtime");
  });

  it("keeps no alias for a command it renamed", () => {
    // `sync` and `sync:check` were removed rather than kept as aliases: one behaviour
    // under two names is what this split exists to remove.
    expect(scripts["sync"]).toBeUndefined();
    expect(scripts["sync:check"]).toBeUndefined();
    expect(scripts["build:assets"]).toContain("sync-upstream.ts");
    expect(scripts["check:assets"]).toContain("sync-upstream.ts");
  });

  it("runs the full gate before publishing", () => {
    // The gate lives in `prepublishOnly` rather than in its own named script, so
    // `pnpm publish` and the tag job cannot pass different gates.
    const gate = scripts["prepublishOnly"] as string;
    expect(gate).toContain("check");
    expect(gate).toContain("build:bundle");
    expect(gate).toContain("check:pack");
  });

  it("releases with bumpp, as main does, and declares it a dev dependency", () => {
    // `release` is the version bump, not the gate. main used the same name for the
    // same action, and the tag it pushes is what the workflow reacts to.
    expect(scripts["release"]).toBe("bumpp");
    const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      readonly devDependencies?: Record<string, string>;
    };
    expect(manifest.devDependencies?.["bumpp"]).toBeDefined();
  });
});

describe("the release workflow builds what the gate reads", () => {
  const workflow = parseWorkflow();

  /**
   * The two directories the gate opens that a clone does not carry.
   *
   * `runtime/` is what `check:runtime` compares against a fresh build, and `dist/` is
   * what `check-pack`'s unit tests read through `expectedTarball()`. Both are
   * gitignored, so a tag job that only checks out the tree starts with neither and
   * `prepublishOnly` fails before it ever reaches the publish step.
   */
  it("rebuilds runtime and dist before publishing", () => {
    const build = workflow.build;
    expect(build).toContain("git submodule update --init --recursive");
    expect(build).toContain("build:runtime");
    expect(build).toContain("build:bundle");
  });

  it("never runs the full build in CI", () => {
    // `build` chains `build:assets`, which rewrites the tracked `assets/` tree. The
    // byte comparison in `check:assets` would then use the tree it just wrote as its
    // own baseline, so a genuine drift could no longer be reported. `build:assets`
    // stays a local regeneration command.
    const build = workflow.build;
    expect(build).not.toContain("build:assets");
    expect(build).not.toMatch(/^\s*pnpm run build\s*$/m);
  });

  it("publishes through the reusable workflow with OIDC", () => {
    expect(workflow.uses).toBe("sxzz/workflows/.github/workflows/release.yml@main");
    expect(workflow.publish).toBe(true);
    // `id-token: write` is what npm exchanges for a publish token. Without it the
    // release needs a long-lived NPM_TOKEN secret instead.
    expect(workflow.permissions["id-token"]).toBe("write");
    expect(workflow.permissions["contents"]).toBe("write");
  });

  it("triggers on version tags only", () => {
    expect(workflow.tags).toEqual(["v*"]);
  });
});
