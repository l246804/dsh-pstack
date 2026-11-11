import type { BehaviorScenario } from "../types.ts";

export const makeOperationsIdempotentApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-make-operations-idempotent-apply",
  skill: "principle-make-operations-idempotent",
  turns: [
    {
      prompt:
        "帮我写一个数据库迁移脚本：给 users 表加一列 full_name，并把已有的 first_name 和 last_name 拼进去。发布时如果脚本中途崩溃，运维会直接重跑整个脚本。你打算怎么设计这个迁移，保证重跑不出问题？",
    },
  ],
  workspace: {
    files: {
      "migrations/001_init.sql":
        "CREATE TABLE users (\n  id uuid PRIMARY KEY,\n  first_name text,\n  last_name text\n);\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "幂等" }],
  rubric: {
    prompt:
      "回复应把迁移设计成幂等：先读当前状态（列是否已存在）再只做缺的那部分，重复运行或在任意点崩溃后重跑都收敛到同一结果，并说明如何识别上次留下的半成品。只给一次性 ALTER、假设脚本只跑一次、或只复述原则名字而没有幂等设计，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复给出可重复执行并在崩溃后收敛的迁移设计。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-make-operations-idempotent/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
