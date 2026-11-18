import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-generated-image",
  capability: "render-generated-image",
  treatments: ["native"],
  environments: ["base", "render"],
  turns: [
    {
      prompt:
        "用白板手绘风格给我画一张示意图，说明请求从入口到返回经过的三个部件。要真的生成图片，不要拿文字或表格代替。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# render-generated-image\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户能看到一张真实生成的图片。只给文字、表格或代码，记为缺口。",
  },
  uiObservations: [
    {
      id: "generated-image",
      description: "浏览器中实际显示生成出来的图片。",
    },
  ],
};

export default scenario;
