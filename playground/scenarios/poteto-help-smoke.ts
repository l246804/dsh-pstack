import type { BehaviorScenario } from "../types.ts";

export const potetoHelpSmoke: BehaviorScenario = {
  type: "behavior",
  id: "poteto-help-smoke",
  skill: "poteto-help",
  turns: [
    {
      prompt:
        "我在当前工作区想改进一个小功能。请先写一份简短的工作建议，说明如何选择合适的验证方式，并提到你会查看的工作流说明。不要修改文件。",
    },
  ],
  workspace: {
    files: {
      "task.txt": "Improve one small feature. Do not change files in this smoke scenario.\n",
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "poteto-help" },
    { kind: "assistant-contains", text: "验证" },
  ],
  rubric: {
    prompt:
      "回复应针对当前工作区的小功能改进，给出可操作的验证建议。技能加载是过程证据，不等于建议有效。若助手没有提供实质建议，则记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    { id: "response-visible", description: "浏览器中能看到针对用户请求的完整回复。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/poteto-help/SKILL.md",
    regression: "same scenario id is used for raw and adapted evidence",
  },
};
