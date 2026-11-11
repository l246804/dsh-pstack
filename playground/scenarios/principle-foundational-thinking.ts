import type { BehaviorScenario } from "../types.ts";

export const foundationalThinkingApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-foundational-thinking-apply",
  skill: "principle-foundational-thinking",
  turns: [
    {
      prompt:
        "我要给任务系统加一个『依赖关系』功能：一个任务可以依赖其他任务，存在环要报错，还要能算出可执行的顺序。请先在动手写逻辑之前给出方案，重点说清楚你打算怎么组织和存储依赖关系、把核心类型定成什么。",
    },
  ],
  workspace: {
    files: {
      "src/task.ts": "export interface Task {\n  id: string;\n  title: string;\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "数据结构" }],
  rubric: {
    prompt:
      "回复应先定核心数据结构和类型（例如任务图、邻接表、依赖集合），并顺着访问模式说明为什么选这种结构，而不是直接堆分支逻辑或散落的 if。只给一段伪代码就开写、或只复述原则名字而没有先定型结构和访问模式，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复先定下依赖关系的核心数据结构和类型再谈逻辑。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-foundational-thinking/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
