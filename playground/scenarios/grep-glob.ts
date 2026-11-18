import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-grep-glob",
  capability: "grep-glob",
  turns: [
    {
      prompt: "在这个仓库里找出所有提到部署命令的文件，并把命中的文件和行号给我。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 演示仓库\n\n本仓库介绍工具的用法。\n",
      "docs/deploy.md": "# 部署\n\n运行 `deploy now` 发布。\n",
      "src/config.ts": "export const mode = 'dev';\n",
      "docs/other.md": "# 其他\n\n与部署无关。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户能看到真实存在的命中文件和行号（deploy.md 中提到部署命令的行）。答非所问、凭印象编造行号、或完全没找到，记为缺口。",
  },
  uiObservations: [
    {
      id: "hits-visible",
      description: "浏览器中列出命中的文件名和行号。",
    },
  ],
};

export default scenario;
