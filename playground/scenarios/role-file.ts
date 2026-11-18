import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-role-file",
  capability: "role-file",
  turns: [
    {
      prompt:
        "按项目里配置的角色模型设置来跑这次工作：每个角色用什么模型以那份角色配置为准，跑之前先确认它读到了这份配置。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# role-file\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到执行时参考了角色配置文件，并说明每个角色实际用了什么模型。完全忽略角色配置、或声称读过却没对上内容，记为缺口。",
  },
  uiObservations: [
    {
      id: "rolefile-shown",
      description: "浏览器中能看到角色配置被读取与应用的说明。",
    },
  ],
};

export default scenario;
