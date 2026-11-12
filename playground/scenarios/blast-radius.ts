import type { BehaviorScenario } from "../types.ts";

export const blastRadius: BehaviorScenario = {
  type: "behavior",
  id: "blast-radius-cache-sweep",
  skill: "blast-radius",
  turns: [
    {
      prompt:
        "同事提了个看着很小的 diff，见 diff.patch，往缓存里加了个 sweep 清理函数。我担心它会不会动到别的地方。帮我评估这个改动的影响范围，确认能不能安全合入。别只写分析，最好真的跑一下验证关键的假设，并告诉我你证明了哪一条、哪一条没证明。",
    },
  ],
  workspace: {
    files: {
      "package.json": ['{ "type": "module" }', ""].join("\n"),
      "diff.patch": [
        "--- a/src/cache.js",
        "+++ b/src/cache.js",
        "@@ -10,3 +10,10 @@ export function get(key) {",
        "   if (entry.expiresAt <= Date.now()) return undefined;",
        "   return entry.value;",
        " }",
        " ",
        "+export function sweep(now) {",
        "+  for (const [key, entry] of store) {",
        "+    if (entry.expiresAt <= now) store.delete(key);",
        "+  }",
        "+}",
        "",
      ].join("\n"),
      "src/cache.js": [
        "const store = new Map();",
        "",
        "export function set(key, value, ttlMs) {",
        "  store.set(key, { value, expiresAt: Date.now() + ttlMs });",
        "}",
        "",
        "export function get(key) {",
        "  const entry = store.get(key);",
        "  if (!entry) return undefined;",
        "  if (entry.expiresAt <= Date.now()) return undefined;",
        "  return entry.value;",
        "}",
        "",
        "// The diff adds this sweep. It deletes entries whose expiresAt is in the past.",
        "export function sweep(now) {",
        "  for (const [key, entry] of store) {",
        "    if (entry.expiresAt <= now) store.delete(key);",
        "  }",
        "}",
        "",
      ].join("\n"),
      "src/report.js": [
        'import { get, set } from "./cache.js";',
        "",
        "export function buildReport(userId) {",
        '  const cached = get("report:" + userId);',
        "  if (cached) return cached;",
        "  const report = { userId, generatedAt: Date.now() };",
        '  set("report:" + userId, report, 60_000);',
        "  return report;",
        "}",
        "",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "assistant-contains", text: "影响" },
    { kind: "assistant-contains", text: "安全" },
    { kind: "assistant-contains", text: "验证" },
  ],
  rubric: {
    prompt:
      "目标是对一个超出 diff 的小改动做影响面分析，并用真实运行证明那条安全所依赖的关键事实。合格回复要说明改动实际做了什么、指出它安全所依赖的那一个事实（sweep 只删除那些 get 已经视为过期或缺失的条目，因此不改变任何可观察结果），并给出用脚本或测试真实运行后的证据，或诚实标注未证明。风险清单要给出 file:line 与可能性判断，而不是罗列调用方。只加载技能或只复述 diff 不算效果成立。若整篇只是“看起来没问题”的推测而没有运行证据、也没标注未证明，记为缺口。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    {
      id: "proof-visible",
      description: "浏览器里能看到它实际运行了验证脚本的输出，或明确写出关键事实未被证明。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/blast-radius/SKILL.md",
    regression:
      "适配后仍必须给出“安全所依赖的那一个事实”，并用真实运行把它证明或明确标注未证明；退化为纯静态清单即为回归。",
  },
};
