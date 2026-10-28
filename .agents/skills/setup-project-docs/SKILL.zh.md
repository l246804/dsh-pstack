---
name: setup-project-docs
description: 初始化架构、术语表、决策记录文档及根目录 agent 文档指针；重跑时补齐已批准的缺口。
disable-model-invocation: true
---

# 建立项目文档

创建或补齐持续维护的项目文档及其上下文指针。写入或修改文件前必须获得批准。

| 部分 | 回答 | 默认位置 |
|---|---|---|
| 架构 | 系统现在是什么？ | `docs/architecture.md` |
| 术语表 | 每个概念叫什么？ | `docs/glossary.md` |
| 决策记录 | 为何演变成现在这样？ | `docs/decisions/` |
| 指针 | agent 何时打开每份文档？ | 根目录 `AGENTS.md` |

## 1. 盘点仓库

检查根目录 `AGENTS.md`、既有架构与术语文档，以及 `docs/decisions/`、`docs/adr/`、`doc/adr/`。沿用已有路径与约定。存在多个决策目录时，询问哪个是当前目录并等待。

读取构建与工作区配置、真实目录和入口点，直到每个主要模块的职责都有代码依据。最终为每份拟建文档形成提纲，并明确列出仓库无法提供的事实。

## 2. 确认计划

列出已有内容、缺失内容与拟用路径。对仓库无法决定的事项先给建议：

- **决策记录：** 选择难以逆转时建议启用；小脚本或一次性原型通常不需要。拒绝会让相关技能保持惰性。
- **术语表布局：** 建议单个文件；仅对真正独立的限界上下文按上下文拆分。

确认拟用路径与内容。重跑时，计划只覆盖缺失部分和失效指针。步骤 3 提供最终写入批准。

## 3. 起草有依据的内容

- **架构：** 用真实目录与入口点列出模块表；记录代码已体现的依赖方向与扩展点，理由写入决策记录。
- **术语表：** 定义代码中已有且易引发不同命名的三到五个术语。
- **决策记录：** 不创建占位记录。真实决策交给 `decision-write`；本技能只搭建目录与约定。
- **决策约定：** 启用时，按[决策记录约定](references/decision-conventions.zh.md)起草 `<dir>/AGENTS.md`。

集中展示所有草稿，获得批准后再写入。批准集合就是写入计划。

## 4. 写入或更新

只创建或更新已批准的路径，既有文件就地编辑。根目录 `AGENTS.md` 只保留一个 `## Project docs` 块，并适配其语言与实际路径：

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module; update it when module boundaries or entry points change.
- Read `docs/glossary.md` when naming a concept; add terms when introducing concepts.
- Before writing or reviewing decisions, read `docs/decisions/AGENTS.md` for format and search conventions.
```

每条指针以触发条件和目标开头，只包含已批准的分支。决策工作指向普通参考文档。

## 5. 验证并报告

确认根目录 `AGENTS.md` 只有一个 `## Project docs` 块，每个已批准的路径均已写入或更新，且每个指针都能从仓库根目录解析。报告写入、更新和跳过的路径及原因。说明指针从下个会话开始生效。
