import type { BehaviorScenario } from "../types.ts";

export const principleModelTheDomain: BehaviorScenario = {
  type: "behavior",
  id: "principle-model-the-domain-apply",
  skill: "principle-model-the-domain",
  turns: [
    {
      prompt:
        "player.ts 用 isPlaying、isLoading、isPaused、hasError 四个布尔量表示播放器状态，每个函数里都在 if/else 组合这些布尔。现在我要再加一个 buffering 状态，感觉会越加越乱。帮我看看怎么改。",
    },
  ],
  workspace: {
    files: {
      "player.ts":
        "let isPlaying = false;\nlet isLoading = false;\nlet isPaused = false;\nlet hasError = false;\n\nexport function play(): void {\n  if (hasError) { isPlaying = false; isPaused = false; return; }\n  if (isLoading) return;\n  isPlaying = true;\n  isPaused = false;\n}\n\nexport function pause(): void {\n  if (isPlaying) { isPlaying = false; isPaused = true; }\n}\n\nexport function load(): void {\n  if (isPlaying || isPaused) return;\n  isLoading = true;\n}\n\nexport function fail(): void {\n  hasError = true;\n  isPlaying = false;\n  isPaused = false;\n  isLoading = false;\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "状态机" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：指出四个互相需要保持同步的布尔量是散落的隐式状态，应改成单一状态机或判别联合（discriminated union），让非法状态不可表示并删掉组合判断的分支，新增 buffering 也就落在一个合法状态上；不是复述技能名字。只喊口号或仍建议继续加布尔记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对布尔状态逻辑的建模判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-model-the-domain/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
