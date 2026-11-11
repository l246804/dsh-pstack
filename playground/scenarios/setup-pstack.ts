import type { BehaviorScenario } from "../types.ts";

export const setupPstackModelConfig: BehaviorScenario = {
  type: "behavior",
  id: "setup-pstack-model-config",
  skill: "setup-pstack",
  turns: [
    {
      prompt: "帮我配置一下 pstack 每个角色用哪个模型、推理预算给多少，按我这边实际可用的模型来。",
    },
  ],
  workspace: {
    files: {},
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "模型" }],
  rubric: {
    prompt:
      "这是模型配置技能（setup-pstack）。效果成立的标志满足其一即可：(a) 助手实际产出一份按角色划分的模型配置（可观察的产物，例如写入某个角色配置文件，内容含 budget 与逐角色模型），并说明它会在新会话生效；或 (b) 在无法检测到可用模型时，明确报告无法检测模型或无法写入，并说明需要用户提供哪些可用模型信息，而不是编造模型名。若凭空写下未经确认的真实模型名、或既无产物也无明确说明、含糊带过，记 gap。不要求命中特定工具名；只要行为可观察或降级说明清楚即可。技能加载只是过程证据，不等于配置效果成立。",
  },
  uiObservations: [
    {
      id: "completed-turn",
      description: "会话自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到针对模型配置请求的完整回复，含可观察产物或明确的无法检测说明。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/setup-pstack/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
  answers: [
    { match: "预算", selected: ["large"] },
    { match: "budget", selected: ["large"] },
  ],
};
