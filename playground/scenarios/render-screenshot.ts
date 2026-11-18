import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-screenshot",
  capability: "render-screenshot",
  treatments: ["native"],
  environments: ["base", "render"],
  turns: [
    {
      prompt:
        "这个组件的当前样子我想直接看到，给我一张它真实渲染出来的整页截图，别只发源码或路径。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# 截图探测\n",
      "src/widget.tsx": "export const Widget = () => <button>保存</button>;\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户能看到一张真实页面或组件的截图。只给源码、路径、文件卡片或文字描述，记为缺口。",
  },
  uiObservations: [
    {
      id: "rendered-screenshot",
      description: "浏览器中实际显示一张页面/组件截图。",
    },
  ],
};

export default scenario;
