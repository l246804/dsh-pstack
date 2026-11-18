import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-control-ui",
  capability: "skill-dependency.control-ui",
  turns: [
    {
      prompt:
        "帮我验证这个网页上的按钮真的能点通：打开页面、点一下按钮、确认页面有响应，并把关键交互截图直接显示在对话回复里，不要只给文件卡片或路径。这个环境驱动不了真实浏览器界面的话就说明并给替代观察方式。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.control-ui\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能在回复里直接看到真实驱动界面的结果与关键截图，或看到受限说明与替代。用静态截图或文字冒充真实交互、只给文件卡片或路径、没有实际操作，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到直接显示的真实交互结果或受限说明。",
    },
  ],
};

export default scenario;
