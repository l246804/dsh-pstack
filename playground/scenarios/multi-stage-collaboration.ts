import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-multi-stage-collaboration",
  capability: "multi-stage-collaboration",
  turns: [
    {
      prompt:
        "分两个阶段做：第一阶段让一个执行者列出仓库里所有 TODO 项，第二阶段让另一个执行者据此排一个优先级清单。第二阶段的输入要用第一阶段的产出。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 多阶段探测\n",
      "src/a.ts": "// TODO: 补测试\nexport const a = 1;\n",
      "src/b.ts": "// TODO: 更新文档\nexport const b = 2;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两个阶段、两次交接，且第二阶段确实用了第一阶段的清单。所有工作一步做完、没有阶段交接，记为缺口。",
  },
  uiObservations: [
    {
      id: "stage-report",
      description: "浏览器中能看到两个阶段的产出与交接。",
    },
  ],
};

export default scenario;
