import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-loop",
  capability: "skill-dependency.loop",
  turns: [
    {
      prompt:
        "用你能用的后台或定时方式，在同一轮里完成三次巡检：每次间隔几秒检查一次工作区，第 1 次把 counter.txt 写成 1，第 2 次写成 2，第 3 次写成 3，达到 3 次立刻停止，并在回复里报告总次数和实现方式。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.loop\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一个分次巡检、到第 3 次就停止的节奏，工作区 counter.txt 最终为 3；依赖不可用时应说明并给替代。只做一次就结束、或到了 3 次仍不停，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到巡检节奏、巡检次数与停止条件的说明。",
    },
  ],
};

export default scenario;
