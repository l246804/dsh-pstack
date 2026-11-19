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
      prompt: [
        "不要读取 DSH 安装目录或修改项目源码。读取 `assets/video-brief.md`，按要求生成一段带字幕的短视频成片 `output/summary.mp4`。",
        "在回复中直接内联播放这段成片，让用户不需要打开附件或文件卡片；不要只给文件路径。",
        "如果环境缺少生成视频的工具，明确说明缺失并停止，不要伪造一个不可播放的文件。",
      ].join("\n"),
    },
  ],
  workspace: {
    files: {
      "assets/video-brief.md": [
        "# 视频要求",
        "",
        "- 时长 3 到 5 秒。",
        "- 画面包含文字 `Playground`。",
        "- 带中文字幕。",
        "- 输出 `output/summary.mp4`。",
      ].join("\n"),
    },
  },
  assertions: [
    { kind: "turn-completed" },
    { kind: "artifact-dir-nonempty", path: "output" },
    { kind: "assistant-contains", text: "视频" },
  ],
  rubric: {
    prompt:
      "回复中直接内联播放一段可播放的 mp4 成片，带字幕；不是文件卡片、下载链接或只有文字说明。",
  },
  uiObservations: [
    {
      id: "inline-video-playback",
      description: "视频在回复中直接内联播放，带字幕；用户无需点击附件或打开外部页面。",
    },
  ],
};

export default scenario;
