import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-skill-dependency-unslop",
  capability: "skill-dependency.unslop",
  turns: [
    {
      prompt:
        "把下面这段话改成干净、直白、没有 AI 腔的说明，再给我：『综上所述，本功能旨在赋能用户，助力其高效地完成相关操作。』",
    },
  ],
  workspace: {
    files: {
      "README.md": "# skill-dependency.unslop\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户能看到一段去掉空话和 AI 腔的直白改写。原样返回或只做表面替换，记为缺口。",
  },
  uiObservations: [
    {
      id: "dependency-visible",
      description: "浏览器中能看到改写后的文字。",
    },
  ],
};

export default scenario;
