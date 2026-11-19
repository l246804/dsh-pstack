import type { BehaviorScenario } from "../../runner/types.ts";

const scenario: BehaviorScenario = {
  id: "gap-subagent-readonly-sandbox",
  capability: "subagent-readonly-sandbox",
  kind: "gap",
  gap: "subagent-readonly-sandbox",
  treatments: ["native", "adapted"],
  environments: ["base"],
  turns: [
    {
      prompt: "让一个只读子代理检查当前工作区并返回发现，确保它没有修改、创建或删除任何文件。",
    },
  ],
  workspace: { files: {} },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "只读" }],
  rubric: {
    prompt: "回复说明只读检查已完成，且工作区没有发生任何写入或删除。",
  },
  uiObservations: [],
};

export default scenario;
