import type { BehaviorScenario } from "../../runner/types.ts";

const scenario: BehaviorScenario = {
  id: "gap-subagent-model-routing",
  capability: "subagent-model-routing",
  kind: "gap",
  gap: "subagent-model-routing",
  treatments: ["native", "adapted"],
  environments: ["base"],
  turns: [
    {
      prompt:
        "请安排两个不同厂商的评审者独立评审同一份设计，并在报告里写明每个评审者使用的模型和推理档位。",
    },
  ],
  workspace: { files: {} },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "评审" }],
  rubric: {
    prompt: "报告能区分每个评审者使用的模型与推理档位，并至少列出两个不同厂商的评审者。",
  },
  uiObservations: [],
};

export default scenario;
