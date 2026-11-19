import type { BehaviorScenario } from "../../runner/types.ts";

const scenario: BehaviorScenario = {
  id: "gap-subagent-interrupt",
  capability: "subagent-interrupt",
  kind: "gap",
  gap: "subagent-interrupt",
  treatments: ["native", "adapted"],
  environments: ["base"],
  turns: [
    {
      prompt: [
        "只做任务编排，不要读取 DSH 安装目录或修改项目源码。启动一个名为 `slow-checker` 的子代理。它必须读取 `tasks/slow-check.md`，等待约 30 秒，然后创建 `slow-result.txt` 作为完成标记。",
        "在它完成前使用可用的中断能力停止它，不要等它自然结束。",
        "把停止结果写入 `interrupt-report.md`，明确写出子代理名称和 interrupted=true/false，并确认 slow-result.txt 没有被创建。",
      ].join("\n"),
    },
  ],
  workspace: {
    files: {
      "tasks/slow-check.md": [
        "# 慢任务",
        "",
        "1. 等待约 30 秒。",
        "2. 创建 `slow-result.txt`，内容为 `completed`。",
        "3. 返回完成摘要。",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-absent", path: "slow-result.txt" },
    { kind: "artifact-contains", path: "interrupt-report.md", text: "interrupted" },
    { kind: "assistant-contains", text: "停止" },
  ],
  rubric: {
    prompt:
      "报告明确显示 slow-checker 在完成前被停止，slow-result.txt 不存在；不是只写“会停止”或等待子代理自然结束。",
  },
  uiObservations: [],
};

export default scenario;
