/** Product copy for the pstack role model configuration page. */

import type { LocaleCatalog } from "./i18n.ts";

export const NS = "pstackRoles";

/** Source dictionary: its key set is the contract every locale must satisfy. */
const base = {
  title: "Role model configuration",
  subtitle: "Edit $DSH_HOME/pstack-models.mdc. Saving a role changes only that role.",
  file: "File",
  status: "Status",
  statusMissing: "missing",
  statusLoaded: "loaded",
  statusUnreadable: "unreadable",
  budget: "Budget",
  fileIssues: "File issues",
  line: "Line {line}",
  role: "Role",
  configuredLine: "line {line}",
  notConfigured: "not configured",
  inheritParent: "inherit-parent",
  auto: "auto",
  provider: "Provider",
  unavailable: "unavailable",
  model: "Model",
  effort: "Effort",
  effortUnset: "not set",
  effortDefault: "default ({effort})",
  effortBaselineTitle: "Effort adapts to the task",
  effortBaselineIntro:
    "This is the starting level. It can move up or down as the task changes in difficulty; it is not fixed.",
  addRoute: "Add route",
  removeRoute: "Remove route",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  reset: "Reset",
  resetting: "Resetting…",
  loadFailed: "Could not read the role configuration: {message}",
  retry: "Retry",
  loading: "Loading role configuration…",
  unreadableBody: "This file cannot be edited until it becomes readable: {reason}",
  noCatalogue: "The live model directory is unavailable; provider and model lists are empty.",
  saveRejected: "Save rejected: {reason}",
  roleIssues: "Role file issue: {message}",
  catalogueUnavailable: "Model directory unavailable",
  truncated: "The model directory was truncated; some providers or models are not listed.",
  roleFeatureRefactoringName: "Feature & refactoring",
  roleFeatureRefactoringDescription: "For new features and code refactoring.",
  roleBugFixName: "Bug fix",
  roleBugFixDescription: "For diagnosing and fixing defects.",
  rolePerfIssueName: "Performance",
  rolePerfIssueDescription: "For investigating and fixing performance issues.",
  roleHillclimbName: "Hillclimb",
  roleHillclimbDescription: "For iterative improvements guided by measurable results.",
  roleJudgmentAndProseName: "Judgment & prose",
  roleJudgmentAndProseDescription: "For judgment calls, writing, and refining prose.",
  roleHardestTasksName: "Hardest tasks",
  roleHardestTasksDescription:
    "For complex design, concurrency, algorithms, and other difficult tasks.",
  roleHowExplorerName: "How · explorer",
  roleHowExplorerDescription: "For exploring code and tracing how a system works.",
  roleHowExplainerName: "How · explainer",
  roleHowExplainerDescription: "For explaining architecture and runtime behavior.",
  roleWhyInvestigatorsName: "Why · investigators",
  roleWhyInvestigatorsDescription: "For gathering evidence about decisions and their rationale.",
  roleWhySynthesizerName: "Why · synthesizer",
  roleWhySynthesizerDescription: "For synthesizing evidence into a cited explanation.",
  roleReflectToolingName: "Reflect · tooling",
  roleReflectToolingDescription: "For reviewing tooling lessons from the current session.",
  roleReflectJudgmentDivergentSynthesizerName: "Reflect · judgment & synthesis",
  roleReflectJudgmentDivergentSynthesizerDescription:
    "For reviewing judgments, challenging conclusions, and synthesizing lessons.",
  roleArenaRunnersName: "Arena · runners",
  roleArenaRunnersDescription: "For generating competing candidates in parallel.",
  roleArenaCrossJudgePoolName: "Arena · judges",
  roleArenaCrossJudgePoolDescription: "For independently comparing Arena candidates.",
  roleSwarmWorkersName: "Swarm · workers",
  roleSwarmWorkersDescription: "For parallel implementation and verification tasks.",
  roleArchitectRunnersName: "Architect · runners",
  roleArchitectRunnersDescription: "For proposing competing designs before implementation.",
  roleInterrogateReviewersName: "Interrogate · reviewers",
  roleInterrogateReviewersDescription: "For adversarial review of changes and designs.",
} as const;

/** Key union registered with the DSH locale namespace table. */
export type PstackRolesLocaleKey = keyof typeof base;

type RoleTranslate = (key: PstackRolesLocaleKey) => string;

/** Role keys map to the exact locale keys that name and describe them. */
const roleCopyKeys: Readonly<
  Record<
    string,
    { readonly name: PstackRolesLocaleKey; readonly description: PstackRolesLocaleKey }
  >
> = {
  "feature, refactoring": {
    name: "roleFeatureRefactoringName",
    description: "roleFeatureRefactoringDescription",
  },
  "bug-fix": { name: "roleBugFixName", description: "roleBugFixDescription" },
  "perf-issue": { name: "rolePerfIssueName", description: "rolePerfIssueDescription" },
  hillclimb: { name: "roleHillclimbName", description: "roleHillclimbDescription" },
  "judgment and prose": {
    name: "roleJudgmentAndProseName",
    description: "roleJudgmentAndProseDescription",
  },
  "hardest tasks": { name: "roleHardestTasksName", description: "roleHardestTasksDescription" },
  "how explorer": { name: "roleHowExplorerName", description: "roleHowExplorerDescription" },
  "how explainer": { name: "roleHowExplainerName", description: "roleHowExplainerDescription" },
  "why investigators": {
    name: "roleWhyInvestigatorsName",
    description: "roleWhyInvestigatorsDescription",
  },
  "why synthesizer": {
    name: "roleWhySynthesizerName",
    description: "roleWhySynthesizerDescription",
  },
  "reflect tooling": {
    name: "roleReflectToolingName",
    description: "roleReflectToolingDescription",
  },
  "reflect judgment, divergent, synthesizer": {
    name: "roleReflectJudgmentDivergentSynthesizerName",
    description: "roleReflectJudgmentDivergentSynthesizerDescription",
  },
  "arena runners": { name: "roleArenaRunnersName", description: "roleArenaRunnersDescription" },
  "arena cross-judge pool": {
    name: "roleArenaCrossJudgePoolName",
    description: "roleArenaCrossJudgePoolDescription",
  },
  "swarm workers": { name: "roleSwarmWorkersName", description: "roleSwarmWorkersDescription" },
  "architect runners": {
    name: "roleArchitectRunnersName",
    description: "roleArchitectRunnersDescription",
  },
  "interrogate reviewers": {
    name: "roleInterrogateReviewersName",
    description: "roleInterrogateReviewersDescription",
  },
};

/** Complete dictionaries, one entry per supported locale. */
export const catalogs = {
  en: base,
  zh: {
    title: "角色模型配置",
    subtitle: "编辑 $DSH_HOME/pstack-models.mdc。每次保存只改动你保存的那个角色。",
    file: "文件",
    status: "状态",
    statusMissing: "缺失",
    statusLoaded: "已加载",
    statusUnreadable: "不可读",
    budget: "预算",
    fileIssues: "文件问题",
    line: "第 {line} 行",
    role: "角色",
    configuredLine: "第 {line} 行",
    notConfigured: "未配置",
    inheritParent: "继承父级",
    auto: "自动",
    provider: "提供方",
    unavailable: "不可用",
    model: "模型",
    effort: "推理强度",
    effortUnset: "未指定",
    effortDefault: "默认（{effort}）",
    effortBaselineTitle: "推理强度随任务难度调整",
    effortBaselineIntro: "这里选择的是起步值，实际强度会根据任务难度上下浮动，不是固定值。",
    addRoute: "添加路由",
    removeRoute: "删除路由",
    save: "保存",
    saving: "保存中…",
    saved: "已保存",
    reset: "重置",
    resetting: "重置中…",
    loadFailed: "无法读取角色配置：{message}",
    retry: "重试",
    loading: "正在读取角色配置…",
    unreadableBody: "文件可读之前无法编辑：{reason}",
    noCatalogue: "实时模型目录不可用，提供方与模型列表为空。",
    saveRejected: "保存被拒绝：{reason}",
    roleIssues: "角色文件问题：{message}",
    catalogueUnavailable: "模型目录不可用",
    truncated: "模型目录已截断；部分提供方或模型未显示。",
    roleFeatureRefactoringName: "功能开发与重构",
    roleFeatureRefactoringDescription: "用于新功能开发和代码重构。",
    roleBugFixName: "缺陷修复",
    roleBugFixDescription: "用于定位并修复缺陷。",
    rolePerfIssueName: "性能优化",
    rolePerfIssueDescription: "用于排查并解决性能问题。",
    roleHillclimbName: "迭代优化",
    roleHillclimbDescription: "用于根据可量化的结果持续改进。",
    roleJudgmentAndProseName: "判断与文字",
    roleJudgmentAndProseDescription: "用于需要判断、写作或润色的任务。",
    roleHardestTasksName: "高难度任务",
    roleHardestTasksDescription: "用于复杂设计、并发、算法等高难度任务。",
    roleHowExplorerName: "How · 代码探索",
    roleHowExplorerDescription: "用于探索代码，梳理系统的工作方式。",
    roleHowExplainerName: "How · 原理讲解",
    roleHowExplainerDescription: "用于解释架构和运行流程。",
    roleWhyInvestigatorsName: "Why · 证据调查",
    roleWhyInvestigatorsDescription: "用于调查决策依据并收集证据。",
    roleWhySynthesizerName: "Why · 证据综合",
    roleWhySynthesizerDescription: "用于综合证据，形成有出处的解释。",
    roleReflectToolingName: "Reflect · 工具复盘",
    roleReflectToolingDescription: "用于复盘当前会话中的工具使用经验。",
    roleReflectJudgmentDivergentSynthesizerName: "Reflect · 判断与综合",
    roleReflectJudgmentDivergentSynthesizerDescription: "用于复盘判断、挑战结论并综合经验。",
    roleArenaRunnersName: "Arena · 候选方案",
    roleArenaRunnersDescription: "用于并行生成相互竞争的候选方案。",
    roleArenaCrossJudgePoolName: "Arena · 交叉评审",
    roleArenaCrossJudgePoolDescription: "用于独立比较 Arena 的候选方案。",
    roleSwarmWorkersName: "Swarm · 并行执行",
    roleSwarmWorkersDescription: "用于并行执行实现和验证任务。",
    roleArchitectRunnersName: "Architect · 方案设计",
    roleArchitectRunnersDescription: "用于在实现前并行提出候选设计。",
    roleInterrogateReviewersName: "Interrogate · 对抗评审",
    roleInterrogateReviewersDescription: "用于对改动或设计进行对抗性评审。",
  },
} satisfies LocaleCatalog<PstackRolesLocaleKey>;

/** Localized role name and usage, keyed by the exact role-file key. */
export function rolePresentation(
  key: string,
  t: RoleTranslate,
): { readonly name: string; readonly description: string } {
  const copy = roleCopyKeys[key];
  return copy === undefined
    ? { name: key, description: "" }
    : { name: t(copy.name), description: t(copy.description) };
}
