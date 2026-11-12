import type { BehaviorScenario } from "../types.ts";

export const principleProveItWorks: BehaviorScenario = {
  type: "behavior",
  id: "principle-prove-it-works-apply",
  skill: "principle-prove-it-works",
  turns: [
    {
      prompt:
        "同事说他修好了 sum.ts 里数组求和的边界 bug，还说他跑过测试确认没问题。你核实一下到底是不是真的修好了。",
    },
  ],
  workspace: {
    files: {
      "sum.ts":
        "export function sum(nums: number[]): number {\n  let total = 0;\n  for (let i = 0; i < nums.length - 1; i++) {\n    total += nums[i];\n  }\n  return total;\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "实际" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：不采信'同事说跑过测试'这类自报，而是直接读 sum.ts 并对真实函数执行（例如用具体输入 sum([1,2,3]) 得到实际输出，证明它仍漏掉最后一个元素），必要时写一个可复跑的小脚本留作证据；不是复述技能名字。只转述自报、未做真实执行记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出核实后的真实执行证据。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-prove-it-works/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
