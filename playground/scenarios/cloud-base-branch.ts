import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-cloud-base-branch",
  capability: "cloud-base-branch",
  turns: [
    {
      prompt:
        "从 feature-base 这个分支起，在一个独立检出里看一下它和主干差了什么。如果环境支持以指定分支为起点就明说，不支持就说明并给出替代做法。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# cloud-base-branch\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到以 feature-base 为起点得到的差异，或明确说明无法以该分支为起点并给了替代办法。既没以该分支为起点、也没说明，记为缺口。",
  },
  uiObservations: [
    {
      id: "base-branch-visible",
      description: "浏览器中能看到起点分支或替代路径的说明。",
    },
  ],
};

export default scenario;
