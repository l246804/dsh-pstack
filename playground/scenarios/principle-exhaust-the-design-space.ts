import type { BehaviorScenario } from "../types.ts";

export const exhaustTheDesignSpaceApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-exhaust-the-design-space-apply",
  skill: "principle-exhaust-the-design-space",
  turns: [
    {
      prompt:
        "我们想给命令面板加一个全新的『拖拽分组』交互。团队里没人做过，现有代码也没有可参考的先例，而且这个交互的体验好坏很看手感。我准备直接把脑子里那套方案写进生产代码。你建议怎么推进？",
    },
  ],
  workspace: {
    files: {
      "design-brief.md":
        "# 命令面板拖拽分组\n目标：拖动命令项到分组中，支持跨组移动。\n现状：无先例，体验取决于手感，无法只靠逻辑确定。\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "原型" }],
  rubric: {
    prompt:
      "回复应建议先做 2-3 个相互竞争的原型并排对比、按手感选出方案后再落到生产代码，而不是直接按脑中单一方案实现。只挑一个方案直接实现、或只复述原则名字而没有多方案对比，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复主张先做多个竞争原型并排比较再定方案。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-exhaust-the-design-space/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
