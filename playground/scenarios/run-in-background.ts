import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-run-in-background",
  capability: "run-in-background",
  turns: [
    {
      prompt:
        "同时启动两项独立的检查任务，让它们各自在后台跑，先别让我等，全部完成后再把结果一起汇总给我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# run-in-background\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能在任务都还没结束时先拿到已接手的反馈，随后收到结果汇总。串行等待、或没有汇总，记为缺口。",
  },
  uiObservations: [
    {
      id: "background-report",
      description: "浏览器中能看到先接手、后汇总的过程。",
    },
  ],
};

export default scenario;
