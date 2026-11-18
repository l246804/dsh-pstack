import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-role-value",
  capability: "role-value",
  turns: [
    {
      prompt:
        "把判断类工作配到当前可用的判断模型，并指定它的推理强度；把这条角色值拆开实际用起来。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# role-value\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一条完整的角色值被拆成提供方、模型、推理强度三部分并生效。只写模型名却缺档位、或没有实际使用，记为缺口。",
  },
  uiObservations: [
    {
      id: "rolevalue-shown",
      description: "浏览器中能看到角色值的拆分与使用。",
    },
  ],
};

export default scenario;
