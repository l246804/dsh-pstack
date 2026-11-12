import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const directory = "skills/authored/docs-drift";
const english = readFileSync(`${directory}/SKILL.md`, "utf8");
const chinese = readFileSync(`${directory}/SKILL.zh.md`, "utf8");

function sections(source: string): string[] {
  return source.match(/^## .+$/gm) ?? [];
}

function count(source: string, pattern: RegExp): number {
  return (source.match(pattern) ?? []).length;
}

describe("docs-drift skill contract", () => {
  it.each([
    [
      "English",
      english,
      [
        "Checked claims | Findings | Unverified",
        "read-only Git status",
        "constructors and their callers",
        "**Examples and temporary inventories.**",
        "**Repeated concepts and authority.**",
        "**Environment, dependencies, and plugins.**",
        "**Terminology and language variants.**",
        "Disposition: repairable | needs-user-decision | unverified",
        "every claim ID and location",
        "Label every hunk with its finding IDs",
        "exact unified diff",
        "Request explicit approval and wait.",
        "A current-behavior claim contradicted by implementation always produces a Finding",
        "audit incomplete",
        "block-backed not-applicable reason",
        "named consumer or test as evidence",
      ],
    ],
    [
      "Chinese",
      chinese,
      [
        "已检查 claim 数 | 发现数 | 未核验数",
        "只读 Git status",
        "构造函数及其调用方",
        "**示例与临时清单。**",
        "**重复概念与权威。**",
        "**环境、依赖与插件。**",
        "**术语与语言版本。**",
        "处置：repairable | needs-user-decision | unverified",
        "每项 claim 的 ID 和位置",
        "为每个 hunk 标注 finding ID",
        "精确 unified diff",
        "请求明确批准并等待。",
        "当前行为 claim 与实现冲突时必须产生 Finding",
        "audit incomplete",
        "有块索引依据的不适用原因",
        "指明消费者或测试作为证据",
      ],
    ],
  ])("requires evidence-backed coverage in the %s instructions", (_language, source, required) => {
    expect(source).toMatch(
      /^---\nname: docs-drift\ndescription: .+\ndisable-model-invocation: true\n---/,
    );
    expect(source).toContain("DocumentCoverage");
    expect(source).toMatch(/\*\*Claim[：:]\*\*/);
    expect(source).toMatch(/\*\*Finding[：:]\*\*/);
    expect(source).toMatch(/\*\*(Implementation coupling|实现耦合)[。.]\*\*/);
    for (const text of required) expect(source).toContain(text);
  });

  it("keeps the language versions structurally aligned", () => {
    const expectedHeadings = [
      ["## Choose the mode", "## 选择模式"],
      ["## 1. Discover the maintained documents", "## 1. 发现维护中的文档"],
      ["## 2. Inventory and verify every claim", "## 2. 盘点并核验每项 claim"],
      ["## 3. Apply every check", "## 3. 执行全部检查"],
      ["## 4. Resolve authority and classify findings", "## 4. 判定权威并分类发现"],
      ["## 5. Report", "## 5. 报告"],
      ["## 6. Approve and repair", "## 6. 批准并修复"],
      ["## 7. Verify and close", "## 7. 核验并收尾"],
    ];
    expect(sections(english)).toEqual(expectedHeadings.map(([heading]) => heading));
    expect(sections(chinese)).toEqual(expectedHeadings.map(([, heading]) => heading));
    expect(count(english, /^- \*\*/gm)).toBe(count(chinese, /^- \*\*/gm));
    expect(count(english, /^```/gm)).toBe(count(chinese, /^```/gm));
    for (const [englishCheck, chineseCheck] of [
      ["**Paths, trees, commands, links, and pointers.**", "**路径、目录树、命令、链接与指针。**"],
      ["**Implementation coupling.**", "**实现耦合。**"],
      ["**Examples and temporary inventories.**", "**示例与临时清单。**"],
      ["**Repeated concepts and authority.**", "**重复概念与权威。**"],
      ["**Environment, dependencies, and plugins.**", "**环境、依赖与插件。**"],
      ["**Terminology and language variants.**", "**术语与语言版本。**"],
      ["**Unsupported elaboration.**", "**无依据扩写。**"],
    ]) {
      expect(english).toContain(englishCheck);
      expect(chinese).toContain(chineseCheck);
    }
  });

  it("keeps the installed skill and its lock hash synchronized with the source", () => {
    const hash = createHash("sha256");
    for (const file of readdirSync(directory).sort()) {
      const source = readFileSync(`${directory}/${file}`);
      expect(readFileSync(`.agents/skills/docs-drift/${file}`)).toEqual(source);
      hash.update(file);
      hash.update(source);
    }
    const lock = JSON.parse(readFileSync("skills-lock.json", "utf8")) as {
      skills: { "docs-drift": { computedHash: string } };
    };
    expect(lock.skills["docs-drift"].computedHash).toBe(hash.digest("hex"));
  });
});
