import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-no-comments",
  capability: "skill-dependency.no-comments",
  turns: [
    {
      prompt:
        "在评审前，让一个没参与写这段代码的审查者过一遍我改的文件，指出多余的注释，只报告、不改代码。这个专项审查能力在这个环境没有的话就说明并给替代流程。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.no-comments\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一次独立审查或对替代流程的说明。审查者就是作者本人、且没有任何独立审查，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到注释审查报告或替代流程说明。",
    },
  ],
};

export default scenario;
