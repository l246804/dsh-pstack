import type { BehaviorScenario } from "../types.ts";

export const experienceFirstApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-experience-first-apply",
  skill: "principle-experience-first",
  turns: [
    {
      prompt:
        "这个版本还剩两周，产品希望一次上线 10 个小功能。我更倾向先把其中 3 个体验打磨到位，剩下的往后放；也有人主张先把 10 个都做出来、细节以后再说。你支持哪种取舍，为什么？",
    },
  ],
  workspace: {
    files: {
      "roadmap.md":
        "# 本版本候选功能\n1. 搜索建议\n2. 批量选择\n3. 快捷键面板\n4. 深色模式\n5. 导出分享\n6. 空状态引导\n7. 通知中心\n8. 模板库\n9. 内联编辑\n10. 移动端适配\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "体验" }],
  rubric: {
    prompt:
      "回复应站在用户体验一侧，支持少而精（把 3 个打磨到位）而不是多而糙，并说明每个功能都要为其体验价值负责、实现便利不能压过用户观感。只比较排期、只复述原则名字、或含糊两可而不给取舍判断，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复明确选择少而精并说明体验优先的理由。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-experience-first/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
