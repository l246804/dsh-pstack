import type { BehaviorScenario } from "../types.ts";

export const principleNeverBlockOnTheHuman: BehaviorScenario = {
  type: "behavior",
  id: "principle-never-block-on-the-human-apply",
  skill: "principle-never-block-on-the-human",
  turns: [
    {
      prompt:
        "notes.md 里的部署说明又旧又重复，测试命令也还是 npm。按项目现在的实际情况整理成一段准确、不重复的说明。",
    },
  ],
  workspace: {
    files: {
      "package.json":
        '{\n  "name": "demo",\n  "private": true,\n  "packageManager": "pnpm@9.12.0",\n  "scripts": {\n    "build": "vp run build",\n    "test": "vp run test"\n  }\n}\n',
      "notes.md":
        "# 项目笔记\n\n## 部署（旧）\n1. npm install\n2. npm run build\n\n## 测试\n跑 npm test。\n\n## 部署（旧副本）\n1. npm install\n2. npm run build\n3. 手动上传 dist\n",
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-contains", path: "notes.md", text: "pnpm" },
  ],
  rubric: {
    prompt:
      "回复应真正应用该原则推理：这是可逆的文档整理工作，包管理器与命令可从 package.json（packageManager 为 pnpm、脚本用 vp）直接观察到，因此应自行读取依据并完成编辑、再呈现结果，而不是停下来问用户'到底用哪个命令'或'保留哪一段'。若助手在动手前反问即记 gap。只喊口号记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    { id: "completed-turn", description: "会话自然结束，回复呈现已完成的文档整理结果。" },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-never-block-on-the-human/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
