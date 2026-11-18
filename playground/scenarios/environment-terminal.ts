import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-terminal",
  capability: "environment-terminal",
  turns: [
    {
      prompt:
        "帮我启动那个交互式命令行工具，进去后按一下帮助、再退出。这个环境驱动不了交互式终端的话就说明，并改用一次性命令给我同样的信息。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-terminal\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：真的驱动了交互式终端并回报，或说明无法驱动并改用一次性命令得到信息。声称驱动了交互式终端却没有真实交互，记为缺口。",
  },
  uiObservations: [
    {
      id: "terminal-shown",
      description: "浏览器中能看到终端交互结果或替代命令的输出。",
    },
  ],
};

export default scenario;
