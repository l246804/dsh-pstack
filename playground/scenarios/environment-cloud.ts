import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-cloud",
  capability: "environment-cloud",
  turns: [
    {
      prompt:
        "请在一个和当前工作区彼此隔离、独立的检出里做一处小改动。如果这个环境提供不了这种隔离执行，就直接说明并跳过，不要在当前工作区硬做。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-cloud\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：真的在独立隔离的检出里完成并说明隔离位置，或明确说明当前环境无法提供隔离执行并跳过。在当前工作区直接做、且完全未提隔离，记为缺口。",
  },
  uiObservations: [
    {
      id: "isolation-visible",
      description: "浏览器中能看到对隔离方式（独立检出或跳过原因）的说明。",
    },
  ],
};

export default scenario;
