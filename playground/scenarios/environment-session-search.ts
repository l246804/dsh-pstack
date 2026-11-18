import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-environment-session-search",
  capability: "environment-session-search",
  turns: [
    {
      prompt:
        "回看一下我在这个工作区里上一次做的一半工作，告诉我上次停在哪里。拿不到历史会话的话就直说，并请我贴出关键信息。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# environment-session-search\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到两种合格结果之一：基于历史会话重建的上下文小结，或明确说明拿不到历史会话并请用户补充。编造上次进度，记为缺口。",
  },
  uiObservations: [
    {
      id: "history-shown",
      description: "浏览器中能看到历史上下文小结或说明。",
    },
  ],
};

export default scenario;
