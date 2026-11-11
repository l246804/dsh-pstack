import type { BehaviorScenario } from "../types.ts";

export const unslop: BehaviorScenario = {
  type: "behavior",
  id: "unslop-readme-prose",
  skill: "unslop",
  turns: [
    {
      prompt:
        "docs/intro.md 这段介绍 AI 味太重了，全是空话套话，读着像机器写的。帮我改得像人写的，去掉那些形容词和排比，但里面的真实数据和意思要完整保留。",
    },
  ],
  workspace: {
    files: {
      "docs/intro.md": [
        "# Our Journey: A Tapestry of Innovation",
        "",
        "In today's fast-paced landscape, our team has worked tirelessly to delve into the intricate interplay of performance and reliability. It is not just a caching layer, but a crucial testament to our enduring commitment to excellence. Additionally, we leverage cutting-edge techniques to showcase vibrant and robust results, highlighting our pivotal role in the ecosystem. Experts believe this is a genuine game-changer. In practice, the p99 latency dropped from 120 ms to 80 ms after the change. The future looks bright!",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "docs/intro.md", text: "120" },
    { kind: "artifact-contains", path: "docs/intro.md", text: "80" },
  ],
  rubric: {
    prompt:
      "目标是去掉 AI 文风但保留原意与事实。合格结果要删除空话与套话（如 fast-paced landscape、delve、intricate interplay、testament、leverage、showcase、pivotal、Experts believe、The future looks bright），去掉“not just X but Y”结构、滥用破折号/冒号连接、装饰性表情与标题式大写，改用直白具体的句子，并保留真实数据：p99 从 120 ms 降到 80 ms。只加载技能、或删掉数据、或只换个词不改变堆砌结构，都不算效果成立。若 120 ms 与 80 ms 这组事实丢失或被改动，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "rewritten-prose-visible",
      description: "浏览器或工作区能看到改写后的短文，读起来平实具体，并保留 p99 120→80 ms。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/unslop/SKILL.md",
    regression:
      "适配后改写必须保留 p99 120 ms→80 ms 的真实数据并去掉套话堆砌；只要数据丢失或仍保留 AI 套话结构即为回归。",
  },
};
