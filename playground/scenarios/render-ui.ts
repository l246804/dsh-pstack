import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-ui",
  capability: "render-ui",
  treatments: ["native"],
  environments: ["base", "render"],
  turns: [
    {
      prompt:
        "给我做一个能直接点的简单界面：一个输入框加一个按钮，点按钮就把输入内容显示到下面。我要看到真实可交互的界面，不要只给我代码。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# render-ui\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一个真实可交互的界面并可以点击操作。只有代码或静态截图而没有交互界面，记为缺口。",
  },
  uiObservations: [
    {
      id: "ui-interactive",
      description: "浏览器中实际显示可交互界面，按钮点击后有反应。",
    },
  ],
};

export default scenario;
