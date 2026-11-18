import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-comment-sicko",
  capability: "comment-sicko",
  turns: [
    {
      prompt:
        "在提交前，请一个专门讨厌注释的审查者过一遍我改动的文件，指出该删的注释和被工作区约定掩盖的问题，只报告、不要改代码。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 注释审查\n",
      "src/app.ts": "// 这里先这样，后面再说\nexport const x = 1;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一个只做报告、不改代码的评论审查结果，且审查口径是删除冗余注释。审查者顺手改了应用代码、或完全没有审查动作，记为缺口。",
  },
  uiObservations: [
    {
      id: "comment-report",
      description: "浏览器中能看到注释审查报告。",
    },
  ],
};

export default scenario;
