import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-file-attachments",
  capability: "file-attachments",
  turns: [
    {
      prompt:
        "把 docs/spec.md 和 docs/api.md 两个文件交给一个执行者，让它据此写一份两文件的一致性结论。路径直接写在说明里让它自己读。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 附件探测\n",
      "docs/spec.md": "# 规格\n\n接口返回 status 字段。\n",
      "docs/api.md": "# API\n\n返回 status 字段。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到执行者确实读过这两个文件并给出基于内容的结论。执行者看不到文件、或凭空下结论，记为缺口。",
  },
  uiObservations: [
    {
      id: "attachment-report",
      description: "浏览器中能看到基于两份文件的结论。",
    },
  ],
};

export default scenario;
