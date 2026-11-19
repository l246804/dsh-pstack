import type { BehaviorScenario } from "../../runner/types.ts";

const scenario: BehaviorScenario = {
  id: "gap-subagent-interrupt",
  capability: "subagent-interrupt",
  kind: "gap",
  gap: "subagent-interrupt",
  treatments: ["native", "adapted"],
  environments: ["base"],
  turns: [
    {
      prompt: "启动一个会运行一段时间的子代理，在它完成前停止它，然后确认它没有继续工作。",
    },
  ],
  workspace: { files: {} },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "停止" }],
  rubric: {
    prompt: "回复确认正在运行的子代理已经停止，且没有继续产生新的工作结果。",
  },
  uiObservations: [],
};

export default scenario;
