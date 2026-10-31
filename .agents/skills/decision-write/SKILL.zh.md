---
name: decision-write
description: 撰写、更新、落地或取代决策记录。用于已定取舍、缺失设计理由、推翻决策或记录文件改动；落地模式查找并校验实现，仅更新 `Review` 时保留当前状态。
---

# 撰写或更新决策记录

将一项已收敛的选择交付为经校验的记录和证据报告。所有记录修改都通过本技能；`decision-audit` 只读报告。

## 入口规则

任何对 `Status`、`Implemented-by`、`Superseded-by`、`Review`、正文或链接的修改都执行本流程。流程无法运行时停下报告；本规则优先于 `<dir>/AGENTS.md` 中允许直接编辑的约定。

## 定位记录目录

按以下顺序定位 `<dir>`：

1. 使用调用方提供的记录或目录路径。
2. 否则，解析根目录 `AGENTS.md` 的 `## Project docs` 中的决策指针；目标为现存的 `<dir>/AGENTS.md` 时使用该目录。
3. 否则，检查 `docs/decisions/`、`docs/adr/` 和 `doc/adr/`。

沿用选中目录的命名约定，并在存在时读取其 `AGENTS.md` 与 `README.md` 约定。仍有多个候选时，询问哪个是当前目录并等待。都不存在时，报告未找到决策目录，建议使用 `/setup-project-docs`，然后停止。

`AGENTS.md` 与 `README.md` 是约定而非记录；检索、分类与更新都排除它们。

## 选择模式

- **撰写：** 没有既有记录拥有这个决策、新记录取代旧记录，或既有记录需要实质更新正文或关系。重复与部分重叠的归类留在撰写模式；明确的状态字段更新走落地。执行步骤 1–5，在步骤 6 展示确认关口，仅在确认后写入，再执行步骤 7 报告。
- **落地：** 用户明确要求把既有记录标为 `accepted` 或更新其状态字段。完整读取目标记录，再执行步骤 4、5、7。记录路径加 `accepted` 就是足够输入；不要自行进入落地。未给出路径时，列出 `Scope` 匹配落地改动的记录并询问更新哪一条。仅更新 `Review` 时保留 `Status` 与 `Implemented-by`，跳过步骤 4、5，执行步骤 7 报告。

## 1. 确认选择

先从改动与讨论中取得全部三项，只询问缺失内容并等待：

- **目标：** 这个决策要解决的问题。
- **约束：** 排除某个选项的边界。
- **备选方案：** 实际被否决的选项，或者只考虑过单一候选这一明确事实。

## 2. 查找相关记录

用主题、受影响模块和备选方案的专有词检索：

```bash
grep -ril --exclude=AGENTS.md --exclude=README.md \
  -e "<关键词 1>" -e "<关键词 2>" <dir>/*.md
```

读取每个命中至第一个 `## ` 标题；头部无法区分归类，或无法提供更新所需内容时再读正文。检索过宽时收紧关键词，不通读整个目录。给每个命中分类：

- **重复：** 既有记录拥有这个决策。更新该记录，不另写第二条。
- **完全取代：** 起草新记录，让两条记录互相链接；把旧记录的取代变更放进确认关口。
- **部分重叠：** 保留两者，互相链接，并更正已变化的事实。
- **无关：** 不作修改。
- **未决：** 将关系与需要人工回答的问题带入报告。

每个命中都有归类、每项由此产生的修改都已明确时，本步完成。

## 3. 起草记录

遵循 `<dir>/AGENTS.md`，包括标题语言；没有该文件时使用：

```markdown
# Decision: <one-line title>

Status: proposed | accepted | superseded
Date: YYYY-MM-DD
Scope: <glob>[, <glob>...]
Implemented-by: <PR #N | commit:SHA | ->
Review: YYYY-MM-DD
Superseded-by: <记录路径> — <一句原因>   （仅 Status 为 superseded 时）

## Background
## Decision
## Alternatives
## Consequences
```

让 `Background` 脱离所选方案也能读懂。已接受的记录在 `Decision` 中用现在时描述系统。每个实际考虑过的备选方案独立成段并写明落选原因；只有单一候选时如实说明。

## 4. 设定状态并校验锚点

`Status` 与 `Implemented-by` 是一对。按证据选中下表的一行，并在同一次修改中写入两个字段：

| 证据 | Status | Implemented-by |
|---|---|---|
| 没有可核验的落地锚点 | `proposed` | `-` |
| `PR #N` 为 `MERGED` | `accepted` | `PR #N` |
| `commit:SHA` 是默认分支的祖先 | `accepted` | `commit:SHA` |
| 用户确认仅记录提交的例外 | `accepted` | `commit:<记录提交>` |
| 被更新的草稿取代 | `superseded` | 保留原值 |

新记录在落地前保持 `proposed`。`Implemented-by` 指向实现改动；追溯性记录指向更早的实现。仅记录提交必须走用户确认的例外。squash 合并的仓库优先用已合并 PR。

落地模式没有给定锚点，或需要“仅记录提交”例外时，编辑前读取[查找并校验实现](references/land.zh.md)。校验其他已有锚点时，只执行该参考中的校验流程，不执行查找步骤。

`<base>` 取仓库默认分支，并报告选中的 ref。校验每个锚点。撰写模式中，证据不可用或基线无法解析时，新记录保持 `proposed` + `-`；落地模式中停止并报告，不编辑记录。既有 `accepted` 记录的锚点校验失败时，停下报告，不静默降级。只改证据要求的字段；单独推进 `Review` 不改变状态。

新草稿取代旧记录时，在同一次获批的修改中把旧记录改为 `superseded`，即使旧记录原为 `accepted`。保留旧正文与锚点，添加互链，并在 `Review` 下方写 `Superseded-by: <新记录路径> — <一句原因>`。原因缺失时先询问并等待。原为 `proposed` 的旧记录保留 `Implemented-by: -`。

## 5. 检查范围覆盖改动

所有 glob/路径检查都使用[匹配 Scope 路径](references/scope.zh.md)，包括落地模式的锚点查找。调用方提供 `scope` 路径时直接使用。带已核验实现改动的落地分支，用以下命令列出实现路径：

```bash
gh pr view N --json files --jq '.files[].path'
git show --pretty=format: --name-only SHA
```

经确认的“仅记录提交”回退跳过本项检查，并在报告中说明例外。其他分支收集相对基线的提交与未提交改动：

```bash
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
git status --porcelain=v1 --untracked-files=all
```

解析 `git status` 中的路径，重命名取目标路径。每条新增或更新的记录都必须有至少一个所选改动路径匹配其 `Scope` glob。全部不匹配时，询问是放宽 glob，还是该记录不属于这次改动。将匹配路径留作报告。

## 6. 草稿确认关口

每次撰写写入（包括重复记录的更新）都要展示每条新增或更新记录的完整结果，以及每个相关记录的分类。包括每项拟议的旧记录取代变更及其 `Superseded-by` 路径和原因。请求用户明确确认并等待。确认后严格应用获批的修改；草稿被拒绝时保持所有文件不变。

## 7. 报告

根目录 `AGENTS.md` 没有可解析到所选 `<dir>` 的决策指针时，建议用 `/setup-project-docs` 登记。覆盖每个检索命中、改动的记录、关系判断、锚点校验、范围匹配和未决问题。等待落地的 `proposed` 记录在合并后需要一次“落地”更新。报告查到的实现及其改动路径；仅记录锚点须标明为经确认的例外。包括每个 `Superseded-by` 路径和原因。

```text
Record: docs/decisions/2026-10-27-use-postgres.md
Status: accepted
Related: 2026-03-02-mysql-setup.md -> overlapping, cross-linked
Anchor: PR #412 -> MERGED (gh pr view 412 --json state,files)
Scope: src/db/** matched src/db/client.ts
Open: none
```
