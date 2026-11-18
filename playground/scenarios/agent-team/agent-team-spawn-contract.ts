import type { BehaviorScenario } from "../../types.ts";

const scenario: BehaviorScenario = {
  id: "agent-team-spawn-contract",
  capability: "agent-team.spawn-contract",
  treatments: ["adapted"],
  turns: [
    {
      prompt:
        "请用团队协作完成一次小型调研：把两个独立问题分别拆成共享任务，自行启动两个执行者，给每个任务绑定负责人，等待两边完成后汇总结果。不要只用一个执行者。",
    },
  ],
  workspace: {
    files: {
      "README.md":
        "# team task contract\n\n两个独立调研问题：\n1. 统计 src 目录的文件数。\n2. 统计 data 目录的行数。\n",
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
      "data/values.txt": "alpha\nbeta\ngamma\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "no-tool-error" }],
  rubric: {
    prompt:
      "用户能看到两个 Team task 都创建成功，并分别绑定到两个不同的执行者；两个 pstack_subagent 各自启动；最终汇总包含两项调研结果。若没有创建 task、task 没有 owner、只启动一个执行者，或执行者未完成，记为缺口。",
  },
  uiObservations: [
    {
      id: "team-pair",
      description: "浏览器中能看到 Team 任务板有两条任务，且两条任务各有对应的执行者。",
    },
  ],
};

export default scenario;
