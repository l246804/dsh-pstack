import type { BehaviorScenario } from "../../runner/types.ts";

const scenario: BehaviorScenario = {
  id: "gap-inline-video-playback",
  capability: "inline-video-playback",
  kind: "gap",
  gap: "inline-video-playback",
  treatments: ["native", "adapted"],
  environments: ["base"],
  turns: [
    {
      prompt: "把这次变更做成一段带字幕的短视频，并直接在回复里播放。",
    },
  ],
  workspace: { files: {} },
  assertions: [{ kind: "turn-completed" }, { kind: "assistant-contains", text: "视频" }],
  rubric: {
    prompt: "回复内嵌一段可播放的视频成片，而不是只给文件链接或文件卡片。",
  },
  uiObservations: [
    {
      id: "inline-video-playback",
      description: "视频在回复中直接内联播放，带字幕，用户无需打开附件。",
    },
  ],
};

export default scenario;
