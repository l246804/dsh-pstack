---
name: setup-project-docs
description: 建立仓库的架构、术语表、决策记录及根目录 agent 文档指针。每个仓库运行一次。
disable-model-invocation: true
---

# 建立项目文档

建立持续维护的文档及指向它们的上下文指针。复用既有位置与约定；每个新文件在写入前都须经人批准。

| 部分 | 回答 | 默认位置 |
|---|---|---|
| 架构 | 系统现在是什么？ | `docs/architecture.md` |
| 术语表 | 每个概念叫什么？ | `docs/glossary.md` |
| 决策记录 | 为何演变成现在这样？ | `docs/decisions/` |
| 指针 | agent 何时打开每份文档？ | 根目录 `AGENTS.md` |

## 1. 盘点仓库

检查根目录 `AGENTS.md`、既有架构与术语文档，以及 `docs/decisions/`、`docs/adr/`、`doc/adr/`。沿用已有路径与约定，不为同类内容另建归属地。存在多个决策目录时，询问哪个是当前目录。

读取构建与工作区配置，确定仓库的模块边界。查看真实目录与入口点，直到能说清主要模块及各自职责。当每份拟建文档都有代码依据的提纲、每项缺失事实都已列出时，本步完成。

## 2. 确认计划

列出已有内容、缺失内容与拟用路径。仓库无法决定的事项按以下顺序询问，并先给建议：

- **决策记录：** 选择难以逆转时建议启用；小脚本或一次性原型通常不需要。拒绝会让相关技能保持惰性。
- **术语表布局：** 建议单个文件。仅当仓库存在真正独立的限界上下文时，才建议按上下文拆分。

确认要写入的文件与内容。重跑时改为确认要补齐的缺失部分和要更新的既有指针。

## 3. 起草有依据的内容

- **架构：** 先用真实目录与入口点列出模块表；记录代码已体现的依赖方向与扩展点，理由留给决策记录。
- **术语表：** 定义代码中已有且易引发不同命名的三到五个术语。
- **决策记录：** 只在已有选择值得记录时写一条真实记录，否则不创建占位记录。
- **决策约定：** 启用决策记录时，将记录格式、范围、状态流转和检索规则写入所选目录的 `AGENTS.md`。

集中展示所有草稿，获得批准后再写入。

## 4. 写入或更新

只创建已批准的文件。保留既有文件并就地编辑。在根目录 `AGENTS.md` 中更新唯一的 `## Project docs` 块，按原有语言和已批准路径调整以下示例：

```markdown
## Project docs

- Read `docs/architecture.md` before changing a module; update it when module boundaries or entry points change.
- Read `docs/glossary.md` when naming a concept; add terms when introducing concepts.
- Before writing or reviewing decisions, read `docs/decisions/AGENTS.md` for format and search conventions.
```

每条指针说明触发条件与目标。块只保留已批准的三类分支，省略被拒文档的指针。使用实际术语表与决策目录路径，并指向普通决策参考文档，不将手动技能写成可由 agent 自动调用的入口。

## 5. 验证并报告

验证根目录 `AGENTS.md` 只有一个 `## Project docs` 块，且每个指针都能从仓库根目录解析。报告写入、更新和跳过的路径及原因。说明指针从下个会话开始生效。
