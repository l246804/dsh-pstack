import type { BehaviorScenario } from "../types.ts";

export const encodeLessonsInStructureApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-encode-lessons-in-structure-apply",
  skill: "principle-encode-lessons-in-structure",
  turns: [
    {
      prompt:
        "过去两周我在三次代码评审里都提醒同事同一句话：提交前必须跑 eslint --max-warnings 0，而且代码里不能出现 any。下周新人来了还会忘。我打算再写一份更长的 checklist 文档发到群里。你觉得最有用、能让大家不再被反复提醒的做法是什么？",
    },
  ],
  workspace: {
    files: {
      "CONTRIBUTING.md":
        "# 提交规范\n- 提交前必须跑 eslint --max-warnings 0\n- 代码里不能出现 any\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "lint" }],
  rubric: {
    prompt:
      "回复应把这条反复出现的口头提醒固化成结构（lint 规则、CI 门禁、pre-commit 钩子或脚本），并指出结构一旦生效就不该再靠更长的文字文档重复提醒。只建议把文档写得更长、或只复述原则名字而没有给出可执行的强制机制，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复给出把口头提醒固化到 lint/CI 的具体机制。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-encode-lessons-in-structure/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
