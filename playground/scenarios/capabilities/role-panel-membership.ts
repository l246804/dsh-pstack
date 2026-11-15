import type { BehaviorScenario } from "../../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-role-panel-membership",
  capability: "role-panel-membership",
  turns: [
    {
      prompt:
        "这次交叉评审请开一个评审小组，按项目里给评审类角色配置的模型列表来组。名单里的每个模型各跑一个评审，不要从其他可用模型里另外加人或替换。跑完告诉我实际用了哪几个模型。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# role-panel-membership\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到评审小组的实际成员来自角色配置的那份列表：每个配置条目跑一个评审，成员数量等于列表长度。从全局可用模型里另挑成员、替换配置里的模型，或把角色配置当成一份任意可选菜单，记为缺口。",
  },
  uiObservations: [
    {
      id: "panel-members-shown",
      description: "浏览器中能看到评审小组实际使用的模型成员。",
    },
  ],
};

export default scenario;
