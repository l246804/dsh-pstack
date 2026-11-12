import type { BehaviorScenario } from "../types.ts";

export const sharpenDeepenPrompt: BehaviorScenario = {
  type: "behavior",
  id: "sharpen-deepen-prompt",
  skill: "sharpen",
  turns: [
    {
      prompt:
        "我想给这个项目加一个导出 CSV 的功能，把数据表格都导出来。先别实现：帮我把这个任务想得更深，而不是更大，然后把我的这句请求重写成一个更好的提示词。范围这类该我定的东西，留给我自己决定。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# dashboard\n\n一个本地数据看板，展示若干表格。\n",
      "src/table.js":
        "export function toTable(rows) {\n  return { columns: Object.keys(rows[0] ?? {}), rows };\n}\n",
      "data/rows.json": '[{"id":1,"name":"alpha"},{"id":2,"name":"beta"}]\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "提示词" }],
  rubric: {
    prompt:
      "这是提示词打磨技能（sharpen）。效果成立的标志：回复先交代四件事——该领域顶尖从业者会做而用户没要求的是什么、他们会从哪些更原始的材料入手、会用哪些具体方法和工具、除了助手和用户之外什么能证明结果正确——然后把用户的请求重写成更深、而不是更大的提示词，并明确把属于用户的取舍（例如导出哪些表、字段范围、编码与分隔符等）留作开放选择，而不是替用户决定。若只是扩大范围、只给泛泛建议却不交回改写后的提示词、或替用户敲定了本应由用户决定的选项，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "completed-turn",
      description: "会话自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到四项深化分析、改写后的提示词，以及被保留为开放的取舍。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/sharpen/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
};
