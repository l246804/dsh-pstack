---
name: decision-write
description: 在本仓库的决策目录中撰写或取代一条决策记录。当一次改动在真实备选方案中选定了一个，当评审者追问代码为何是现在这样而没有任何记录能回答，或者当一条已接受的决策正被推翻时使用。
---

# 撰写决策记录

起草并校验一项已收敛选择的记录，把尚未收敛的选择留给调用方。交付物是记录，以及覆盖每次检索、关系判断、校验和未决问题的报告。

## 定位记录目录

检查 `docs/decisions/`、`docs/adr/` 和 `doc/adr/`。

- 只有一个存在：使用它并沿用其命名约定，后续记为 `<dir>`。
- 多个存在：询问哪个是当前目录并等待。
- 都不存在：说明本仓库不保存决策记录，建议使用 `/setup-project-docs`，然后停止，不创建目录。

## 1. 确认选择

起草前取得全部三项。只询问改动与讨论无法确定的内容，缺少答案时等待。

- **目标：** 这个决策要解决的问题。
- **约束：** 排除某个选项的边界。
- **备选方案：** 实际被否决的选项，或者只考虑过单一候选这一明确事实。

## 2. 查找相关记录

存在 `<dir>/AGENTS.md` 时先读取；后续格式、范围、状态与检索规则以它为准。

用主题、受影响模块和备选方案的专有词检索：

```bash
grep -ril "<keywords>" <dir>/*.md
```

给每个返回的记录分类，包括无关项。先读取每条记录至第一个 `## ` 标题；仅当头部无法区分以下关系时才读取正文：

- **完全取代：** 保留旧正文，将其 `Status` 改为 `superseded`，并让两条记录互相链接。
- **部分重叠：** 保留两者，互相链接，并更正已变化的事实。
- **无关：** 不作修改。

检索过宽时收紧关键词，而不是通读整个目录。每个命中均归为完全取代、部分重叠、无关或未决，且所有需要的修改均已明确时，检索完成。未决关系写入报告。

## 3. 起草记录

遵循 `<dir>/AGENTS.md`，包括标题语言；没有该文件时使用：

```markdown
# Decision: <one-line title>

Status: proposed | accepted | superseded
Date: YYYY-MM-DD
Scope: <globs>
Implemented-by: <PR #N | commit:SHA | ->
Review: YYYY-MM-DD

## Background
## Decision
## Alternatives
## Consequences
```

让 `Background` 脱离所选方案也能读懂。已接受的记录在 `Decision` 中用现在时描述系统。每个实际考虑过的备选方案独立成段并写明落选原因；只有单一候选时如实说明。

## 4. 校验锚点与范围

校验 `Implemented-by` 的每个值：

| 值 | 命令 | 通过条件 |
|---|---|---|
| `PR #N` | `gh pr view N --json state,mergedAt` | `state` 为 `MERGED` |
| `commit:SHA` | `git merge-base --is-ancestor SHA origin/main` | 退出码为 0 |

改动未落地、校验失败或 `gh` 不可用时使用 `-` 并说明原因。仓库通过 squash 合并改写 SHA 时优先使用 `PR #N`。

将 `Scope` 与改动比较：

```bash
git diff --name-only "$(git merge-base HEAD origin/main)"..HEAD
```

至少一个改动文件必须匹配一个 `Scope` glob。全部不匹配时，询问是放宽 glob，还是该记录不属于这次改动。

## 5. 报告

列出每条改动的记录、所有检索命中及其分类、每条校验命令及结果、范围匹配和未决问题。例如：

```
Record: docs/decisions/2026-10-27-use-postgres.md
Status: accepted
Duplicates: 1 hit (2026-03-02-mysql-setup.md), overlapping, cross-linked
Anchor: PR #412 -> MERGED (gh pr view 412 --json state,mergedAt)
Scope: 3 globs, 2 matched by this change
Open: whether to supersede the older record
```
