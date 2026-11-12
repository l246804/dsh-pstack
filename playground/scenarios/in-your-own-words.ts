import type { BehaviorScenario } from "../types.ts";

export const inYourOwnWordsGoalRestate: BehaviorScenario = {
  type: "behavior",
  id: "in-your-own-words-goal-restate",
  skill: "in-your-own-words",
  turns: [
    {
      prompt:
        "我们这个项目最近用户总抱怨搜索很慢，老板让我这周把性能提上去，可我看着代码也不知道该从哪下手，代码就在这个工作区里。先别改代码，用你自己的话说说，你觉得我的目标是什么、我真正想解决的问题是什么。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# search-service\n\n一个简单的搜索服务，按关键词过滤一个 JSON 数据集。\n",
      "src/search.js":
        "export function search(items, keyword) {\n  return items.filter((item) => item.text.includes(keyword));\n}\n",
      "data/items.json": '[{"text":"apple pie"},{"text":"banana bread"}]\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "目标" }],
  rubric: {
    prompt:
      "这是纯文本目标复述技能（in-your-own-words）。效果成立的标志：用助手自己的话准确说出用户的表层目标（把搜索性能提上去）和更深层的问题（用户对慢搜索不满、需要可验证的性能改善、用户自己也还没定位瓶颈），可以指出隐含歧义，但不擅自替用户拍板方案，也不直接开工改代码。若只是复述用户原话、加入没依据的臆测、或直接开始实现，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "completed-turn",
      description: "会话自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到用助手自己话复述用户目标与问题的完整回复。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/in-your-own-words/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
};
