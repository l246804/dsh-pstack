import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-worktree",
  capability: "environment-worktree",
  turns: [
    {
      prompt:
        "在一个独立的工作树里做这处改动，别弄脏我当前的分支。这个环境支持的话就把工作树路径告诉我，不支持就说明并给替代办法。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-worktree\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：在独立工作树里完成并给出路径，或说明环境不支持并给替代办法。直接在当前分支上改却不说明，记为缺口。",
  },
  uiObservations: [
    {
      id: "worktree-shown",
      description: "浏览器中能看到工作树路径或替代办法。",
    },
  ],
};

export default scenario;
