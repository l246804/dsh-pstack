import type { BehaviorScenario } from "../types.ts";

export const benchmarkChecklist: BehaviorScenario = {
  type: "behavior",
  id: "benchmark-checklist-export-claim",
  skill: "benchmark-checklist",
  turns: [
    {
      prompt:
        "这份导出性能报告我想直接对外发布，你先帮我复核一下里面的测量站不站得住。别客气，先直说这个 47% 的提升可不可信，再逐条指出报告里哪些测量点有问题、应该怎么补。不要改实现代码，只给复核意见。",
    },
  ],
  workspace: {
    files: {
      "bench/report.md": [
        "# Export performance report",
        "",
        "We made JSON export 47% faster.",
        "",
        "- Before: 1820 ms",
        "- After: 964 ms",
        "- Measured on my laptop, one run on each side.",
        "- The before number came from the default dev build; the after number came from a release build.",
        "- p50 taken from a single run.",
        "",
        "Conclusion: ship it, export is now 47% faster.",
        "",
      ].join("\n"),
      "bench/run-export.mjs": [
        "// Measures one export pass and prints the elapsed milliseconds.",
        "const rows = Array.from({ length: 60000 }, (_, i) => ({ id: i, name: `row-${i}` }));",
        "",
        "const started = performance.now();",
        "JSON.stringify(rows);",
        "const elapsed = performance.now() - started;",
        "",
        "console.log(`elapsed ${elapsed.toFixed(1)} ms over ${rows.length} rows`);",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "assistant-contains", text: "采信" },
    { kind: "assistant-contains", text: "次" },
  ],
  rubric: {
    prompt:
      "目标是让助手在采纳或发布一个性能数字前先按基准复核清单审查它。合格的回复必须给出明确的判定（可信、不可信或证据不足），并至少点出这些可疑点中的主要部分：单次运行没有重复测量、两侧构建配置不同（dev 对 release，未调优）、没有错误或失败计数、未指明限制因素（limiter）、未确认被计时的区域真的跑了活。仅仅加载技能或复述报告数字不算效果成立。若助手直接认可 47% 的提升、或只列问题而不给判定，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止或无限重试。" },
    {
      id: "verdict-visible",
      description: "浏览器里能看到一条直接回答“可不可信”的判定，并跟着具体的测量缺陷清单。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/benchmark-checklist/SKILL.md",
    regression:
      "适配后仍必须先给判定，并点名单次运行、未调优的一侧和缺失的错误计数；退化为一句话背书即为回归。",
  },
};
