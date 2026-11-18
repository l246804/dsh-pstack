import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-local",
  capability: "environment-local",
  turns: [
    {
      prompt: "在当前这个工作区里直接读一下 README，把标题告诉我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 本地执行探测\n\n标题在这里。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户能看到从当前工作区读到并回报的标题。跑到别的地方读、或读不到，记为缺口。",
  },
  uiObservations: [
    {
      id: "local-read",
      description: "浏览器中能看到当前工作区 README 的标题。",
    },
  ],
};

export default scenario;
