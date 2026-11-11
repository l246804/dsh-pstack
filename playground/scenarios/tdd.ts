import type { BehaviorScenario } from "../types.ts";

export const tdd: BehaviorScenario = {
  type: "behavior",
  id: "tdd-sum-negative-regression",
  skill: "tdd",
  turns: [
    {
      prompt:
        "sumArray 在含负数的数组上算错了，比如 [1, -2, 3] 应该是 2，现在却返回 4。帮我在 test/sum.test.js 里先补一个能稳定复现这个 bug 的回归测试，确认它先失败，再改 src/sum.js 让测试通过。最后把修复前的失败和修复后的通过结果都复述给我。",
    },
  ],
  workspace: {
    files: {
      "package.json": [
        "{",
        '  "type": "module",',
        '  "scripts": { "test": "node --test" }',
        "}",
        "",
      ].join("\n"),
      "src/sum.js": [
        "export function sumArray(values) {",
        "  return values",
        "    .filter((value) => value > 0)",
        "    .reduce((total, value) => total + value, 0);",
        "}",
        "",
      ].join("\n"),
      "test/sum.test.js": [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'import { sumArray } from "../src/sum.js";',
        "",
        'test("sums positive numbers", () => {',
        "  assert.equal(sumArray([1, 2, 3]), 6);",
        "});",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "test/sum.test.js", text: "-2" },
    { kind: "assistant-contains", text: "失败" },
    { kind: "assistant-contains", text: "通过" },
  ],
  rubric: {
    prompt:
      "目标是在改生产代码前先把坏行为变成可执行的回归测试。合格回复要展示：新增的回归测试在修复前失败（并说明失败原因符合预期），修复后同一测试通过，且测试断言的是用户可观察的行为（含负数数组的正确和）而不是照抄当前实现。只加载技能、或直接改代码后再补一个总是通过的测试，都算效果成立不成立的分界。若没有呈现修复前失败的证据，或测试只是镜像当前错误实现，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "test-file-visible",
      description: "工作区能看到 test/sum.test.js 里新增了覆盖负数的用例，src/sum.js 已修复。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/tdd/SKILL.md",
    regression:
      "适配后仍必须先在 test/sum.test.js 写回归测试、呈现修复前失败与修复后通过两段证据；跳过失败证据直接改代码即为回归。",
  },
};
