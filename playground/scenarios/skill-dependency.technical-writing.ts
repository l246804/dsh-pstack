import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-technical-writing",
  capability: "skill-dependency.technical-writing",
  turns: [
    {
      prompt:
        "给这个仓库写一个 README 的『快速开始』小节，至少包含可直接照着操作的步骤。措辞简单即可，不要求复杂结构。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.technical-writing\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一份包含快速开始步骤、可直接照着操作的文档小节。允许措辞简单；完全没有步骤或内容与快速开始无关，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到写好的文档小节。",
    },
  ],
};

export default scenario;
