import type { BehaviorScenario } from "../types.ts";

export const arenaDurationBakeoff: BehaviorScenario = {
  type: "behavior",
  id: "arena-duration-parser-bakeoff",
  skill: "arena",
  turns: [
    {
      prompt:
        "帮我把 src/duration.ts 里那个还没实现的时长解析函数补上：输入像 1h30m、45s、2h 这样的字符串，返回毫秒。别只做一版，同时做几个思路不同的版本，比较边界情况和可读性，挑一个最稳的当最终实现，函数名保持 parseDuration，把最终代码写回 src/duration.ts，并把选它的理由和比较结果写进 docs/duration-notes.md。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "duration-kit",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
`,
      "src/duration.ts": `export function parseDuration(input: string): number {
  throw new Error("TODO");
}
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "arena" },
    { kind: "artifact-contains", path: "src/duration.ts", text: "return" },
    { kind: "artifact-contains", path: "docs/duration-notes.md", text: "parseDuration" },
    { kind: "assistant-contains", text: "parseDuration" },
  ],
  rubric: {
    prompt:
      "回复与 docs/duration-notes.md 应体现并行多路加汇总：至少两个结构不同的实现思路被并列比较（边界处理、可读性），明确选出作为基线的方案并说明为什么，必要时把落选方案里值得的部分并进最终实现，最终可直接使用的 parseDuration 写回 src/duration.ts。gap：只给一个实现没有任何比较；没有基线选择理由；notes 缺失或只是复制代码；最终实现仍是 TODO 或明显错误。技能加载是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "candidate-comparison",
      description: "回复中出现对多个候选实现方案的并列比较（表格或分段），而非只贴一版代码。",
    },
    {
      id: "synthesis-note-visible",
      description: "浏览器里能看到 docs/duration-notes.md，其中记录基线选择与并接说明。",
    },
    {
      id: "final-impl-rendered",
      description: "src/duration.ts 呈现一个已实现的 parseDuration，不再是 TODO。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/arena/SKILL.md",
    regression:
      "guards arena's parallel-candidates-then-synthesize behavior: several distinct attempts, an explicit base pick with rationale and grafting, and one usable final artifact.",
  },
};
