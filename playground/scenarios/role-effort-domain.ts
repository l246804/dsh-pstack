import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-role-effort-domain",
  capability: "role-effort-domain",
  treatments: ["adapted"],
  turns: [
    {
      prompt:
        "这次子任务想比角色默认的推理档位再高一点。请先确认这个模型实际支持哪些档位，再从里面选一个更高的来跑；如果已经是最高档，就用最高档并说明。告诉我你最终用的档位。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# role-effort-domain\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到最终档位属于该模型公布的档位集合，且高于角色默认档位，或已到最高档并说明。凭经验猜一个档位、反复提交被拒绝的档位、或不做确认直接抬高，记为缺口。",
  },
  uiObservations: [
    {
      id: "effort-choice-shown",
      description: "浏览器中能看到最终选用的推理档位及其依据。",
    },
  ],
};

export default scenario;
