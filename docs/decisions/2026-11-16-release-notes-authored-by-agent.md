# 决策：发布说明由 agent 会话生成并作为发布前置条件

Status: accepted
Date: 2026-11-16
Scope: changes/**, scripts/**, .github/workflows/release.yml, package.json, docs/architecture.md, docs/decisions/**
Implemented-by: commit:0d5b722
Review: 2026-11-22

## 背景

发布说明此前由 `scripts/release-notes.ts` 在发布工作流里从 `port` 产物差异和 `changes/` 注记自动生成，见 [2026-11-15-release-notes-from-artifacts-and-changes.md](./2026-11-15-release-notes-from-artifacts-and-changes.md)。产物差异只能给出 `port/dsh.md` 的行级增删改、工具 schema 和兼容基线的机械变化，`changes/` 注记则依赖人手写全。0.4.0 的正文因此退化成 24 个内部文件路径的软提醒，最大的破坏性变更（角色文件改 JSON、`pstack_subagent` 收缩）一字未提；0.4.1 只有「改动 4 行」的行级 diff。这两类自动信息都回答不了「实现方式变在哪、为什么、结果是什么、有没有破坏性变更」，而只有维护者能说清。

## 决策

- 发布说明改由 agent 会话生成。每次发布前，用户在会话里触发：agent 读上一 tag 到 HEAD 的全量提交，查相关 `docs/decisions` 记录，归纳每条变更的差异、原因、结果、破坏性，逐条与用户确认后写入 `changes/RELEASE.md`。规则与模板见 `changes/AGENTS.md`。
- `changes/` 只保留 `AGENTS.md` 和固定文件名的 `RELEASE.md`；历史注记与 `README.md` 删除。
- `scripts/release.sh`（`vp run release`）先校验 `changes/RELEASE.md` 存在、已跟踪且无未提交改动，不满足就报错退出，不进入 bumpp；bumpp 打完 tag 后删除 `RELEASE.md` 并提交、推送。
- 发布工作流在 tag 上读取 `changes/RELEASE.md` 作为 GitHub Release 正文，删除 `release-notes.ts` 的产物差异聚合。
- 删除 `scripts/release-notes.ts`、`scripts/changes.ts`、`scripts/lib/release-paths.ts`，以及 `release:notes`、`changes:check`、`changes:clean` 脚本。`release-surface.ts` 与 `release-compatibility.ts` 保留，它们维护 `port/surface.json` 和 README 兼容表，与发布说明无关。

## 替代方案

**保留产物差异自动生成，只把注记写全。** 被否决。产物差异是行级机械 diff，读者仍要从 `[Tools] Task` 这类条目里推断真实变化，且无法表达原因和迁移；把注记写全也盖不住自动段落的噪音。

**产物差异与人工说明并存。** 被否决。这正是旧机制，0.4.0、0.4.1 已证明两段拼在一起既冗长又抓不住重点。

**缺说明文件只软提醒。** 被否决。软提醒允许在没有可信说明时继续发布，正是 0.4.0 正文退化的直接原因。改为硬性前置条件。

## 后果

- 发布说明的正文来自 agent 归纳加用户确认，不再来自脚本或提交历史。
- 发布前置多一步，没有 `changes/RELEASE.md` 就不能发布。
- `changes/` 平时只有 `AGENTS.md`，每次发布期间临时多一份 `RELEASE.md`，发布后删除。
- GitHub Release 正文就是 `RELEASE.md` 原文，tag 保留它，后续提交删除它。
