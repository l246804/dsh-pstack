---
name: pstack-port
description: 移植、更新并扩展 DSH 版 pstack。
disable-model-invocation: true
---

# pstack 分阶段移植

按调用名后的第一个参数选择一个分支；未指定或歧义时，请用户从下表选择。一次调用只执行一个分支，完成其产物、验证与报告后停止。

| 分支 | 触发指令 | 分支文件 | 产物 |
|---|---|---|---|
| 上游更新 | `upstream` | [`references/upstream.md`](references/upstream.md) | 更新后的上游检出与影响评估 |
| 结构整理 | `prepare` | [`references/prepare.md`](references/prepare.md) | 最小结构修正与 `docs/port-prepare.md` |
| 审查 | `audit` | [`references/audit.md`](references/audit.md) | 中文 `pstack/README.md` |
| 实现 | `implement <范围>` | [`references/implement.md`](references/implement.md) | 当前范围的插件实现与验证 |
| 实现审查 | `review <范围>` | [`references/review.md`](references/review.md) | Issue 分析或当前范围审查 |
| 文档 | `doc` | [`references/doc.md`](references/doc.md) | 英文 harness 适配文档与 README 最终覆盖状态 |
| GitHub 事项 | `issue [EXT-* 或 #编号]` | [`references/issue.md`](references/issue.md) | 创建 Issue，或验收、公开结论与状态清理 |

`implement`/`review` 的范围是 `port` 或 `#编号`；`issue` 可带一个尚无追踪入口的 `EXT-*` 或 `#编号`。读取 [`references/contract.md`](references/contract.md)、`docs/architecture.md` 和所选分支文件；处理 `port` 的 `audit`、`implement`、`review`、`doc` 另读 [`references/port-baseline.md`](references/port-baseline.md)，按各文件的要求执行；其他分支文件留在上下文之外。

分支文件写明的后续阶段只在用户显式调用时进入；`prepare` 只结束本次调用，不结束本轮移植。

路由上，`upstream` 是更新起点，`review` 先确定 Issue 的内部范围，`implement` 与 `review` 一次只处理一个范围，`issue` 负责公开事项的发起与验收。
