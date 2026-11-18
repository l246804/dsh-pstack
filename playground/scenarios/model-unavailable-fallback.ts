import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-model-unavailable-fallback",
  capability: "model-unavailable-fallback",
  turns: [
    {
      prompt:
        "这个任务指定用一个可能不在当前可用清单里的模型档位。如果它不可用，就换同族最接近的可用档位，并告诉我你换了什么。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# model-unavailable-fallback\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到模型档位不可用时按同族最接近档位回退的说明。反复提交同一个被拒绝的档位、或静默切换不说明，记为缺口。",
  },
  uiObservations: [
    {
      id: "fallback-shown",
      description: "浏览器中能看到档位回退的说明。",
    },
  ],
};

export default scenario;
