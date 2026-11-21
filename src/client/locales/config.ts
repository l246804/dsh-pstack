/** Copy for the pstack plugin configuration dialog. */

const en = {
  configureAction: "Configure",
  dialogTitle: "Configure Pstack",
  tabsLabel: "Configuration sections",
  tabPlugins: "Recommended plugins",
  tabRoles: "Role models",
  tabGeneral: "General",
  tabMaintenance: "Maintenance",
  maintenanceTitle: "Legacy session repair",
  maintenanceDescription:
    "Scan sessions written before the storageDomain switch. Repairs run automatically after DSH restarts.",
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
  maintenanceRemove: "Remove session",
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
  tabMaintenance: "维护",
  maintenanceTitle: "旧会话修复",
  maintenanceDescription: "扫描 storageDomain 切换前写入的会话，重启 DSH 后自动修复。",
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
  maintenanceRemove: "移除会话",
  maintenanceEnabled: "开关已开启",
  maintenanceDisabled: "开关已关闭",
  maintenanceEventCount: "{count} 个事件",
} as const satisfies Record<keyof typeof en, string>;

export type ConfigKey = keyof typeof en;

export const config = { en, zh } as const;
