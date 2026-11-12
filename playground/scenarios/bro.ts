import type { BehaviorScenario } from "../types.ts";

export const broPlainRestate: BehaviorScenario = {
  type: "behavior",
  id: "bro-plain-restate",
  skill: "bro",
  turns: [
    {
      prompt: "解释一下这个工作区里 cache.js 那段缓存失效逻辑是怎么工作的。",
    },
    {
      prompt: "你刚才那段说得太专业了，用大白话、像跟朋友聊天一样再讲一遍，别用术语。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# cache-demo\n\n一个带 30 秒有效期的小缓存工具。\n",
      "cache.js": [
        "const store = new Map();",
        "const TTL_MS = 30_000;",
        "export function get(key, now = Date.now()) {",
        "  const entry = store.get(key);",
        "  if (!entry) return undefined;",
        "  if (now - entry.at > TTL_MS) { store.delete(key); return undefined; }",
        "  return entry.value;",
        "}",
        "export function set(key, value, now = Date.now()) {",
        "  store.set(key, { value, at: now });",
        "}",
        "",
      ].join("\n"),
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "缓存" }],
  rubric: {
    prompt:
      "这是纯文本复述技能（bro），判定复述质量。效果成立的标志：第二轮把上一段关于缓存失效的解释用简单、连贯、少术语的说法重讲一遍，像一个人对另一个人讲话，保留原意且不新增错误（例如仍说清『过期后旧值被丢掉，下次再取就没有了』这类要点）。若仍然堆砌术语、只是照抄原回复、或信息明显失真，记 gap。技能加载只是过程证据，不等于复述效果成立。",
  },
  uiObservations: [
    {
      id: "completed-turns",
      description: "两轮对话都自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到第二轮用大白话重讲的完整回复。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/bro/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
};
