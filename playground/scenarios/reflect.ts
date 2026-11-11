import type { BehaviorScenario } from "../types.ts";

export const reflectCompletedSearchWork: BehaviorScenario = {
  type: "behavior",
  id: "reflect-completed-search-work",
  skill: "reflect",
  turns: [
    {
      prompt:
        "回顾我们刚完成的这段工作，提炼能沉淀下来的经验。请给出分类结论：哪些采纳、哪些拒绝、哪些先放待办，并指明每一条要落到哪个技能文件的修改上。先不要直接动文件，等我确认。",
    },
  ],
  workspace: {
    files: {
      "WORK_LOG.md": [
        "# 已完成工作记录：给 Notes 服务加上搜索",
        "",
        "- 在 `src/search.ts` 里实现了按标题和正文搜索。",
        "- 搜索输入防抖一开始用了一个 Set 去重方案，导致第二次输入丢失，后来整段撤销重写。",
        "- 为了把空结果提示居中，手动改了两次 CSS，最后发现应该改父容器的对齐方式。",
        "- 自动化测试只覆盖了标题匹配，正文匹配和空状态都没有测。",
        "- 提交：feat: add search to notes (commit 4f2a9c1)。",
        "",
      ].join("\n"),
      "src/search.ts": [
        "export function searchNotes(notes: { title: string; body: string }[], q: string) {",
        "  const needle = q.trim().toLowerCase();",
        "  if (needle.length === 0) return notes;",
        "  return notes.filter((n) => n.title.toLowerCase().includes(needle) || n.body.toLowerCase().includes(needle));",
        "}",
        "",
      ].join("\n"),
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "技能" }],
  rubric: {
    prompt:
      "回复应把这次已完成工作里可沉淀的经验分类成采纳、拒绝、待办三类，每条指向一个具体技能文件的修改，并在真正改动前等待用户确认，不自动应用。技能加载只是过程证据，不等于效果成立。若只是复述做过的事而没有分类结论、没有落到具体技能文件、或未经确认就改动文件，记为缺口。一次性的偶发问题不应被当成可沉淀经验。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，没有自动点击停止。" },
    { id: "response-visible", description: "浏览器中能看到采纳/拒绝/待办分类结论的完整回复。" },
    { id: "awaiting-approval", description: "回复停在等待确认处，没有直接改动技能文件。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/reflect/SKILL.md",
    regression: "new coverage; same scenario id is used for raw and adapted evidence",
  },
};
