import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-file-read-write",
  capability: "file-read-write",
  turns: [
    {
      prompt:
        "读一下 docs/notes.md，把里面列出的要点整理成一段简短摘要，写到 outputs/summary.md 里。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 文件读写探测\n\n读取输入文件并产出输出文件。\n",
      "docs/notes.md": "# 笔记\n\n- 先验证再交付\n- 改动尽量小\n- 结论要有证据\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
    {
      kind: "artifact-dir-nonempty",
      path: "outputs",
    },
  ],
  rubric: {
    prompt:
      "用户能在工作区里看到 outputs/summary.md，且内容覆盖原文件的主要要点。没有产出文件、或文件内容与源文件无关，记为缺口；摘要长度和行数不作硬性要求。",
  },
  uiObservations: [
    {
      id: "artifact-visible",
      description: "浏览器中能看到生成的 outputs/summary.md 及其内容。",
    },
  ],
};

export default scenario;
