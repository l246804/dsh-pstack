import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "agent-team-send-message-contract",
  capability: "agent-team.send-message-contract",
  treatments: ["adapted"],
  environments: ["agent-team"],
  turns: [
    {
      prompt:
        "在团队模式下启动一个执行者，先让它数 src 里的文件数。然后给它创建共享任务并绑定负责人，再用 send_message 让同一个执行者继续数注释行数，确认是同一个执行者续跑，不是新起一个。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# team message contract\n\n统计 src 文件数，再统计注释行数。\n",
      "src/a.ts": "export const a = 1; // one\n",
      "src/b.ts": "export const b = 2; // two\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "no-tool-error" }],
  rubric: {
    prompt:
      "用户能看到同一个具名执行者完成两步任务，给出文件数和注释行数；Team task 有 owner，send_message 没有另起一个新的执行者。若续跑失败、另起新执行者、task 没有 owner，或只返回一步结果，记为缺口。",
  },
  uiObservations: [
    {
      id: "message-same-member",
      description: "浏览器中能看到同一执行者的两步结果，任务 owner 未发生变化。",
    },
  ],
};

export default scenario;
