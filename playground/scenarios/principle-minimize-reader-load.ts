import type { BehaviorScenario } from "../types.ts";

export const principleMinimizeReaderLoad: BehaviorScenario = {
  type: "behavior",
  id: "principle-minimize-reader-load-apply",
  skill: "principle-minimize-reader-load",
  turns: [
    {
      prompt:
        "load.ts 里这一串函数读起来要跳好几层：readUser 调 getData，getData 调 loadData，loadData 调 fetchBody，fetchBody 又调 requestRaw，中间还挂着一个模块级 cache。帮我让这个文件更好读一点。",
    },
  ],
  workspace: {
    files: {
      "load.ts":
        "let cache: Record<string, string> | null = null;\n\nfunction requestRaw(url: string): string {\n  return `raw:${url}`;\n}\n\nfunction fetchBody(url: string): string {\n  return requestRaw(url);\n}\n\nfunction loadData(url: string): string {\n  return fetchBody(url);\n}\n\nfunction getData(url: string): string {\n  if (cache && cache[url]) return cache[url];\n  const body = loadData(url);\n  cache = cache ?? {};\n  cache[url] = body;\n  return body;\n}\n\nexport function readUser(id: string): string {\n  return getData(`/users/${id}`);\n}\n",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "包装" }],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：识别一条只有单一调用方的包装链（requestRaw/fetchBody/loadData 层层透传），指出应内联塌缩这些层，并把模块级 cache 的可变状态收窄为局部，从而降低追踪层数与要记住的状态；不是复述技能名字。只喊口号记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复给出针对该模块可读性的判断。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-minimize-reader-load/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
