import type { BehaviorScenario } from "../types.ts";

const scenario: BehaviorScenario = {
  id: "capability-render-video",
  capability: "render-video",
  treatments: ["native"],
  environments: ["base", "render"],
  turns: [
    {
      prompt:
        "把这次改动做成一段带字幕的短视频总结，并且要我在当前界面里直接看到能播放的视频，不要只给文件卡片、文字脚本或链接。",
    },
  ],
  workspace: {
    files: {
      "README.md": "# render-video\n\n能力探测。\n",
    },
  },
  assertions: [
    {
      kind: "turn-completed",
    },
  ],
  rubric: {
    prompt:
      "用户在当前界面内看到可播放的视频，内联播放器能实际播放。只有文件卡片、文字或链接，记为缺口。",
  },
  uiObservations: [
    {
      id: "video-playable",
      description: "浏览器中实际显示并可以播放这段视频。",
    },
  ],
};

export default scenario;
