import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-visualize",
  capability: "skill-dependency.visualize",
  turns: [
    {
      prompt:
        "把我们最近三次构建的耗时用一张柱状图展示出来，数据我从下面给你：12 秒、9 秒、15 秒。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.visualize\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一张真实渲染的柱状图。依赖缺失时应说明并给替代；只给数字或文字、没有图，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到渲染出来的柱状图。",
    },
  ],
};

export default scenario;
