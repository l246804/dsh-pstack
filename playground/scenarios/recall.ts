import type { BehaviorScenario } from "../types.ts";

export const recallDegradedNoHistory: BehaviorScenario = {
  type: "behavior",
  id: "recall-degraded-no-history",
  skill: "recall",
  turns: [
    {
      prompt: "帮我回顾一下之前关于这个项目的工作，我上次做到哪了？接下来该做什么？",
    },
  ],
  workspace: {
    files: {
      "README.md":
        "# billing-service\n\n账单服务。当前正在做『按用量分层计价』，基础调用链已经通了，边界与退款逻辑还没处理。\n",
      "NOTES.md":
        "# 进度笔记\n\n- 已完成：计价核心函数与单元测试\n- 进行中：月度账单汇总\n- 未开始：退款、优惠券\n- 已知问题：并发写入同一账单时会丢更新\n",
      "src/pricing.js":
        "export function priceByUsage(units) {\n  return units <= 100 ? units * 1 : 100 + (units - 100) * 0.8;\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "历史" }],
  rubric: {
    prompt:
      "这是会话历史检索类技能（recall）。该环境没有可用的历史检索插件（DSH 的 session-search 为可选且默认关闭），且是全新会话。效果成立的标志：助手明确说明无法访问此前的对话历史或检索能力不可用，同时基于当前工作区给出可用的当前状态简报（正在做什么、已完成/进行中/未开始、已知问题、下一步建议），而不是假装检索到历史、编造过去对话内容，或直接报错中断。若声称查到了过去历史却无依据、或只说『无法回顾』却不给任何基于工作区的简报，记 gap。是否加载技能是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "completed-turn",
      description: "会话自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到明确说明历史不可用、并基于工作区给出当前状态简报的完整回复。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/recall/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
};
