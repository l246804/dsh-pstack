/** Product copy for the pstack recommended optional plugins section. */

import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";

import type { LocaleCatalog } from "./i18n.ts";

export const NS = "pstackPlugins";

/** Source dictionary: its key set is the contract every locale must satisfy. */
const base = {
  configureAction: "Configure",
  configureTitle: "Configure dsh-pstack",
  configureSections: "Configuration sections",
  configurePluginsSection: "Recommended plugins",
  configureRolesSection: "Role configuration",
  configureClose: "Close",
  optionalPluginsTitle: "Recommended plugins",
  optionalPluginsSubtitle:
    "Optional DSH plugins that complete pstack flows. Nothing is enabled automatically; turn on only what you need.",
  groupSessions: "Sessions and isolation",
  groupVerification: "Verification and evidence",
  groupMultiAgent: "Multi-agent",
  recommendedTag: "Recommended",
  suggestedTag: "GitHub PR suggestion",
  conflictTag: "Conflict",
  optionalLoading: "Loading optional plugin status…",
  optionalLoadFailed: "Could not read optional plugin status: {message}",
  optionalRetry: "Retry",
  optionalRefresh: "Refresh",
  enableRecommended: "Enable recommended plugins",
  enablingRecommended: "Enabling recommended plugins…",
  recommendedSummary:
    "{applied} applied, {restart} need a restart, {failed} failed, {skipped} skipped",
  recommendedHint: "Default recommendations: OPT-01, OPT-06.",
  enablePlugin: "Enable",
  disablePlugin: "Disable",
  pluginWorking: "Working…",
  pluginStatusEnabled: "enabled",
  pluginStatusOff: "off",
  pluginStatusMissing: "missing",
  pluginStatusUnsupportedPlatform: "unsupported-platform",
  pluginStatusError: "error",
  resultApplied: "Applied",
  resultRestartRequired: "Restart required",
  resultFailed: "Failed: {reason}",
  resultOverridden: "Overridden by a higher layer",
  resultCancelled: "Cancelled",
  conflictWarning:
    "Do not enable Agent Teams and pstack_subagent in one profile: Agent Teams disables subagent and subagent_fork and replaces the child controls.",
  nonBundleGuidance:
    "Not a bundle: configure it in the DSH documentation; this page cannot switch it.",
  guidanceTitle: "{count} recommended plugins are still off",
  guidanceOpen: "Review recommended plugins",
  guidanceDismiss: "Dismiss",
  opt01Title: "Worktree isolation",
  opt01Detail:
    "Creates local worktrees for /arena, /swarm, and /architect; the worktree tool changes the Session directory.",
  opt02Title: "GitHub PR workspace",
  opt02Detail:
    "PR panels, checks, reviews, ready state, and merge for /babysit, /shipping, and /autopilot-*; needs a logged-in gh.",
  opt03Title: "Browser verification",
  opt03Detail:
    "Browser navigation, input, screenshots, and ARIA snapshots; pick one provider and a supported model.",
  opt04Title: "Computer use",
  opt04Detail:
    "macOS desktop clicking, typing, screenshots, and permission pages in a PTC Session.",
  opt05Title: "Persistent terminal",
  opt05Detail:
    "Six global terminal tools keep a shell or REPL alive across calls for CLI and TUI verification.",
  opt06Title: "Session search",
  opt06Detail: "Five read-only tools search and trace earlier Sessions with the same cwd.",
  opt07Title: "MCP client",
  opt07Detail: "Mounts MCP servers as mcp__<server>__<tool> for /why and /teach evidence work.",
  opt08Title: "Agent Teams",
  opt08Detail:
    "Lead and teammate roles, a shared task board, and nine team tools; conflicts with pstack_subagent.",
  opt09Title: "Ralph loop",
  opt09Detail: "A foreground ralph loop starts a fresh child each round for /autonomous-run.",
} as const;

/** Key union registered with the DSH locale namespace table. */
export type PstackPluginsLocaleKey = keyof typeof base;

/** Translation function supplied by the pstackPlugins locale namespace. */
export type PstackPluginsTranslate = TranslateNS<typeof NS>;

/** Complete dictionaries, one entry per supported locale. */
export const catalogs = {
  en: base,
  zh: {
    configureAction: "配置",
    configureTitle: "配置 dsh-pstack",
    configureSections: "配置分区",
    configurePluginsSection: "推荐插件",
    configureRolesSection: "角色配置",
    configureClose: "关闭",
    optionalPluginsTitle: "推荐插件",
    optionalPluginsSubtitle:
      "补全 pstack 流程的可选 DSH 插件。页面不会自动启用任何插件，只按需开启。",
    groupSessions: "会话与隔离",
    groupVerification: "验证与证据",
    groupMultiAgent: "多代理",
    recommendedTag: "推荐",
    suggestedTag: "GitHub PR 用户建议",
    conflictTag: "冲突",
    optionalLoading: "正在读取可选插件状态…",
    optionalLoadFailed: "无法读取可选插件状态：{message}",
    optionalRetry: "重试",
    optionalRefresh: "刷新",
    enableRecommended: "一键启用推荐项",
    enablingRecommended: "正在启用推荐项…",
    recommendedSummary:
      "成功 {applied} 项，需重启 {restart} 项，失败 {failed} 项，跳过 {skipped} 项",
    recommendedHint: "默认推荐 OPT-01、OPT-06。",
    enablePlugin: "启用",
    disablePlugin: "关闭",
    pluginWorking: "处理中…",
    pluginStatusEnabled: "已启用",
    pluginStatusOff: "未启用",
    pluginStatusMissing: "缺失",
    pluginStatusUnsupportedPlatform: "平台不支持",
    pluginStatusError: "错误",
    resultApplied: "已生效",
    resultRestartRequired: "需要重启",
    resultFailed: "失败：{reason}",
    resultOverridden: "被更高层覆盖",
    resultCancelled: "已取消",
    conflictWarning:
      "不要在同一 profile 中同时启用 Agent Teams 与 pstack_subagent：Agent Teams 会禁用 subagent 和 subagent_fork，并替换子代理控制。",
    nonBundleGuidance: "非 bundle 项：请按 DSH 文档配置，本页不提供开关。",
    guidanceTitle: "还有 {count} 个推荐插件未开启",
    guidanceOpen: "查看推荐插件",
    guidanceDismiss: "忽略",
    opt01Title: "工作树隔离",
    opt01Detail:
      "为 /arena、/swarm 和 /architect 创建本地工作树；worktree 工具会切换 Session 目录。",
    opt02Title: "GitHub PR 工作区",
    opt02Detail:
      "提供 PR 面板、checks、review、mark ready 与 merge，服务 /babysit、/shipping 和 /autopilot-*；需要已登录的 gh。",
    opt03Title: "浏览器验证",
    opt03Detail: "提供浏览器导航、输入、截图和 ARIA 快照；需选择一个提供方和受支持的模型。",
    opt04Title: "桌面操作",
    opt04Detail: "在 PTC Session 中操作 macOS 应用，支持点击、输入、截图与权限页。",
    opt05Title: "常驻终端",
    opt05Detail: "六个全局终端工具让 shell 或 REPL 跨调用保持存活，服务 CLI 与 TUI 验证。",
    opt06Title: "会话搜索",
    opt06Detail: "五个只读工具按相同 cwd 搜索和追踪历史 Session。",
    opt07Title: "MCP 客户端",
    opt07Detail:
      "挂载 MCP server，工具以 mcp__<server>__<tool> 出现在 /why 和 /teach 的证据调查中。",
    opt08Title: "Agent Teams",
    opt08Detail: "Lead/teammate 角色、共享任务板和九个团队工具；与 pstack_subagent 冲突。",
    opt09Title: "Ralph 循环",
    opt09Detail: "前台 ralph 循环每轮启动新子代理，服务 /autonomous-run。",
  },
} satisfies LocaleCatalog<PstackPluginsLocaleKey>;
