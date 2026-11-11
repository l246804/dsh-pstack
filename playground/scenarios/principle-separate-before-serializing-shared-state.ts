import type { BehaviorScenario } from "../types.ts";

export const principleSeparateBeforeSerializingSharedState: BehaviorScenario = {
  type: "behavior",
  id: "principle-separate-before-serializing-shared-state-apply",
  skill: "principle-separate-before-serializing-shared-state",
  turns: [
    {
      prompt:
        "两个 worker 进程都会调用 worker.ts 里同一个 updateProgress，各自往同一个 state.json 写自己的 lastIndex。偶尔会互相覆盖丢进度。加个文件锁是不是就能解决？",
    },
  ],
  workspace: {
    files: {
      "worker.ts":
        'import { readFileSync, writeFileSync } from "node:fs";\n\nexport function updateProgress(workerId: number, lastIndex: number): void {\n  const state = JSON.parse(readFileSync("state.json", "utf8"));\n  if (workerId === 1) state.lastIndex1 = lastIndex;\n  else state.lastIndex2 = lastIndex;\n  writeFileSync("state.json", JSON.stringify(state));\n}\n',
      "state.json": '{"lastIndex1":0,"lastIndex2":0}\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "独立" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：先问两个 worker 是否真的需要同一个可变对象，默认做法是消除共享写目标——让每个 worker 写自己拥有的状态文件（如 worker1-state.json、worker2-state.json），只在读/报告边界合并，而不是一上来就加锁；只有在单一共享写目标是真实不变量时才用锁/顺序阶段结构化串行。把'加锁'当默认答案记 gap。只喊口号记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对共享状态写入的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-separate-before-serializing-shared-state/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
