import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-parallel-delegation",
  capability: "parallel-delegation",
  turns: [
    {
      prompt:
        "把三个互相独立的模块 src/a.ts、src/b.ts、src/c.ts 分给三个执行者同时各看一个，每人报该模块的一句话职责，最后合成一张表给我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 并行探测\n",
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
      "src/c.ts": "export const c = 3;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到三个独立执行者并行处理、并汇总成一张表。三个模块被一个人串行看完、或没有汇总表，记为缺口。",
  },
  uiObservations: [
    {
      id: "parallel-table",
      description: "浏览器中能看到并行产出的汇总表。",
    },
  ],
};

export default scenario;
