import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-model-route",
  capability: "model-route",
  turns: [
    {
      prompt:
        "这个子任务请用当前可用模型里最适合判断的模型和它可用的最高推理档来跑，把实际选择的路由明确下来再交给执行者；如果当前没有更强的可用路由，也说明你实际用了什么。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# model-route\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一条显式的提供方/模型/推理强度路由，并被实际用于执行；如果当前可用模型里没有更强的选择，说明实际使用的可用路由即可。只说用强模型却没有落实路由，记为缺口。",
  },
  uiObservations: [
    {
      id: "route-shown",
      description: "浏览器中能看到显式路由说明。",
    },
  ],
};

export default scenario;
