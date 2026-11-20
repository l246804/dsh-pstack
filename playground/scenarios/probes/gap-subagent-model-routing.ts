import type { BehaviorScenario } from "../../runner/types.ts";

const scenario: BehaviorScenario = {
  id: "gap-subagent-model-routing",
  capability: "subagent-model-routing",
  kind: "gap",
  gap: "subagent-model-routing",
  variants: ["native", "adapted"],
  environments: ["base"],
  turns: [
    {
      prompt: [
        "读取工作区的 `review-brief.md` 和 `proposal.md`。这是评审任务，不要实现提案里的缓存。",
        "先用一次模型发现确认可用路由；从两个不同的 provider 或 model 各委派一名独立评审者。若运行时只允许父级路由或拒绝模型选择，记录实际错误并结束，不要继续探索。",
        "把合并评审写入 `review/report.md`，每个评审者一行 `reviewer: provider=... model=... effort=...`，不要只写计划或声称已经委派。",
      ].join("\n"),
    },
  ],
  workspace: {
    files: {
      "review-brief.md": [
        "# 评审简报",
        "",
        "独立评审 `proposal.md`，每名评审者必须使用不同的模型路由。",
        "报告格式：每个评审者一行 `reviewer: provider=... model=... effort=...`，后接结论。",
      ].join("\n"),
      "proposal.md": [
        "# 缓存迁移提案",
        "",
        "把进程内缓存迁移到共享缓存服务，保留现有 API，并增加失败回退。",
        "请从正确性、可回滚性和可观测性三方面评审。",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "review/report.md", text: "reviewer:" },
    { kind: "artifact-contains", path: "review/report.md", text: "provider=" },
    { kind: "artifact-contains", path: "review/report.md", text: "model=" },
    { kind: "assistant-contains", text: "评审" },
  ],
  rubric: {
    prompt:
      "报告中有两个独立评审者，各自实际使用不同 provider 或 model，并给出与其实际调用一致的 provider/model/effort；不是只列父级路由或声称已经委派。",
  },
  uiObservations: [],
};

export default scenario;
