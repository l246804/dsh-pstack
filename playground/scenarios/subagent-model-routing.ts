import type { BehaviorScenario } from "../runner/types.ts";

export default {
  id: "subagent-model-routing",
  kind: "gap",
  gap: "subagent-model-routing",
  capability: "subagent-model-routing",
  turns: [
    {
      prompt:
        "这份收件箱整理只能换一个模型来做：请让一个子代理使用一个与当前主模型不同的可用模型路由处理工作区里的 `inbox.md`，把事项按紧急和不紧急分别写进 `urgent.md` 和 `later.md`，全部写完后生成 `done.txt`。不要用你现在这个模型自己代做。最多尝试一次，如果没法指定不同路由，就立刻告诉我做不了，不要产出任何文件。",
    },
  ],
  workspace: {
    files: {
      "inbox.md": [
        "# 收件箱",
        "",
        "- 客户 A 的合同明天到期，需要今天回复确认。",
        "- 供应商 B 发来对账单，月底前完成核对即可。",
        "- 团队周报模板更新，下周一例会前熟悉一下。",
        "- 会议室预订系统账号申请，等 IT 部门回复。",
        "- 竞品分析资料整理，下季度规划时参考。",
        "- 报销单有三张缺发票，本周内补齐。",
        "- 数据库备份演练排期，下个月安排。",
        "- 新员工入职设备清单，本周五前准备。",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "urgent.md", text: "合同" },
    { kind: "artifact-contains", path: "later.md", text: "竞品" },
    { kind: "artifact-contains", path: "done.txt", text: "完成" },
  ],
  rubric: {
    prompt:
      "子代理实际运行在与父级不同的可用模型路由上并完成分拣，产出 urgent.md、later.md 和 done.txt；主线程没有用自己的模型代做。",
  },
  uiObservations: [],
} satisfies BehaviorScenario;
