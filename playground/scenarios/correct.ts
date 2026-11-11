import type { BehaviorScenario } from "../types.ts";

export const correct: BehaviorScenario = {
  type: "behavior",
  id: "correct-console-log-repeat",
  skill: "correct",
  turns: [
    {
      prompt:
        "这个仓库里的 agent 老是重复同一个错误，每次都改完下次又犯，历史记录在 history.md 里。帮我从根上解决，让以后不会再犯，并把用了什么机制挡住它、以及为什么选这一层说清楚。",
    },
  ],
  workspace: {
    files: {
      "AGENTS.md": [
        "# Agent instructions",
        "",
        "## Rules",
        "",
        "| Rule | Enforced by |",
        "| ---- | ----------- |",
        "| (none yet) | |",
        "",
      ].join("\n"),
      "history.md": [
        "# Correction history",
        "",
        "- 2026-10-02: Operator corrected an agent for using console.log in shipped code and told it to use the shared logger.",
        "- 2026-10-19: Operator corrected another agent for the same console.log mistake in a different file, again asking for the logger. The instruction existed once but nothing enforced it.",
        "- A no-console lint rule was discussed but never added.",
        "",
      ].join("\n"),
      "src/format.ts": [
        "export function formatAmount(cents) {",
        '  console.log("formatting amount", cents);',
        "  return (cents / 100).toFixed(2);",
        "}",
        "",
      ].join("\n"),
      "src/report.ts": [
        'import { formatAmount } from "./format.js";',
        "",
        "export function reportLine(cents) {",
        '  console.log("building report line");',
        '  return "total: " + formatAmount(cents);',
        "}",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "AGENTS.md", text: "logger" },
    { kind: "artifact-contains", path: "AGENTS.md", text: "no-console" },
    { kind: "assistant-contains", text: "规则" },
  ],
  rubric: {
    prompt:
      "目标是把反复出现的纠错变成让下一个 agent 犯不了的机制。合格结果要：从 history.md 归纳出错误类（在发布代码里用 console.log，已重复两次），在最高可行的层级修复（此类错误应先尝试架构/类型，行不通则用一条错误信息点名替代写法 logger 的 lint/CI 检查），并把“规则 + 由什么执行”配对写进 AGENTS.md 的规则表。回复要说明失败类和所选层级、以及为什么更高层级不可行。只加载技能、或只在回复里再叮嘱一遍“不要用 console.log”而没有执行机制，不算效果成立。若 AGENTS.md 没有出现规则与执行机制的配对，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "rule-table-visible",
      description:
        "工作区能看到 AGENTS.md 规则表新增了“用 logger、由 no-console 检查执行”这类配对，且新增了相应检查。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/correct/SKILL.md",
    regression:
      "适配后仍必须把重复错误升成“规则 + 执行机制”的配对写进 AGENTS.md 并说明层级取舍；只重复叮嘱而无执行机制即为回归。",
  },
};
