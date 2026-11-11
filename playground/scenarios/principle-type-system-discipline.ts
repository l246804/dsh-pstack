import type { BehaviorScenario } from "../types.ts";

export const principleTypeSystemDiscipline: BehaviorScenario = {
  type: "behavior",
  id: "principle-type-system-discipline-apply",
  skill: "principle-type-system-discipline",
  turns: [
    {
      prompt:
        "order.ts 里 createRefund(orderId: string, userId: string, status: string) 这个签名，status 其实只会是 'pending' 或 'paid'，orderId 和 userId 也都是字符串。帮我审视一下签名怎么改。",
    },
  ],
  workspace: {
    files: {
      "order.ts":
        'export function createRefund(\n  orderId: string,\n  userId: string,\n  status: string,\n) {\n  if (status !== "pending" && status !== "paid") {\n    throw new Error("bad status");\n  }\n  return { orderId, userId, status };\n}\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "联合" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：把 status: string 收紧成字面量联合类型 'pending' | 'paid' 让非法状态无法表示，并用品牌类型（branded type）区分 orderId 与 userId 这两个底层同为 string 但语义不同的原语，外部入参在边界处解析一次；不是复述技能名字。只喊口号或只把 string 改成枚举而不提品牌/边界记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对函数签名的类型收紧判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-type-system-discipline/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
