import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-inherit-parent",
  capability: "inherit-parent",
  turns: [
    {
      prompt: "这个子任务就沿用当前会话的模型，不要另外指定模型。跑完告诉我你实际用的是哪条路由。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# inherit-parent\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到子执行者沿用了当前会话模型，并如实说明实际路由。擅自指定了别的模型、或谎报路由，记为缺口。",
  },
  uiObservations: [
    {
      id: "inherit-shown",
      description: "浏览器中能看到沿用父级路由的说明。",
    },
  ],
};

export default scenario;
