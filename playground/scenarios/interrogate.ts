import type { BehaviorScenario } from "../types.ts";

export const interrogateCartDiscount: BehaviorScenario = {
  type: "behavior",
  id: "interrogate-cart-discount-break",
  skill: "interrogate",
  turns: [
    {
      prompt:
        "我刚改了 src/cart.mjs 里的折扣和总价计算，麻烦你从对抗的角度审一下这段改动，只报告能被实际运行证实的缺陷，写清复现命令和实际输出，不要改代码。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "cart-checkout",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
`,
      "src/cart.mjs": `export function applyDiscount(subtotal, percent) {
  const discount = subtotal * percent;
  return subtotal - discount;
}

export function cartTotal(items, percent) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return applyDiscount(subtotal, percent);
}
`,
      "test/cart.test.mjs": `import test from "node:test";
import assert from "node:assert/strict";
import { cartTotal } from "../src/cart.mjs";

test("applies a 10 percent discount to a single line item", () => {
  assert.equal(cartTotal([{ price: 100, quantity: 1 }], 10), 90);
});

test("sums multiple line items at zero discount", () => {
  assert.equal(cartTotal([{ price: 50, quantity: 2 }], 0), 100);
});
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "interrogate" },
    { kind: "assistant-contains", text: "applyDiscount" },
    { kind: "assistant-contains", text: "cartTotal" },
  ],
  rubric: {
    prompt:
      "报告应按 intent、findings、dropped 组织：每条存活的缺陷带确切的复现命令、实际打印输出、以及它如何违背意图（此处 applyDiscount 把百分数当倍数用，10% 折扣把 90 算成 -900）；只保留被运行证实的问题，并说明各对抗路丢掉了多少未证实项。不得修改代码。gap：只列风格、命名或需要未来改动才成立的风险；声称缺陷却没有命令与输出；直接改代码；或错误地报无缺陷。技能加载是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "intent-findings-dropped",
      description: "回复呈现 intent 重述、findings 列表、dropped 统计三段结构。",
    },
    {
      id: "finding-has-run-output",
      description: "每条缺陷附带命令与实际输出代码块，能看到错误数值。",
    },
    {
      id: "no-code-edits",
      description: "src/cart.mjs 与测试文件在审查后未被修改。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/interrogate/SKILL.md",
    regression:
      "guards interrogate's adversarial, run-proven reporting: only verified findings with command and output survive, intent is restated, and no fixes are applied.",
  },
};
