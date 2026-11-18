import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-deslop",
  capability: "skill-dependency.deslop",
  turns: [
    {
      prompt:
        "提交前先把我这次改动里的 AI 味代码和多余注释清理一遍，再让我确认。清理依赖的专项技能如果在这个环境没有，就说明并用等价流程处理。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.deslop\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一次针对改动的清理动作或对替代流程的说明。没有任何清理、也没说明，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到清理结果或替代流程说明。",
    },
  ],
};

export default scenario;
