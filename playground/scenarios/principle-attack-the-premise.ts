import type { BehaviorScenario } from "../types.ts";

export const attackThePremiseApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-attack-the-premise-apply",
  skill: "principle-attack-the-premise",
  turns: [
    {
      prompt:
        "feature flag 改了好几版都不生效。第一个修复以为是解析顺序问题，调整了解析顺序，还是没生效；第二个修复以为是缓存，清了缓存，还是没生效。现在准备上第三个修复：再加一次定时 reload。这两个修复其实都默认配置文件在启动时已经成功加载。你觉得接下来该怎么推进？先别直接写第三个修复。",
    },
  ],
  workspace: {
    files: {
      "src/config.ts":
        'export const config = JSON.parse(process.env.APP_CONFIG ?? "{}");\nexport const flagOn = Boolean(config.featureX);\n',
      "fixes.md":
        "# 已尝试的修复\n- fix 1：调整配置解析顺序（无效）\n- fix 2：清理配置缓存（无效）\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "前提" }],
  rubric: {
    prompt:
      "回复应把两次修复共享的前提写出来（配置在启动时已成功加载），并给出一项能直接验证该前提的观察或测试，而不是直接提第三个修复。只复述原则名字、或直接给第三个修复却没有检验前提，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复明确写出共享前提并给出验证方式。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-attack-the-premise/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
