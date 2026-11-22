/** Copy for the pstack plugin configuration dialog. */

const en = {
  configureAction: "Configure",
  dialogTitle: "Configure Pstack",
  tabsLabel: "Configuration sections",
  tabPlugins: "Recommended plugins",
  tabRoles: "Role models",
  tabGeneral: "General",
  tabMaintenance: "Repair",
  maintenanceTitle: "Legacy session repair (poteto/mode)",
  maintenanceDescription:
    "Older versions wrote the Poteto switch as a poteto/mode session event. New DSH builds reject this unknown event and refuse to load the session history. Scan, remove any session you want to keep untouched, then repair the rest after restarting DSH.",
  maintenanceOpen: "Scan and repair",
  maintenanceScan: "Scan sessions",
  maintenanceScanning: "Scanning...",
  maintenanceScanEmpty: "No sessions need repair.",
  maintenanceScanFailed: "Could not scan sessions: {message}",
  maintenanceSelectedCount: "{count} selected",
  maintenanceRepair: "Repair selected sessions",
  maintenanceQueued: "Queued {count} sessions. Restart DSH to repair them.",
  maintenanceRepairSuccess: "Repaired {count} sessions.",
  maintenanceRepairPartial: "Repaired {repaired} sessions; {failed} failed.",
  maintenanceRepairFailed: "Repair failed: {message}",
  maintenanceWorkspaceUnknown: "Unassigned workspace",
  maintenanceEnabled: "Switch on",
  maintenanceDisabled: "Switch off",
  maintenanceEventCount: "{count} events",
} as const;

const zh = {
  configureAction: "配置",
  dialogTitle: "配置 Pstack",
  tabsLabel: "配置分区",
  tabPlugins: "推荐插件",
  tabRoles: "角色模型",
  tabGeneral: "通用",
  tabMaintenance: "修复",
  maintenanceTitle: "旧会话修复（poteto/mode）",
  maintenanceDescription:
    "旧版本的 Poteto 开关曾写成 poteto/mode 会话事件。新版 DSH 读到这个未知事件会拒绝加载整份会话历史。扫描后可以移除不想修复的会话，其余会话在重启 DSH 后自动修复。",
  maintenanceOpen: "扫描并修复",
  maintenanceScan: "扫描会话",
  maintenanceScanning: "扫描中...",
  maintenanceScanEmpty: "没有需要修复的会话。",
  maintenanceScanFailed: "扫描会话失败：{message}",
  maintenanceSelectedCount: "已选择 {count} 个",
  maintenanceRepair: "修复选中会话",
  maintenanceQueued: "已加入修复队列（{count} 个会话）。请重启 DSH 完成修复。",
  maintenanceRepairSuccess: "已修复 {count} 个会话。",
  maintenanceRepairPartial: "已修复 {repaired} 个会话，失败 {failed} 个。",
  maintenanceRepairFailed: "修复失败：{message}",
  maintenanceWorkspaceUnknown: "未指定工作区",
  maintenanceEnabled: "开关已开启",
  maintenanceDisabled: "开关已关闭",
  maintenanceEventCount: "{count} 个事件",
} as const satisfies Record<keyof typeof en, string>;

export type ConfigKey = keyof typeof en;

export const config = { en, zh } as const;
