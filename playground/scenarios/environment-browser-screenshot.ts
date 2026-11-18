import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-browser-screenshot",
  capability: "environment-browser-screenshot",
  turns: [
    {
      prompt:
        "把当前这个网页打开、截一张整页图给我看。截图后用 Markdown 图片语法把图直接嵌进回复正文，例如 ![整页截图](gui-full.png)，确保它在对话里真的显示出来，不要只给文件卡片或路径。这个环境驱动不了浏览器的话就说明，并告诉我还能怎么看到页面。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-browser-screenshot\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能在回复里直接看到真实页面截图，或看到无法驱动浏览器的说明与替代方式。用文字描述冒充截图、只给文件卡片或路径、或假装截了，记为缺口。",
  },
  uiObservations: [
    {
      id: "screenshot-shown",
      description: "浏览器中能看到直接显示的真实页面截图或无法截图的说明。",
    },
  ],
};

export default scenario;
