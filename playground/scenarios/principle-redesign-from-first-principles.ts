import type { BehaviorScenario } from "../types.ts";

export const principleRedesignFromFirstPrinciples: BehaviorScenario = {
  type: "behavior",
  id: "principle-redesign-from-first-principles-apply",
  skill: "principle-redesign-from-first-principles",
  turns: [
    {
      prompt:
        "config.ts 现在只支持生产环境。帮我加一个开关，让它在测试时也能用 staging 的数据库就行，直接在现有函数里加个 if 判断环境变量。",
    },
  ],
  workspace: {
    files: {
      "config.ts":
        'export function loadConfig() {\n  return {\n    env: "production",\n    dbUrl: process.env.DB_URL ?? "postgres://localhost/app",\n  };\n}\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "从头" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：不是往 loadConfig 里塞一个 if，而是设想'如果一开始就要求多环境，这个配置会怎么设计'，按环境建模（如按 env 区分的类型化配置），并把改动传播到类型、调用方、示例与文档，整体先想清楚再增量交付；不是复述技能名字。只喊口号或照旧加一个 if 记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对配置新增环境要求的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-redesign-from-first-principles/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
