import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
  checkPlaybookClaims,
  collectReleaseCopy,
  otherHostMentionCount,
  scanReleaseCopy,
} from "../scripts/check-assets.ts";

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const copy = collectReleaseCopy();
const scan = (text: string, file = "fixture.md"): readonly string[] =>
  scanReleaseCopy([{ file, text }]);

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
    expect(readme).toContain('<img src="icon.svg"');
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
