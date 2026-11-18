import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-readonly-false",
  capability: "readonly-false",
  turns: [
    {
      prompt: "让一个执行者把 src/a.ts 里的常量值从 1 改成 2，改完把结果告诉我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 可写执行\n",
      "src/a.ts": "export const a = 1;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
    {
      kind: "artifact-contains",
      path: "src/a.ts",
      text: "a = 2",
    },
  ],
  rubric: {
    prompt:
      "用户能看到文件被实际改写为 a = 2。执行者被误设为只读而无法落笔，或根本没改，记为缺口。",
  },
  uiObservations: [
    {
      id: "write-result",
      description: "浏览器中能看到改动结果，文件内容更新。",
    },
  ],
};

export default scenario;
