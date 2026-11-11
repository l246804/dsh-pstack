import type { BehaviorScenario } from "../types.ts";

export const lazinessProtocolApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-laziness-protocol-apply",
  skill: "principle-laziness-protocol",
  turns: [
    {
      prompt:
        "有个 30 行的小工具函数被三个调用点复用。我想给它抽一层接口、加一个配置对象，再包一个 provider，方便以后扩展。你看这个改动该怎么定？",
    },
  ],
  workspace: {
    files: {
      "src/format.ts":
        "export function formatMoney(cents: number): string {\n  return (cents / 100).toFixed(2);\n}\n",
      "src/caller.ts":
        'import { formatMoney } from "./format.ts";\nexport const price = formatMoney(1999);\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "最小" }],
  rubric: {
    prompt:
      "回复应主张用最小改动解决当前问题、优先删除和复用而不是提前抽接口/配置/provider 这些层，并说明等三个调用点出现真实差异后再抽象。认可一上来就加多层抽象、或只复述原则名字而没有给出更小的做法，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复选择最小改动、拒绝过早抽象并说明理由。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-laziness-protocol/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
