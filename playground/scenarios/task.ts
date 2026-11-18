import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-task",
  capability: "task",
  turns: [
    {
      prompt:
        "帮我把仓库里 README 的目录结构说明整理成一段简短摘要。这个整理工作交给一个独立的下属去做，你要马上告诉我它已经接手，等它做完再把结果带回来给我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# task\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户可观察到的合格结果：主会话在开始时就表明已把整理工作交给一个独立下属，并随后带回该下属完成的摘要。主会话自己直接做完、没有交给独立下属，或交出去后没有任何完成回报，记为缺口。",
  },
  uiObservations: [
    {
      id: "delegation-notice",
      description: "浏览器中能看到交接说明以及后续结果回报。",
    },
  ],
};

export default scenario;
