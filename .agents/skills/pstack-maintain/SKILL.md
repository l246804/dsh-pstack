---
name: pstack-maintain
description: 增量维护已移植的 DSH 版 pstack。
disable-model-invocation: true
---

# pstack 增量维护路由

解析调用名后的第一个参数；未指定或有歧义时，请用户从下表选择。每次只执行一个分支；含独立需求时，在报告中列出各分支的调用方式。

| 分支 | 触发指令 | 分支文件 | 用途 |
|---|---|---|---|
| 缺陷 | `defect` | [`references/defect.md`](references/defect.md) | 复现、归因、反馈与回归修复 |
| 功能 | `feature` | [`references/feature.md`](references/feature.md) | 登记并实现独立 `EXT-*` 功能 |
| 上游 | `upstream` | [`references/upstream.md`](references/upstream.md) | 按影响面同步 pstack 或 DSH |

读取 `docs/architecture.md`、[`docs/extensions.md`](../../../docs/extensions.md) 和所选分支文件，全程执行；其他分支文件保留在上下文之外。基线重建交给 `/pstack-port audit`，本地扩展只在 `docs/extensions.md` 登记。

## 共同约定

- 读取当前实现、测试、复现材料及必要的上游证据，记录本仓、上游 pstack 与 DSH 的当前提交或版本，并从仓库元数据确定 Issue 地址。
- 保留 `proposed` 与 `active` 扩展条目，以及每个 `active` 扩展的实现和回归验证。
- 架构边界、入口或术语变化时同步相应文档；长期取舍按 `docs/decisions/AGENTS.md` 记录。
- 公开提交 Issue、评论、日志或诊断附件前，展示目标仓库与脱敏后的完整内容并取得用户确认；本地记录或待提交草稿不视为已公开反馈。

分支步骤结束后，执行最窄的相关测试、类型检查和构建，再执行受影响工作区及真实安装环境验收。逐项检查退出码，区分本次失败、环境问题和既有失败；本次未解决失败不得报告完成。

报告分支、关联能力或 Issue/草稿、责任层或影响面、修改、依赖版本、验证结果和未解决限制后停止。完整基线重建需显式调用 `/pstack-port audit`。

使用方式与示例见 [`README.md`](README.md)。
