---
name: pstack-port
description: 建立或完整重建 pstack 的 DSH 移植基线。
disable-model-invocation: true
---

# pstack 分阶段移植

解析调用名后的第一个参数；未指定或有歧义时，请用户从下表选择。每次只执行一个分支。

| 分支 | 触发指令 | 分支文件 | 产物 |
|---|---|---|---|
| 审查 | `audit` | [`references/audit.md`](references/audit.md) | 中文 `pstack/README.md` |
| 实现 | `implement` | [`references/implement.md`](references/implement.md) | 审查范围内的插件实现与验证 |
| 文档 | `doc` | [`references/doc.md`](references/doc.md) | 英文 `pstack/overlay/docs/harness/dsh.md` |

读取 [`references/contract.md`](references/contract.md)、`docs/architecture.md` 和所选分支文件，全程执行；其他分支文件保留在上下文之外。完成当前分支的产物、验证与报告后停止；后续阶段、失效基线与证据冲突按分支文件处理。缺陷修复、本地功能扩展和上游增量维护交给 `/pstack-maintain`。

使用方式、方案确认门与示例见 [`README.md`](README.md)。
