import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "agent-team-list-agents-contract",
  capability: "agent-team.list-agents-contract",
  treatments: ["adapted"],
  environments: ["agent-team"],
  turns: [
    {
      prompt:
        "在团队模式下启动一个执行者处理一项独立任务，给它创建共享任务并绑定负责人，然后用 list_agents 报告这个执行者的名字、描述和当前状态，并说明任务负责人是谁。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# team list contract\n\n请统计 src 目录中的文件数。\n",
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "no-tool-error" }],
  rubric: {
    prompt:
      "用户能看到 Team task 已创建并绑定到一个具名执行者；list_agents 返回该执行者的名字、状态与描述，且与任务 owner 一致。若 list_agents 看不到执行者、名字缺失，或 task 没有 owner，记为缺口。",
  },
  uiObservations: [
    {
      id: "list-agents-team",
      description: "浏览器中能看到团队任务板上的任务 owner 与 subagent 列表中的执行者对应一致。",
    },
  ],
};

export default scenario;
