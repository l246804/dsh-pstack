import type { BehaviorScenario } from "../types.ts";

export const principleOutcomeOrientedExecution: BehaviorScenario = {
  type: "behavior",
  id: "principle-outcome-oriented-execution-apply",
  skill: "principle-outcome-oriented-execution",
  turns: [
    {
      prompt:
        "data.ts 现在是 callback 风格。我们要把它迁移到 async/await，分三步。为了每一步都能随时回滚，我打算每个阶段都保留一层 callback 兼容包装，最后一步再统一删掉。这个迁移计划怎么样？",
    },
  ],
  workspace: {
    files: {
      "data.ts":
        "export function getUser(\n  id: string,\n  cb: (err: Error | null, user?: { id: string }) => void,\n): void {\n  setTimeout(() => cb(null, { id }), 0);\n}\n\nexport function saveUser(\n  user: { id: string },\n  cb: (err: Error | null) => void,\n): void {\n  setTimeout(() => cb(null), 0);\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "兼容" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：指出每一阶段都保留 callback 兼容包装会沉淀成一次性兼容债，主张向目标架构（纯 async/await）收敛，只在计划好的、可回滚的范围内接受中间破损，并在明确边界做完整静态与运行时验证；不是复述技能名字。只喊口号或照单接受逐阶段兼容层记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对迁移计划的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-outcome-oriented-execution/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
