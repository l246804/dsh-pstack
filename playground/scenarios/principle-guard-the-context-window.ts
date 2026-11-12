import type { BehaviorScenario } from "../types.ts";

export const guardTheContextWindowApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-guard-the-context-window-apply",
  skill: "principle-guard-the-context-window",
  turns: [
    {
      prompt:
        "我要审计仓库里 300 个源文件的错误处理。我的计划是让当前这个主会话把每个文件都读一遍、逐个分析，最后在主线程里汇总一张表。请帮我规划怎么执行这个任务。",
    },
  ],
  workspace: {
    files: {
      "repo/file-list.txt":
        "src/a.ts\nsrc/b.ts\nsrc/c.ts\nsrc/d.ts\nsrc/e.ts\n...（共 300 个文件）\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "子代理" }],
  rubric: {
    prompt:
      "回复应把大批量读取和分析分派给子代理、只在主线程保留摘要和结论，并给分批/限制每批文件数、设轮次预算的做法，而不是让主会话把 300 个文件原文都读进来。让主线程逐个读全部原文、或只复述原则名字而没有分流方案，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复把批量读取分给子代理并只在主线程保留摘要。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-guard-the-context-window/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
