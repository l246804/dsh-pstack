export const POLL_INTERVAL_MS = 2_000;
export const SETTLE_WINDOW_MS = 5_000;
export const TURN_TIMEOUT_MS = 180_000;
/** Async subagents can outlive the main turn; capture waits for them to finish. */
export const SUBAGENT_TIMEOUT_MS = 600_000;
export const DEFAULT_ANSWER_TEXT = "按你的最佳判断继续";

export const UI_LABELS = {
  composerSelector: '[data-composer-input="true"]',
  newSession: "新会话",
  previewNotice: "预览版说明",
  continue: "继续",
} as const;

export const PRESET_LABELS: Record<string, string[]> = {
  "poteto-mode": ["Poteto 模式", "Poteto mode"],
  standard: ["标准模式", "Standard mode"],
};
