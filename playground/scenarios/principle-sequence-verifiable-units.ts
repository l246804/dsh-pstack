import type { BehaviorScenario } from "../types.ts";

export const principleSequenceVerifiableUnits: BehaviorScenario = {
  type: "behavior",
  id: "principle-sequence-verifiable-units-apply",
  skill: "principle-sequence-verifiable-units",
  turns: [
    {
      prompt:
        "我要把仓库里三十来个文件里旧的 getUser(id, cb) 回调写法一次性全部改成 await getUser(id)，改完最后统一跑一次测试。这样一口气全改最快吧？",
    },
  ],
  workspace: {
    files: {
      "service.ts":
        "type Cb<T> = (err: Error | null, value?: T) => void;\n\nexport function getUser(id: string, cb: Cb<{ id: string }>): void {\n  setTimeout(() => cb(null, { id }), 0);\n}\n\nexport function loadUser(id: string): void {\n  getUser(id, (err, user) => {\n    if (err) return;\n    console.log(user?.id);\n  });\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "小步" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：指出一次性改三十个文件再最后统一测会把破损埋进批量改动里，应拆成小单元（按模块或文件），每个单元改完立即验证通过再进入下一个，并按能自证的方式排列交付（例如先落一个失败测试再逐单元转绿）；不是复述技能名字。只喊口号或认可一次性大改记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对批量改写的排序判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-sequence-verifiable-units/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
