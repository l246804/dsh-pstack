import type { BehaviorScenario } from "../types.ts";

export const architectDiscountStrategy: BehaviorScenario = {
  type: "behavior",
  id: "architect-discount-strategy-design",
  skill: "architect",
  turns: [
    {
      prompt:
        "我在这个订单定价模块里想支持可插拔的折扣策略，百分比、满减、买赠以后都可能加进来。先别写实现：把这套折扣策略的类型、函数签名和模块边界设计清楚，先写调用方怎么用，再给类型草稿和取舍理由，策略接口就叫 DiscountStrategy，整理成一份设计文档放到 docs/discount-design.md。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "order-pricing",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
`,
      "README.md": `# Order pricing

Small module that turns an order's line items into a total.

- \`src/pricing.ts\` holds the \`LineItem\` type, \`subtotal\`, and \`PriceCalculator\`.
- \`src/order.ts\` wires an \`Order\` to the calculator.

Prices are plain numbers in cents.
`,
      "src/pricing.ts": `export interface LineItem {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export function subtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export class PriceCalculator {
  total(items: LineItem[]): number {
    return subtotal(items);
  }
}
`,
      "src/order.ts": `import { PriceCalculator, type LineItem } from "./pricing.ts";

export interface Order {
  id: string;
  items: LineItem[];
  couponCode?: string;
}

export function orderTotal(order: Order): number {
  return new PriceCalculator().total(order.items);
}
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "architect" },
    { kind: "artifact-contains", path: "docs/discount-design.md", text: "DiscountStrategy" },
    { kind: "assistant-contains", text: "DiscountStrategy" },
  ],
  rubric: {
    prompt:
      "设计文档应先把 DiscountStrategy 的调用方视角写出来（如何注册一个折扣、如何作用到订单总价），再由用法推导出类型草稿、函数签名和模块边界，并说明接口深度与至少一个被否决的替代方案。结论应让下一个工程师能照着类型上手。gap：直接写实现或只给一种形状且无取舍；缺调用方用法；没有模块边界或替代方案；只罗列类型而无理由。技能加载是过程证据，不等于设计有效。",
  },
  uiObservations: [
    {
      id: "usage-before-shape",
      description: "回复与文档先呈现调用方用法，再呈现类型草稿，顺序可读。",
    },
    {
      id: "design-doc-rendered",
      description: "浏览器里能看到 docs/discount-design.md 的正文与标题结构。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/architect/SKILL.md",
    regression:
      "guards architect's design-first behavior: caller usage first, type sketch and module boundaries derived from it, tradeoffs recorded, no implementation before the sketch.",
  },
};
