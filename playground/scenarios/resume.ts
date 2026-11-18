import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-resume",
  capability: "resume",
  turns: [
    {
      prompt:
        "先让一个执行者统计 src 里的文件数。等它报完后，让同一个执行者接着把刚才那个数字加上注释行数，不要重新找一个执行者从头再来。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 续跑探测\n",
      "src/a.ts": "// one\nexport const a = 1;\n",
      "src/b.ts": "// two\nexport const b = 2;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到同一个执行者被继续用来完成第二步。每步都新起一个执行者、并丢掉上一步状态，记为缺口。",
  },
  uiObservations: [
    {
      id: "resume-report",
      description: "浏览器中能看到同一执行者先后两次回报。",
    },
  ],
};

export default scenario;
