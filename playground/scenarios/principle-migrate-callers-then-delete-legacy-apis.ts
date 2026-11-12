import type { BehaviorScenario } from "../types.ts";

export const principleMigrateCallersThenDeleteLegacyApis: BehaviorScenario = {
  type: "behavior",
  id: "principle-migrate-callers-then-delete-legacy-apis-apply",
  skill: "principle-migrate-callers-then-delete-legacy-apis",
  turns: [
    {
      prompt:
        "utils.ts 里的 formatDateV1 被 report.ts 和 invoice.ts 调用。我想新增一版 formatDate 重写日期格式化逻辑，同时把 formatDateV1 保留成兼容层，这样两个调用方都不用动。就按这个思路改吧。",
    },
  ],
  workspace: {
    files: {
      "utils.ts":
        "export function formatDateV1(d: Date): string {\n  return d.toISOString().slice(0, 10);\n}\n",
      "report.ts":
        'import { formatDateV1 } from "./utils.ts";\n\nexport function reportLine(d: Date): string {\n  return `report ${formatDateV1(d)}`;\n}\n',
      "invoice.ts":
        'import { formatDateV1 } from "./utils.ts";\n\nexport function invoiceLine(d: Date): string {\n  return `invoice ${formatDateV1(d)}`;\n}\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "删" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：指出没有外部依赖时不应把 formatDateV1 留成兼容层，而是在同一轮把 report.ts 与 invoice.ts 两个调用方迁移到新 API 后删除旧函数；不是复述技能名字。只喊口号或仍保留兼容层记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对兼容层请求的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
