import type { BehaviorScenario } from "../types.ts";

export const typescriptBestPractices: BehaviorScenario = {
  type: "behavior",
  id: "typescript-best-practices-user-state",
  skill: "typescript-best-practices",
  turns: [
    {
      prompt:
        "src/user.ts 的类型太松了，既有 any 又有 as，还用一堆可选字段表示加载状态，改起来很容易出错。帮我按 TypeScript 的类型最佳实践收紧，让非法状态根本写不出来，同时保持运行时行为不变。",
    },
  ],
  workspace: {
    files: {
      "src/user.ts": [
        "type LoadState = {",
        "  loading: boolean;",
        "  data?: { id: string; name: string };",
        "  error?: string;",
        "};",
        "",
        "export function parseUser(input: any): { id: string; name: string } {",
        "  return input as { id: string; name: string };",
        "}",
        "",
        "export function renderUser(state: LoadState): string {",
        '  if (state.loading) return "loading";',
        '  if (state.error) return "error: " + state.error;',
        "  return state.data!.name;",
        "}",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "src/user.ts", text: "unknown" },
    { kind: "assistant-contains", text: "类型" },
  ],
  rubric: {
    prompt:
      "目标是把松散类型收紧到非法状态无法表示。合格结果要：把外部输入从 any 改为 unknown 并在边界校验/解析成命名类型，去掉未校验的 as 与 data! 断言，用带 kind 字面量判别式的联合类型替代 loading/data/error 这种可选字段袋，并在 default 或分支里体现穷尽性；运行时渲染行为保持不变。只加载技能、或只把 any 换成 unknown 却仍保留可选字段袋和 as，不算效果成立。若非法组合仍可构造，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "typed-file-visible",
      description:
        "工作区能看到 src/user.ts 出现判别联合（kind）与 unknown 边界校验，assistant 说明了取舍。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/typescript-best-practices/SKILL.md",
    regression:
      "适配后仍要把 any 收成 unknown、把可选字段袋换成带 kind 的判别联合并移除未校验的 as；只要非法状态还能构造即为回归。",
  },
};
