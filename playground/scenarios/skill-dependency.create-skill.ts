import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-create-skill",
  capability: "skill-dependency.create-skill",
  turns: [
    {
      prompt:
        "帮我新建一个项目技能，用来在提交前检查改动。要按技能文件的标准格式写出来并放到正确的位置。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.create-skill\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到一份合规、可加载的技能文件。依赖缺失时应当说明并给出可行的替代写法，否则若完全没有产出，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到新建的技能文件内容与放置位置。",
    },
  ],
};

export default scenario;
