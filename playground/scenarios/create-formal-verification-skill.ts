import type { BehaviorScenario } from "../types.ts";

export const createFormalVerificationSkillLeaseMutex: BehaviorScenario = {
  type: "behavior",
  id: "create-formal-verification-skill-lease-mutex",
  skill: "create-formal-verification-skill",
  turns: [
    {
      prompt:
        "`src/lease.ts` 里的租约实现必须在任何并发交错下都保证『同一时刻最多只有一个持有者』。单元测试覆盖不到这种时序，我想要更强的保证。请为它做正式验证，把这条互斥性质证明清楚或找出反例，并把验证做成一个下一个代理能直接复跑的技能。如果当前环境没有可用的模型检查器或证明工具，请如实说明缺的是哪个工具，再给出一个能落地的降级做法，不要假装已经验证通过。",
    },
  ],
  workspace: {
    files: {
      "package.json": [
        "{",
        '  "name": "lease-service",',
        '  "version": "0.1.0",',
        '  "private": true,',
        '  "type": "module"',
        "}",
        "",
      ].join("\n"),
      "src/lease.ts": [
        "// A lease grants temporary exclusive ownership of a resource to one holder.",
        "// Promise: at most one active holder at any instant, even under concurrent access.",
        "// In production the holder and expiry live in shared storage, so two callers",
        "// can interleave between the check and the write below.",
        "",
        "export interface LeaseRecord {",
        "  holder: string | null;",
        "  expiresAt: number;",
        "}",
        "",
        "export class Lease {",
        "  private record: LeaseRecord = { holder: null, expiresAt: 0 };",
        "",
        "  tryAcquire(who: string, now: number, ttlMs: number): boolean {",
        "    const active = this.record.holder !== null && now < this.record.expiresAt;",
        "    if (active) return false;",
        "    // Not atomic with the check above once this runs against shared storage.",
        "    this.record = { holder: who, expiresAt: now + ttlMs };",
        "    return true;",
        "  }",
        "",
        "  release(who: string): void {",
        "    if (this.record.holder === who) {",
        "      this.record = { holder: null, expiresAt: 0 };",
        "    }",
        "  }",
        "",
        "  holder(): string | null {",
        "    return this.record.holder;",
        "  }",
        "}",
        "",
      ].join("\n"),
      "README.md": [
        "# Lease service",
        "",
        "`src/lease.ts` implements a time-bounded lease.",
        "",
        "## Promise",
        "",
        "At most one holder is active at any instant.",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "assistant-contains", text: "验证" },
    { kind: "assistant-contains", text: "互斥" },
  ],
  rubric: {
    prompt:
      "技能的可观察行为有两种都可接受：其一，产出对租约『同一时刻最多一个持有者』的模型或证明，并留下一个项目内可复跑的验证技能（写清性质、覆盖的代码、复跑命令、边界与假设，并用一个故意破坏的变体证明它确实能失败）；其二，当前环境缺少模型检查器或证明工具时，明确报告缺的是哪个工具，并给出具体降级方案，绝不宣称已验证通过。技能加载只是过程证据，不等于效果成立。缺工具属于环境 blocked，不是技能缺口，二者必须区分：把缺工具当成验证通过、或只给泛泛建议而不产出模型与技能文件也不报告工具缺失，记为缺口。若产出模型，必须让『互斥』这条性质在代码的用词下可读。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "response-visible",
      description: "浏览器中能看到关于正式验证、工具选择与范围的完整回复。",
    },
    {
      id: "tool-status-visible",
      description: "若报告工具缺失，需在回复中明确写出缺的工具与降级方案。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/create-formal-verification-skill/SKILL.md",
    regression: "new coverage; same scenario id is used for raw and adapted evidence",
  },
};
