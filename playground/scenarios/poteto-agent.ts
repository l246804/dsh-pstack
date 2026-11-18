import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-poteto-agent",
  capability: "poteto-agent",
  turns: [
    {
      prompt:
        "接下来按 poteto 风格推进：把你准备做的实现压缩成最小改动，并交给一个遵循 poteto 风格的执行者来完成一处小改动。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# poteto-agent\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一个遵循 poteto 风格（先读风格说明、最小改动、交付后回读）的执行者产出。沿用通用执行者且完全不带该风格说明，记为缺口。",
  },
  uiObservations: [
    {
      id: "style-delegate",
      description: "浏览器中能看到交付说明与风格化执行结果。",
    },
  ],
};

export default scenario;
