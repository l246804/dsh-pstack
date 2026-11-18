import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-subagent-general",
  capability: "subagent-general",
  turns: [
    {
      prompt:
        "把这项独立的小任务交给一个通用执行者去做：统计仓库里有多少个 Markdown 文件，把数字报给我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 统计\n",
      "a.md": "# a\n",
      "b.md": "# b\n",
      "c.txt": "x\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到由一个独立执行者得出的正确统计（3 个 Markdown 文件），主会话负责转述它的结果。主会话自己数完、或没有独立执行者参与，记为缺口。",
  },
  uiObservations: [
    {
      id: "delegate-result",
      description: "浏览器中能看到执行者的统计结果。",
    },
  ],
};

export default scenario;
