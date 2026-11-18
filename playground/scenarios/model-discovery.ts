import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-model-discovery",
  capability: "model-discovery",
  turns: [
    {
      prompt: "先查出这个会话里现在真正可用的模型和推理档位有哪些，列一份清单给我，然后再动手。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# model-discovery\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一份基于当前会话实际可用的模型与档位清单。凭空编造模型名、或完全不查就下结论，记为缺口。",
  },
  uiObservations: [
    {
      id: "model-list",
      description: "浏览器中能看到可用模型与档位清单。",
    },
  ],
};

export default scenario;
