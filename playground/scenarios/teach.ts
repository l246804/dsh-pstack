import type { BehaviorScenario } from "../types.ts";

export const teachTokenBucket: BehaviorScenario = {
  type: "behavior",
  id: "teach-token-bucket",
  skill: "teach",
  turns: [
    {
      prompt:
        "我接手了这个限流器模块，但还没完全看懂。你能从头给我讲讲它是干嘛的、一个请求进来后它怎么运转、以及为什么用令牌桶这种设计吗？我想真的理解它，而不是背代码。",
    },
  ],
  workspace: {
    files: {
      "package.json": `{
  "name": "rate-limiter",
  "version": "0.1.0",
  "type": "module"
}
`,
      "README.md": `# Rate limiter

A small token-bucket rate limiter.

- \`src/TokenBucket.mjs\` holds the \`TokenBucket\` class.
- \`src/middleware.mjs\` keeps one bucket per caller key.
`,
      "src/TokenBucket.mjs": `export class TokenBucket {
  constructor({ capacity, refillPerSecond, now = Date.now }) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.tokens = capacity;
    this.lastRefill = now();
    this.now = now;
  }

  refill() {
    const current = this.now();
    const elapsedSeconds = (current - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = current;
  }

  tryTake(count = 1) {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }
}
`,
      "src/middleware.mjs": `import { TokenBucket } from "./TokenBucket.mjs";

export function createRateLimiter({ capacity, refillPerSecond }) {
  const buckets = new Map();
  return function allow(key) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket({ capacity, refillPerSecond });
      buckets.set(key, bucket);
    }
    return bucket.tryTake();
  };
}
`,
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "skill-loaded", skill: "teach" },
    { kind: "assistant-contains", text: "TokenBucket" },
    { kind: "assistant-contains", text: "令牌桶" },
  ],
  rubric: {
    prompt:
      "讲解应先用一两句话平实地定义一个限流器/令牌桶是什么，再逐步讲请求进来后如何按经过时间补充令牌、tryTake 如何扣减或拒绝，最后讲为什么用令牌桶（允许容量内的突发又约束平均速率），保留 why 的置信措辞；用图示时逐步叠加而非一次画全。整体是对话式的，结尾可邀请继续深入。gap：只罗列函数与常量；大段贴代码或长篇说教；完全跳过为什么这么设计；出现小测、框架标签或一次画全的图。技能加载是过程证据，不等于讲解有效。",
  },
  uiObservations: [
    {
      id: "plain-definition-first",
      description: "回复开头是简短平实的定义，而不是直接罗列函数或堆砌代码。",
    },
    {
      id: "incremental-diagrams",
      description: "若使用图示，图是逐步展开的，而非一张塞满所有部件的大图。",
    },
    {
      id: "conversational-close",
      description: "结尾以对话方式邀请继续深入，且没有小测或说教式标签。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/teach/SKILL.md",
    regression:
      "guards teach's plain, paced explanation that runs how and why: plain definition first, step-by-step mechanism, the rationale with confidence language kept, incremental diagrams, and a conversational close.",
  },
};
