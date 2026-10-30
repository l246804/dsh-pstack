/** Product copy for the pstack role model configuration page. */

import type { LocaleCatalog } from "./i18n.ts";

export const NS = "pstackRoles";

/** Source dictionary: its key set is the contract every locale must satisfy. */
const base = {
  title: "Role model configuration",
  subtitle:
    "Edit $DSH_HOME/pstack-models.mdc without hand-writing role lines. Each save re-reads the live model directory and only changes the role you save.",
  file: "File",
  status: "Status",
  statusMissing: "missing",
  statusLoaded: "loaded",
  statusUnreadable: "unreadable",
  budget: "Budget",
  fileIssues: "File issues",
  line: "Line {line}",
  role: "Role",
  singleRoute: "single route",
  listRoutes: "route list",
  configuredLine: "configured on line {line}",
  notConfigured: "not configured",
  inheritParent: "inherit-parent",
  auto: "auto",
  inheritsParent: "inherits the parent route",
  provider: "Provider",
  unavailable: "unavailable",
  model: "Model",
  effort: "Effort",
  effortUnset: "not set",
  effortDefault: "default ({effort})",
  effortBaselineTitle: "Effort is a baseline, not a fixed value",
  effortBaselineIntro:
    "The effort you choose here is the level this role starts at. It is not fixed: a delegated run can move above or below it.",
  effortRuleRange:
    "Movement stays inside the ladder the selected model declares — the same tokens this dropdown lists (for example low → medium → high) — with no fixed numeric step.",
  effortRuleUp:
    "Raise it when the task is harder than the role preset, such as complex design, concurrency, or algorithm work.",
  effortRuleDown: "Lower it when the remaining work turns mechanical or routine.",
  effortRuleTrigger:
    "A single delegation overrides it with pstack_subagent's reasoningEffort; a running subagent adjusts it with set_reasoning_effort, effective from the next step.",
  effortRuleBoundary:
    'If the model declares no effort, nothing floats. "Not set" means the adapter default.',
  addRoute: "Add route",
  removeRoute: "Remove route",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  reset: "Reset to inherit-parent",
  resetting: "Resetting…",
  resetDone: "Reset to inherit-parent",
  unsaved: "Unsaved changes",
  loadFailed: "Could not read the role configuration: {message}",
  retry: "Retry",
  loading: "Loading role configuration…",
  unreadableBody: "This file cannot be edited until it becomes readable: {reason}",
  noCatalogue: "The live model directory is unavailable; provider and model lists are empty.",
  saveRejected: "Save rejected: {reason}",
  roleIssues: "Role file issue: {message}",
  catalogueUnavailable: "Model directory unavailable",
  truncated: "The model directory was truncated; some providers or models are not listed.",
} as const;

/** Key union registered with the DSH locale namespace table. */
export type PstackRolesLocaleKey = keyof typeof base;

/** Complete dictionaries, one entry per supported locale. */
export const catalogs = {
  en: base,
  zh: {
    title: "角色模型配置",
    subtitle:
      "无需手写角色行即可编辑 $DSH_HOME/pstack-models.mdc。每次保存都会重新读取实时模型目录，并只修改你保存的角色。",
    file: "文件",
    status: "状态",
    statusMissing: "缺失",
    statusLoaded: "已加载",
    statusUnreadable: "不可读",
    budget: "预算",
    fileIssues: "文件问题",
    line: "第 {line} 行",
    role: "角色",
    singleRoute: "单路由",
    listRoutes: "路由列表",
    configuredLine: "已配置于第 {line} 行",
    notConfigured: "未配置",
    inheritParent: "继承父级（inherit-parent）",
    auto: "自动（auto）",
    inheritsParent: "继承父级路由",
    provider: "提供方",
    unavailable: "不可用",
    model: "模型",
    effort: "推理强度",
    effortUnset: "未指定",
    effortDefault: "默认（{effort}）",
    effortBaselineTitle: "推理强度是基准值，不是固定值",
    effortBaselineIntro:
      "这里选择的推理强度是该角色的起步值，不是固定值：一次委派可以在它之上或之下浮动。",
    effortRuleRange:
      "只在该模型声明的强度阶梯内上下移动——即这个下拉列出的那组 token（例如 low → medium → high），没有固定的数值幅度。",
    effortRuleUp: "任务比角色预设更难时上调，例如复杂设计、并发或算法工作。",
    effortRuleDown: "剩余工作转为机械、常规时下调。",
    effortRuleTrigger:
      "单次委派用 pstack_subagent 的 reasoningEffort 覆盖；运行中的子代理用 set_reasoning_effort 调整，从下一步生效。",
    effortRuleBoundary: "模型未声明任何 effort 时不浮动；「未指定」即适配器默认。",
    addRoute: "添加路由",
    removeRoute: "删除路由",
    save: "保存",
    saving: "保存中…",
    saved: "已保存",
    reset: "重置为继承父级（inherit-parent）",
    resetting: "重置中…",
    resetDone: "已重置为继承父级（inherit-parent）",
    unsaved: "有未保存的修改",
    loadFailed: "无法读取角色配置：{message}",
    retry: "重试",
    loading: "正在读取角色配置…",
    unreadableBody: "文件可读之前无法编辑：{reason}",
    noCatalogue: "实时模型目录不可用，提供方与模型列表为空。",
    saveRejected: "保存被拒绝：{reason}",
    roleIssues: "角色文件问题：{message}",
    catalogueUnavailable: "模型目录不可用",
    truncated: "模型目录已截断；部分提供方或模型未显示。",
  },
} satisfies LocaleCatalog<PstackRolesLocaleKey>;
