import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-desktop",
  capability: "environment-desktop",
  turns: [
    {
      prompt:
        "帮我操作一下桌面上的那个应用，点开设置看一眼当前主题。这个环境操作不了桌面应用或模拟器的话就直说，并说明还能怎么确认。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-desktop\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：真的操作了桌面应用或模拟器并回报结果，或说明无法操作并给替代办法。声称操作过却没有真实现象，记为缺口。",
  },
  uiObservations: [
    {
      id: "desktop-shown",
      description: "浏览器中能看到桌面操作结果或限制说明。",
    },
  ],
};

export default scenario;
