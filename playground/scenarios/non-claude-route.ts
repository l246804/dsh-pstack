import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-non-claude-route",
  capability: "non-claude-route",
  turns: [
    {
      prompt:
        "这个子任务想用一个别的厂商的模型来跑。请挑一个最接近的可用路由；如果确实没有匹配，就退回默认并明确告诉我你退回了。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# non-claude-route\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：选到最接近的可用路由，或明确说明没有匹配、已退回默认。悄悄换模型却不说明，记为缺口。",
  },
  uiObservations: [
    {
      id: "route-fallback",
      description: "浏览器中能看到路由选择或退回默认的说明。",
    },
  ],
};

export default scenario;
