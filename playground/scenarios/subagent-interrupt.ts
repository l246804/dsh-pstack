import type { BehaviorScenario } from "../runner/types.ts";

const slowTask = [
  'import { writeFileSync } from "node:fs";',
  "",
  'writeFileSync("started.txt", "started\\n");',
  "setTimeout(() => {",
  '  writeFileSync("done.txt", "finished\\n");',
  "}, 90_000);",
  "",
].join("\n");

export default {
  id: "subagent-interrupt",
  kind: "gap",
  gap: "subagent-interrupt",
  capability: "subagent-interrupt",
  turns: [
    {
      prompt:
        "起一个后台子代理运行工作区里的 `slow_task.mjs`。这个脚本会先写 `started.txt`，等待 90 秒后再创建 `done.txt`。启动后马上取消它，别让它跑完；取消后确认 done.txt 没有出现。直接启动子代理并尝试取消，失败就告诉我结果。",
    },
  ],
  workspace: {
    files: {
      "slow_task.mjs": slowTask,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "started.txt", text: "started" },
    { kind: "artifact-absent", path: "done.txt" },
  ],
  rubric: {
    prompt:
      "子代理在 90 秒等待结束前被取消，started.txt 存在而 done.txt 不存在，取消是系统级终止而不是子代理自愿停手。",
  },
  uiObservations: [],
} satisfies BehaviorScenario;
