import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-control-cli",
  capability: "skill-dependency.control-cli",
  turns: [
    {
      prompt:
        "帮我验证这个命令行工具真的能用：运行它、看一下输出、确认退出码是 0。这个环境驱动不了交互式命令行的话就说明并给替代做法。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.control-cli\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到真实的命令行运行结果，或说明受限并给替代。没有任何真实运行、只凭描述下结论，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到命令行运行输出或受限说明。",
    },
  ],
};

export default scenario;
