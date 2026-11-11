import type { BehaviorScenario } from "../types.ts";

export const fixRootCausesApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-fix-root-causes-apply",
  skill: "principle-fix-root-causes",
  turns: [
    {
      prompt:
        "生产环境偶发登录失败，日志里是 `Cannot read properties of undefined (reading 'id')`。上一版同事在报错那行加了 if (!user) return 兜底，结果又在别的地方崩了。现在有人提议再加一层 try/catch 把异常吞掉。你应该怎么处理这个 bug？",
    },
  ],
  workspace: {
    files: {
      "src/session.ts":
        "export function touch(session: { user?: { id: string } }): string {\n  return session.user!.id;\n}\n",
      "logs.txt": "ERROR Cannot read properties of undefined (reading 'id')\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "根因" }],
  rubric: {
    prompt:
      "回复应复现问题、顺着每个症状追到系统第一次出错的地方（为什么 user 会是 undefined）并在那里修复，而不是在崩溃点加兜底或吞异常。应判断触发该状态是否合法：若不合法要找到产生该状态的上游。直接加 try/catch 吞异常、或只复述原则名字，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复追查 user 为 undefined 的上游根因而不是加兜底。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-fix-root-causes/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
