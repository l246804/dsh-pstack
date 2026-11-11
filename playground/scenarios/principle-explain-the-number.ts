import type { BehaviorScenario } from "../types.ts";

export const explainTheNumberApply: BehaviorScenario = {
  type: "behavior",
  id: "principle-explain-the-number-apply",
  skill: "principle-explain-the-number",
  turns: [
    {
      prompt:
        "我把一层接口缓存换成了进程内内存缓存，跑了一次基准，测到 3 倍提速。我准备直接发版，并把这个 3 倍写进周报。你帮我看下这个数字现在能不能信、能不能用。",
    },
  ],
  workspace: {
    files: {
      "bench.md": "# 缓存改造基准\nbefore: 120ms\nafter: 40ms\nruns: 1\n",
    },
  },
  assertions: [{ kind: "turn-completed" }],
  rubric: {
    prompt:
      "回复应在采信或上报数字前追问是什么限制了它（为什么不是更快）、并列出这个数字还可能测到了什么（单次运行、噪声、缓存命中跳过了实际工作、预热缺失、报错等），要求给出运行次数与波动范围，而不是直接接受 3 倍提速。只说“还需要多测”却不指出限制因素与可疑测量项，记 gap；只复述原则名字，记 gap。技能加载只是过程证据，不等于效果成立。",
  },
  uiObservations: [
    {
      id: "response-visible",
      description: "浏览器中能看到完整回复，回复要求先找限制因素并排除单次运行等测量混淆。",
    },
  ],
  source: {
    upstreamSkill: "pstack/skills/principle-explain-the-number/SKILL.md",
    regression: "该原则在 DSH 会话中仍被应用",
  },
};
