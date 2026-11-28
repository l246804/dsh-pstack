---
name: setup-project-docs
description: 初始化架构、术语表、决策记录约定及根目录 agent 文档指针；重跑时补齐已批准的缺口。
disable-model-invocation: true
---

# 建立项目文档

创建或补齐持续维护的项目文档及其上下文指针。在用户已授权范围内执行；尚未授权写入时，展示拟写内容并取得批准。

| 部分 | 回答 | 默认位置 |
|---|---|---|
| 架构 | 系统现在是什么？ | `docs/architecture.md` |
| 术语表 | 每个概念叫什么？ | `docs/glossary.md` |
| 决策约定 | 如何记录并查找决策？ | `docs/decisions/AGENTS.md` |
| 指针 | agent 何时打开每份文档？ | 根目录 `AGENTS.md` |

## 1. 盘点仓库

检查根目录 `AGENTS.md`、既有架构与术语文档。按以下顺序定位 `<dir>`：

1. 使用调用方提供的记录或目录路径。
2. 否则，解析根目录 `AGENTS.md` 的 `## Project docs` 中的决策指针；目标为现存的 `<dir>/AGENTS.md` 时使用该目录。
3. 否则，检查 `docs/decisions/`、`docs/adr/` 和 `doc/adr/`。

沿用选中的目录，并在存在时读取其 `AGENTS.md` 与 `README.md` 约定。仍有多个候选时，询问哪个是当前目录并等待。都不存在时使用表中的默认位置。

读取构建与工作区配置、真实目录和入口点，直到每个主要模块的职责都有代码依据。最终为每份拟建文档形成提纲，并明确列出仓库无法提供的事实。

## 2. 明确范围

列出已有内容、缺失内容与拟用路径。对仓库无法决定的事项先给建议：

- **决策记录：** 选择难以逆转时建议启用；小脚本或一次性原型通常不需要。用户不采用时，不新增决策约定及其指针；保留请求范围之外的已有配置。
- **术语表布局：** 建议单个文件；仅对真正独立的限界上下文按上下文拆分。

用户已提供路径和范围时直接采用。重跑时只处理缺失部分和失效指针。仅询问仓库和请求无法确定的选择；需要写入批准时，先准备具体草稿再请求。

## 3. 起草有依据的内容

- **架构：** 用真实目录与入口点列出模块表；记录代码已体现的依赖方向与扩展点，理由写入决策记录。
- **术语表：** 定义代码中已有且易引发不同命名的三到五个术语。
- **决策约定：** 不创建占位记录。真实决策交给 `decision-write`；启用时按[决策记录约定](references/decision-conventions.zh.md)起草 `<dir>/AGENTS.md`。

仍需写入批准时，集中展示完整草稿并应用获批集合。用户已授权这些工作时，已有授权继续有效。

## 4. 写入或更新

只创建或更新已批准的路径，既有文件就地编辑。根目录 `AGENTS.md` 只保留一个 `## Project docs` 块，并适配其语言与实际路径：

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module; update it when module boundaries or entry points change.
- Read `docs/glossary.md` when naming a concept; add terms when introducing concepts.
- Before starting any repository task, read `docs/decisions/AGENTS.md` and follow its search rules to read the records relevant to the task.
```

此块只写文档指针。仅在目标为获批文档或项目已使用的现存文档时保留对应模板行。按根文档的语言与实际路径，就地增加或更新获批指针。保留获批改动之外的既有有效指针，包括项目专用文档；只有获批删除时才移除指针。决策状态的含义与记录筛选规则留在决策目录的 `AGENTS.md`。

## 5. 验证并报告

确认每个已批准的路径均已写入或更新，根目录 `AGENTS.md` 只有一个 `## Project docs` 块且只含文档指针，每个指针都能从仓库根目录解析到保留的文档。报告写入、更新和跳过的路径及原因。报告指针变更，不假定宿主何时重新加载 agent 指令。
