import type { BehaviorScenario } from "../types.ts";

export const buildTheLeverApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-build-the-lever-apply",
  skill: "principle-build-the-lever",
  turns: [
    {
      prompt:
        "仓库里有 40 个 TypeScript 文件还在用旧的 API 名 oldFlag，需要统一改成 newFlag，相关的 import 也要一起改。我本来想手动一个个搜索替换。请直接把一个可重跑的 codemod 脚本写到 scripts/rename-flag.mjs，并说明怎么验证它改对了。",
    },
  ],
  workspace: {
    files: {
      "src/a.ts": "export const on = flags.oldFlag;\n",
      "src/b.ts": 'import { oldFlag } from "./flags.ts";\nexport const use = oldFlag;\n',
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "assistant-contains", text: "脚本" },
    { kind: "artifact-contains", path: "scripts/rename-flag.mjs", text: "oldFlag" },
  ],
  rubric: {
    prompt:
      "回复应选择构建可重跑的工具（脚本或 codemod）而不是手动逐文件替换，并说明如何在第一个文件上验证后再铺开、如何安全重跑。只描述手动步骤、或只复述原则名字而没有产出可重跑脚本，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复给出可重跑脚本方案并写明验证方式。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-build-the-lever/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
