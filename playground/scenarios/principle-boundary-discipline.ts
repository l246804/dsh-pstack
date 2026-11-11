import type { BehaviorScenario } from "../types.ts";

export const boundaryDisciplineApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-boundary-discipline-apply",
  skill: "principle-boundary-discipline",
  turns: [
    {
      prompt:
        "我们要新增一个从外部 CSV 导入订单的入口。CSV 来自第三方，字段可能缺失、金额可能不是数字。我打算在订单金额计算、折扣计算、格式化这几个函数里都各加一遍字段校验，确保不会出错。你怎么设计这些校验和错误处理，让代码既安全又好维护？",
    },
  ],
  workspace: {
    files: {
      "src/order.ts":
        "export interface Order {\n  id: string;\n  amount: number;\n}\n\nexport function total(order: Order): number {\n  return order.amount;\n}\n",
      "src/import.ts": "// 外部 CSV 导入入口，待实现\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "边界" }],
  rubric: {
    prompt:
      "回复应在系统边界（CSV 解析入口）一次性校验并把原始数据解析成带类型的领域对象，内部计算与格式化作为纯函数信任类型、不再重复校验。把校验分散到业务函数里、或只在业务层做防御，记 gap。只复述原则名字不给具体边界设计，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description:
        "浏览器中能看到完整回复，回复指出校验应集中在 CSV 导入边界，业务逻辑保持纯函数。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-boundary-discipline/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
