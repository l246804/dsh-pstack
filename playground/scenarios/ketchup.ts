import type { BehaviorScenario } from "../types.ts";

export const ketchupRecapActionItems: BehaviorScenario = {
  type: "behavior",
  id: "ketchup-recap-action-items",
  skill: "ketchup",
  turns: [
    {
      prompt: "先读一下当前工作区，把这个项目是做什么的、主要文件有哪些，用几句话讲清楚。",
    },
    {
      prompt:
        "现在帮我回顾一下，从我上一条消息之后，这个会话里都发生了什么变化、现在是什么状态，还有哪些事情在等我决定，用大白话讲，别堆术语。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# notes-app\n\n一个记录待办的小项目。入口在 src/app.js，测试在 test/。\n",
      "package.json": '{\n  "name": "notes-app",\n  "version": "0.1.0",\n  "type": "module"\n}\n',
      "src/app.js":
        "export function addNote(notes, text) {\n  return [...notes, { text, done: false }];\n}\n",
      "test/app.test.js":
        'import test from "node:test";\nimport assert from "node:assert";\nimport { addNote } from "../src/app.js";\n\ntest("adds a note", () => {\n  assert.equal(addNote([], "hi").length, 1);\n});\n',
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "变化" }],
  rubric: {
    prompt:
      "这是回顾类技能（ketchup），且对话有前置内容。效果成立的标志：回复以上一条用户消息为起点，用简短白话总结这之后发生了什么、每件事对用户意味着什么（说『测试通过』而不是『CI 绿』），并用一句话点出此刻是否有事情在等用户决定；若有，逐条给出需要用户拍板的决定和你的建议，若没有，明确说没有。只罗列工具调用、文件路径、哈希、构建号等实现细节，或编造并不存在的待办，都记为 gap。技能是否被加载是过程证据，不等于回顾效果成立。",
  },
  uiObservations: [
    {
      id: "completed-turns",
      description: "两轮对话都自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到第二轮针对回顾请求的完整回复，含变化摘要与待用户决定的事项。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/ketchup/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
};
