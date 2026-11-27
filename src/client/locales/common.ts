/** Shared copy for pstack client surfaces. */

const en = {
  close: "Close",
  cancel: "Cancel",
  refresh: "Refresh",
  retry: "Retry",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  notAvailable: "Not available yet",
} as const;

const zh = {
  close: "关闭",
  cancel: "取消",
  refresh: "刷新",
  retry: "重试",
  save: "保存",
  saving: "保存中…",
  saved: "已保存",
  notAvailable: "暂不可用",
} as const satisfies Record<keyof typeof en, string>;

export type CommonKey = keyof typeof en;

export const common = { en, zh } as const;
