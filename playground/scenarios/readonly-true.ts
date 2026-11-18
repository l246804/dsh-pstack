import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-readonly-true",
  capability: "readonly-true",
  turns: [
    {
      prompt:
        "让一个只读的探查者读一遍 src 目录，告诉我每个文件负责什么。它只负责读，不要修改任何文件。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 只读探查\n",
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到探查结果，且工作区文件没有被改动。若执行者修改了文件，或没有交代只读约束，记为缺口。",
  },
  uiObservations: [
    {
      id: "readonly-report",
      description: "浏览器中能看到只读探查结论，工作区无改动。",
    },
  ],
};

export default scenario;
