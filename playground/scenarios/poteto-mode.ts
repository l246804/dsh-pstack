import type { BehaviorScenario } from "../types.ts";

export const potetoModeFeatureRigor: BehaviorScenario = {
  type: "behavior",
  id: "poteto-mode-feature-rigor",
  skill: "poteto-mode",
  turns: [
    {
      prompt:
        "我在这个工作区维护一个小型命令行工具。现在想加一个功能：把每次运行的耗时记录到本地历史文件里，并能打印最近若干次运行的中位数耗时，以及慢于某个阈值的运行次数。请按你认为合适的方式实现：先把要处理的核心数据和最小改动讲清楚，再动手改，改完之后证明它确实按预期工作。",
    },
  ],
  workspace: {
    files: {
      "package.json":
        '{\n  "name": "runtimer",\n  "version": "1.0.0",\n  "type": "module",\n  "bin": { "runtimer": "src/cli.js" },\n  "scripts": { "start": "node src/cli.js", "test": "node --test" }\n}\n',
      "README.md":
        "# runtimer\n\n一个小型命令行工具。运行 `npm start` 会执行一次模拟任务并打印本次耗时（毫秒）。目前它不保存任何历史。\n",
      "src/cli.js": [
        "const start = Date.now();",
        "let total = 0;",
        "for (let i = 0; i < 3_000_000; i += 1) total += i % 7;",
        "const elapsed = Date.now() - start;",
        "console.log(`run took ${elapsed}ms (checksum ${total})`);",
        "",
      ].join("\n"),
      "test/run.test.js": [
        'import test from "node:test";',
        'import assert from "node:assert";',
        "",
        'test("cli source exports nothing but runs to completion", () => {',
        "  assert.ok(true);",
        "});",
        "",
      ].join("\n"),
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "验证" }],
  rubric: {
    prompt:
      "这是需要严谨工程流程的真实功能请求，走 poteto-mode 风格。效果成立的标志：回复先用一句话复述用户目标并点出满足它的最小改动；编码前先说明要处理的核心数据形状（例如历史记录的字段与存储格式）和承载它的组织方式，而不是直接堆条件分支；实现保持最小、克制，不引入多余抽象；完成后对真实产物做验证（实际运行命令或测试）并给出可核对的证据。仅仅加载或提到技能属于过程证据，不等于效果成立。若回复只泛泛描述、没有数据形状、没有最小改动判断、或没有真实验证，记 gap。",
  },
  uiObservations: [
    {
      id: "completed-turn",
      description: "会话自然结束，没有自动点击停止。",
    },
    {
      id: "response-visible",
      description: "浏览器中能看到针对功能请求的完整回复，含数据形状、最小改动与验证证据。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/poteto-mode/SKILL.md",
    regression: "同一 scenario id 用于 raw 与 adapted 证据",
  },
};
