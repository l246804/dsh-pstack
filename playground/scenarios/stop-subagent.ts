import type { BehaviorScenario } from "../types.ts";

const files: Record<string, string> = {
  "README.md": "# stop-subagent\n\n能力探测。\n",
};
for (let index = 0; index < 40; index += 1) {
  const name = `data/part-${String(index).padStart(2, "0")}.txt`;
  files[name] = `${Array.from(
    { length: 30 },
    (_, line) => `part ${index} line ${line}: 占位内容，用于模拟需要逐行总结的大仓库文件。`,
  ).join("\n")}\n`;
}

const scenario: BehaviorScenario = {
  id: "capability-stop-subagent",
  capability: "stop-subagent",
  turns: [
    {
      prompt:
        "让一个执行者持续遍历整个仓库并逐行总结，反复多轮、不要自己停下来，一直跑到我另行叫停为止。把任务交给它之后，这一轮就结束，不要等它完成，也不要在这个轮次里替它安排后续轮次。",
    },
    {
      prompt:
        "它已经在无目标地重复遍历，任务会拖很久。现在立刻用你能用的中断手段叫停这个执行者，然后告诉我它停在哪里、接下来怎么走。",
    },
  ],
  workspace: {
    files,
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户在提出叫停后，能看到执行者被中断，并得到停点说明与后续计划。中断手段以当前环境可用者为准：适配阶段用 pstack_interrupt，原生环境用 interrupt_agent；没有中断动作、或让执行者继续跑完才发现，记为缺口。",
  },
  uiObservations: [
    {
      id: "stop-report",
      description: "浏览器中能看到叫停说明与后续计划。",
    },
  ],
};

export default scenario;
