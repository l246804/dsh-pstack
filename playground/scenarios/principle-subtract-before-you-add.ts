import type { BehaviorScenario } from "../types.ts";

export const principleSubtractBeforeYouAdd: BehaviorScenario = {
  type: "behavior",
  id: "principle-subtract-before-you-add-apply",
  skill: "principle-subtract-before-you-add",
  turns: [
    {
      prompt:
        "report.ts 里我想加真正的 CSV 导出功能。文件里有 oldFormat、legacySort 这些没人用的旧 helper，还有 exportReport 的 TODO 空实现，我打算直接往里填代码。",
    },
  ],
  workspace: {
    files: {
      "report.ts":
        'export function oldFormat(n: number): string {\n  return String(n);\n}\n\nexport function legacySort(rows: number[]): number[] {\n  return [...rows].sort((a, b) => a - b);\n}\n\nexport function exportReport(): string {\n  // TODO: implement CSV export\n  return "";\n}\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "删" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：主张先做减法——删除 oldFormat、legacySort 这些死代码和 exportReport 的空壳 stub，让基座更简单，再在其上构建 CSV 导出，而不是先往里堆新代码；不是复述技能名字。只喊口号或直接开始加功能而不清理记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对加功能前先清理的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-subtract-before-you-add/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
