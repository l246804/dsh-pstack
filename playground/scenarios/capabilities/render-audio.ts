import type { BehaviorScenario } from "../../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-audio",
  capability: "render-audio",
  treatments: ["native"],
  turns: [
    {
      prompt:
        "把这次改动的要点做成一段能用音频播放的简短播报给我，要真的能播放，不要只给文字稿或链接。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# render-audio\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt: "用户能看到一段真实可播放的音频。只给文字稿或链接、没有可播放音频，记为缺口。",
  },
  uiObservations: [
    {
      id: "audio-playable",
      description: "浏览器中实际显示并可以播放这段音频。",
    },
  ],
};

export default scenario;
