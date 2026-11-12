import type { BehaviorScenario } from "../types.ts";

export const technicalWriting: BehaviorScenario = {
  type: "behavior",
  id: "technical-writing-budget-doc",
  skill: "technical-writing",
  turns: [
    {
      prompt:
        "docs/proto-budget.md 又乱又长，教程、参考和解释全混在一起，读起来很累。帮我按好的技术文档标准重写，必要时拆成不同模式的文档再互相链接，但技术命名和数字都不要改。",
    },
  ],
  workspace: {
    files: {
      "docs/proto-budget.md": [
        "# Proto Import Budget Configuration And Usage Guide",
        "",
        "The purpose of this document is to facilitate the configuration of the proto import ratchet budget script parameters, which is performed via budget.json. It is important to note that budget.mjs works by counting the files that import protos, and if the count exceeds the budget then CI will fail. In order to lower the budget you should run budget.mjs with the --write flag, which updates the committed budget to reflect the current count: this should only be done when lowering it.",
        "",
        "## Getting Started",
        "",
        "First we need to understand that the whole thing is basically just a number that lives in budget.json, and the number is 42 by default, and so when the count goes above 42 the build fails, and you can see this in the CI logs that are produced by the pipeline when it runs.",
        "",
        "## Reference Options",
        "",
        "--write : writes the committed budget.",
        "--check : checks the current count against the budget.",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "docs/proto-budget.md", text: "budget" },
    { kind: "assistant-contains", text: "文档" },
  ],
  rubric: {
    prompt:
      "目标是把一份模式混乱的文档按技术写作标准重写。合格结果要：为单个文档选定一种 Diátaxis 模式（或在拆分时每份文档只有一种模式并用链接衔接），句子面向读者、主动语态、命令式说明、条件先于指令，去掉“It is important to note”这类空话和冗长句，标题为句首大写并承载要点，且保留真实符号与数字（budget.mjs、budget.json、默认 42、CI 失败条件、--write 只用于下调预算）。只加载技能、或只做措辞微调而结构仍混乱，不算效果成立。若重写后符号或数字被改动、或仍把教程与参考混在一份文档里，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "rewritten-doc-visible",
      description: "浏览器或工作区能看到按模式组织、标题清晰的重写结果，而不是原文照抄。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/technical-writing/SKILL.md",
    regression:
      "适配后重写结果仍要保持选定的单一 Diátaxis 模式、保留 budget.mjs / budget.json / 42 等真实符号与数字；退回成原文式混排即为回归。",
  },
};
