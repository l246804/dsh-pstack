---
name: pstack-port
description: 移植、更新并扩展 DSH 版 pstack。
disable-model-invocation: true
---

# pstack 分阶段移植

解析调用名后的第一个参数；未指定或有歧义时，请用户从下表选择。每次只执行一个分支。

| 分支 | 触发指令 | 分支文件 | 产物 |
|---|---|---|---|
| 上游更新 | `upstream` | [`references/upstream.md`](references/upstream.md) | 更新后的上游检出与影响评估 |
| 结构整理 | `prepare` | [`references/prepare.md`](references/prepare.md) | 最小结构修正与 `docs/port-prepare.md` |
| 审查 | `audit` | [`references/audit.md`](references/audit.md) | 中文 `pstack/README.md` |
| 实现 | `implement` | [`references/implement.md`](references/implement.md) | 审查范围内的插件实现与验证 |
| 实现审查 | `review` | [`references/review.md`](references/review.md) | 中文 `docs/port-review.md` 实现审查报告 |
| 文档 | `doc` | [`references/doc.md`](references/doc.md) | 英文 harness 适配文档与 README 最终覆盖状态 |
| 独立功能 | `feature` | [`references/feature.md`](references/feature.md) | `EXT-*` 随包功能、验证与扩展状态 |

读取 [`references/contract.md`](references/contract.md)、`docs/architecture.md` 和所选分支文件，全程执行；其他分支文件保留在上下文之外。完成当前分支的产物、验证与报告后停止；后续阶段、失效基线与证据冲突按分支文件处理。基线实现偏差由 `implement` 修复，上游更新统一从 `upstream` 开始；`feature` 只处理随包独立功能，不进入移植的 audit/review 状态机。
