import type { BehaviorScenario } from "../../types.ts";

const scenario: BehaviorScenario = {
  id: "agent-team-interrupt-agent-contract",
  capability: "agent-team.interrupt-agent-contract",
  treatments: ["adapted"],
  turns: [
    {
      prompt:
        "在团队模式下启动一个执行者做需要多轮处理的长任务，给它创建共享任务并绑定负责人。趁它还在运行，用 pstack_interrupt 停止它，报告停点、停用标识和任务最终状态。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# team interrupt contract\n\n分多轮扫描 data 目录，每轮处理后停一下。\n",
      "data/part-00.txt": `${Array.from({ length: 10 }, (_, index) => `line ${index}: 占位内容。`).join("\n")}\n`,
      "data/part-01.txt": `${Array.from({ length: 10 }, (_, index) => `line ${index}: 占位内容。`).join("\n")}\n`,
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "no-tool-error" }],
  rubric: {
    prompt:
      "用户能看到具名执行者被 pstack_interrupt 停止，并有停止确认和停点；Team task 已创建并绑定该执行者，停止后被释放或删除，不留下无主任务。若停不掉、找不到目标、task 悬空，或只停 teammate，记为缺口。",
  },
  uiObservations: [
    {
      id: "interrupt-team-member",
      description: "浏览器中能看到执行者停止后的状态，以及对应任务不再处于无主运行状态。",
    },
  ],
};

export default scenario;
