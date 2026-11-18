import type { BehaviorScenario } from "../../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-mermaid-diagram",
  capability: "render-mermaid-diagram",
  treatments: ["native"],
  turns: [
    {
      prompt:
        "用一个流程图把这三步之间的关系讲清楚：提交、构建、发布。我要看到画出来的图，不要只给我源码文本。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# render-mermaid-diagram\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户能看到一张实际渲染出来的流程图。只有 Mermaid 源码文本、没有渲染结果，记为缺口。",
  },
  uiObservations: [
    {
      id: "mermaid-rendered",
      description: "浏览器中实际显示渲染后的流程图。",
    },
  ],
};

export default scenario;
