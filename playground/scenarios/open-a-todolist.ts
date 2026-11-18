import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-open-a-todolist",
  capability: "open-a-todolist",
  turns: [
    {
      prompt:
        "这件事分三步做：先读 README，再补一段项目说明，最后检查结果。请用一份任务清单把这三步列出来，边做边更新状态。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# open-a-todolist\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一份贯穿始终的任务清单，每一步的状态清楚，完成后对应项变为已完成。完全没有清单、或清单与实际步骤对不上，记为缺口。",
  },
  uiObservations: [
    {
      id: "todo-panel",
      description: "浏览器中能看到任务清单及其状态变化。",
    },
  ],
};

export default scenario;
