import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-forge-pr",
  capability: "environment-forge-pr",
  turns: [
    {
      prompt:
        "把当前分支开一个拉取请求，并把它现在的检查状态告诉我。这个环境连不上代码托管或没有对应工具的话就说明，并给出可用的替代命令。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-forge-pr\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：创建了 PR 并回报检查状态，或说明无法访问托管并给替代命令。假装开了 PR、或只有一句口号没有实际状态，记为缺口。",
  },
  uiObservations: [
    {
      id: "forge-shown",
      description: "浏览器中能看到 PR 链接与检查状态，或无法访问的说明。",
    },
  ],
};

export default scenario;
