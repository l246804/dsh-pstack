---
name: pstack-port
description: 移植、更新并扩展 DSH 版 pstack。
disable-model-invocation: true
---

# pstack 分阶段移植

按第一个参数选择一个分支。未指定或有歧义时，请用户从下表选择。一次调用只执行一个分支，完成产物、验证与报告后停止。

| 分支 | 触发指令 | 分支文件 | 产物 |
|---|---|---|---|
| 上游更新 | `upstream` | [`references/upstream.md`](references/upstream.md) | 更新后的上游检出与影响评估 |
| 结构整理 | `prepare` | [`references/prepare.md`](references/prepare.md) | 最小结构修正与 `docs/port-prepare.md` |
| 审查 | `audit` | [`references/audit.md`](references/audit.md) | 中文 `pstack/README.md` 与新 port 轮次 |
| 实现 | `implement <port\|EXT-*\|#编号>` | [`references/implement.md`](references/implement.md) | 当前工作项的实现与验证 |
| 审查 | `review <port\|EXT-*\|#编号>` | [`references/review.md`](references/review.md) | Issue 分诊或当前工作项的审查 |
| 文档 | `doc` | [`references/doc.md`](references/doc.md) | 英文适配文档、README 最终覆盖与轮次收尾 |
| GitHub 事项 | `issue [EXT-*\|#编号]` | [`references/issue.md`](references/issue.md) | Issue 创建，或验收、公开结论与状态清理 |

每次先读 `docs/port-state.yaml`，再读 [`references/contract.md`](references/contract.md)、`docs/architecture.md` 和所选分支文件。处理 `port` 的 `audit`、`implement`、`review`、`doc` 另读 [`references/port-baseline.md`](references/port-baseline.md)。其他分支文件留在上下文之外。

`port` 轮次从 `audit` 开始，到 `doc` 结束，链路为 `prepare → audit → implement port ⇄ review port → doc`；`upstream` 与 `prepare` 是前置。后续阶段只在用户显式调用时进入。

`implement` 无参数时，请用户选择 `port`、`EXT-*` 或填写 `#编号`。可以列出本地待处理项，但不访问 GitHub 自动发现 Issue。每次报告以完整的 `/pstack-port ...` 命令给出下一步；没有下一步时写“本轮结束，无下一步”。
