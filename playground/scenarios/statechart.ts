import type { BehaviorScenario } from "../types.ts";

export const statechartOrderShipRule: BehaviorScenario = {
  type: "behavior",
  id: "statechart-order-ship-rule",
  skill: "statechart",
  turns: [
    {
      prompt:
        "这是我们的订单状态流转，业务规则是『只有已付款的订单才能发货』。请把这个流转当成状态模型来检查，把任何违反这条规则的最短路径用状态的说法讲清楚，并把状态图以 mermaid 发给我。生成的状态图和报告请放到当前目录的 out/ 下。",
    },
  ],
  workspace: {
    files: {
      "flow.ts": [
        "// 订单状态流转。业务规则：只有“已付款”的订单才能进入“已发货”。",
        'export type OrderState = "空闲" | "待付款" | "已付款" | "已发货" | "已退款";',
        'export type OrderEvent = "提交订单" | "付款" | "直接发货" | "退款";',
        "",
        "export interface Transition {",
        "  from: OrderState;",
        "  event: OrderEvent;",
        "  to: OrderState;",
        "}",
        "",
        "export const transitions: Transition[] = [",
        '  { from: "空闲", event: "提交订单", to: "待付款" },',
        '  { from: "待付款", event: "付款", to: "已付款" },',
        '  { from: "待付款", event: "直接发货", to: "已发货" }, // 违规：还没付款就能发货',
        '  { from: "已付款", event: "退款", to: "已退款" },',
        '  { from: "已发货", event: "退款", to: "已退款" },',
        "];",
        "",
      ].join("\n"),
      "README.md": [
        "# Order flow",
        "",
        "`flow.ts` is the order state machine used by the checkout service.",
        "",
        "Business rule: an order may ship only after it is paid.",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "assistant-contains", text: "stateDiagram" },
    { kind: "assistant-contains", text: "发货" },
  ],
  rubric: {
    prompt:
      "回复应把订单流转当作状态模型检查，指出违反『只有已付款才能发货』的最短路径，并用状态的说法讲清它：从“空闲”经“待付款”在未付款的情况下直接进入“已发货”，即“待付款 —直接发货→ 已发货”这条边使规则被破坏。状态图应以 mermaid 状态图形式在回复或 out/ 产物中可视呈现。技能加载只是过程证据，不等于效果成立。若没有找到这条违规路径、或只给文字描述而没有可读的状态图，记为缺口；若把规则悄悄改弱让它通过，也记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    { id: "response-visible", description: "浏览器中能看到状态图与违规路径说明的完整回复。" },
    { id: "chart-readable", description: "状态图在回复或产物中可视呈现，需人工确认图可读。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/statechart/SKILL.md",
    regression: "new coverage; same scenario id is used for raw and adapted evidence",
  },
};
