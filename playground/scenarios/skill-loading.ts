import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-loading",
  capability: "skill-loading",
  turns: [
    {
      prompt: "用 pstack 的帮助技能告诉我，这个环境里能做哪些事情。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-loading\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到基于 pstack 帮助技能内容的能力说明。通过 skill 工具加载，或用 read 读取 SKILL.md，都属于正确的加载方式；只有完全没有帮助内容、或输出与帮助技能无关时才记为缺口。",
  },
  uiObservations: [
    {
      id: "reply-visible",
      description: "浏览器中能看到基于帮助技能内容的能力说明。",
    },
  ],
};

export default scenario;
