import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-svg-chart",
  capability: "render-svg-chart",
  treatments: ["native"],
  environments: ["base", "render"],
  turns: [
    {
      prompt:
        "把这份状态机导出成可查看的 SVG，并且要我在当前界面里直接看到渲染出来的图，不要只给源码、文件路径或文件卡片。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# SVG 状态图探测\n",
      "state.mmd": "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running\n  Running --> [*]\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户在当前界面内看到真实渲染出来的 SVG 图像。只有源码、文件路径或文件卡片，记为缺口。",
  },
  uiObservations: [
    {
      id: "svg-rendered",
      description: "浏览器中或产物里实际显示打开后的 SVG 图像。",
    },
  ],
};

export default scenario;
