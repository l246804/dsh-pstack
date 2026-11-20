import type { BehaviorScenario } from "../runner/types.ts";

export default {
  id: "inline-video-playback",
  kind: "gap",
  gap: "inline-video-playback",
  capability: "inline-video-playback",
  turns: [
    {
      prompt:
        "工作区里的 `assets/sample.mp4` 是一个视频样例。把它直接嵌在回复里播放：我要点开就能看，不要只给我链接或文件卡片。只做这件事：直接试一次，如果做不到内嵌播放，就直接告诉我做不到。",
    },
  ],
  workspace: {
    files: {},
    assets: {
      "assets/sample.mp4": "playground/scenarios/fixtures/sample.mp4",
    },
  },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "sample.mp4" }],
  rubric: {
    prompt:
      "回复中出现一个可直接播放的视频播放器并加载 sample.mp4；只显示链接、文件卡片或下载入口不算通过。",
  },
  uiObservations: [
    {
      id: "inline-video",
      description: "回复内嵌一个可直接播放的视频播放器，而不是链接或文件卡片。",
    },
  ],
} satisfies BehaviorScenario;
