import type { BehaviorScenario } from "../types.ts";

export const principleTestBehaviorNotImplementation: BehaviorScenario = {
  type: "behavior",
  id: "principle-test-behavior-not-implementation-apply",
  skill: "principle-test-behavior-not-implementation",
  turns: [
    {
      prompt:
        "calc.test.ts 里这个测试用 spy 断言内部私有的 subtotal 被调用了一次，重构后经常挂。帮我把它改得稳定点，最好还能继续确认内部确实调用了 subtotal。",
    },
  ],
  workspace: {
    files: {
      "calc.ts":
        "export function multiply(a: number, b: number): number {\n  return a * b;\n}\n\nfunction subtotal(items: number[]): number {\n  return items.reduce((sum, n) => sum + n, 0);\n}\n\nexport function totalWithTax(items: number[], rate: number): number {\n  return subtotal(items) * (1 + rate);\n}\n",
      "calc.test.ts":
        'import { test, expect, vi } from "vitest";\nimport * as calc from "./calc.ts";\n\ntest("totalWithTax calls subtotal once", () => {\n  const spy = vi.spyOn(calc as unknown as { subtotal: (i: number[]) => number }, "subtotal");\n  const result = calc.totalWithTax([100], 0.1);\n  expect(spy).toHaveBeenCalledTimes(1);\n  expect(result).toBe(110);\n});\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "行为" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：指出断言内部私有 subtotal 的调用次数是把测试钉在实现上，重构即挂且抓不到真 bug；应改为通过公开接口断言可观察行为（如 totalWithTax([100], 0.1) === 110，并从需求推导期望值），保留能随行为破坏而失败、随内部重构仍通过的测试；不是复述技能名字。只喊口号或继续保留内部调用断言记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对坏测试改写的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-test-behavior-not-implementation/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
