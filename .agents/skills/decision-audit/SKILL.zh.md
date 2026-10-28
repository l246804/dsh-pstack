---
name: decision-audit
description: 只读报告与一次改动或整个仓库相关的决策记录，并附命令证据。
disable-model-invocation: true
---

# 审查决策记录

报告哪些记录需要人工关注。不修改文件，也不判断代码是否仍符合决策。每项发现都引用支持它的命令与实际输出。

## 1. 确定输入与目录

输入为 `mode`（默认 `pr`，另有 `local`、`full`）、可选的 `base`，以及用于替代计算所得改动集合的可选 `scope` 路径列表。

`pr` 使用 PR 基线，其他模式使用 `origin/main`。该 ref 不存在时，依次尝试 `origin/master`、`main`、`master`、最新的 tag、`HEAD~20`，并报告实际选择。全部无法解析时停止并列出尝试过的 ref。

检查 `docs/decisions/`、`docs/adr/` 和 `doc/adr/`。只有一个存在时将其记为 `<dir>` 并在报告中给出路径。多个存在时询问哪个是当前目录并等待。都不存在或目录为空时，报告这一正常结果并停止。

## 2. 收集证据

`pr` 和 `local` 在未提供 `scope` 时计算改动集合：

```bash
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
```

剔除锁文件、生成文件、快照和纯资源文件。`full` 模式改为使用所有受 Git 跟踪的文件。

读取每条记录至第一个 `## ` 标题并解析头部。早于五字段头部的记录单列为旧格式，交人补齐，且不参与以下检查。

## 3. 执行全部五项检查

**A——路由。** 对每个非 `superseded` 且 `Scope` 匹配改动集合的记录，用一行报告标题、路径、匹配路径及改动集合证据。细节由原记录提供。

**B——状态候选。** 仅在 `proposed` 记录的锚点校验通过时报告：

- `PR #N`：`gh pr view N --json state` 返回 `MERGED`。
- `commit:SHA`：`git merge-base --is-ancestor SHA <base>` 退出码为 0。

`-` 锚点表示尚未落地，不是发现。无法校验的锚点单列为 `Unverified`，不归入 B 或 C。

**B′——范围失效。** 当 `accepted` 记录的所有 `Scope` glob 都不匹配现存文件时，报告记录路径与 glob 检查证据，并询问是决策已过时还是范围写错。

**C——锚点断裂。** 报告不在历史中的提交或无法解析的 PR。判定提交丢失前，只要其对象仍可用，就先恢复 patch 标识：

```bash
git show <dead-sha> | git patch-id --stable
```

在记录的日期与范围内搜索可能的替代提交：

```bash
git log --since=<Date> --format=%H -- <Scope paths> |
  while read -r sha; do git show "$sha" | git patch-id --stable; done |
  grep -F "<patch-id>"
```

命中可支持建议改用新 SHA；未命中则留给人判断。使用 squash 合并的仓库优先采用 PR 锚点。

**D——审阅逾期。** 仅在 `full` 模式，报告 `Review` 日期之后触及记录 `Scope` 的提交：

```bash
git log --since=<Review> --oneline -- <Scope paths>
```

附上提交数量和最新主题，建议人工重读并更新 `Review` 日期。

## 4. 报告与裁剪

按 `C`、`B`、`B′`、`D`、`A` 排列；同类中匹配文件更多的在前。

- `pr`：最多 15 项，随后给出省略数量。
- `local`：最多 8 项，其中 A 类最多 3 项。
- `full`：不裁剪，按类别分组。

格式：

```
[C] Decision title
  Record: docs/decisions/2026-08-14-use-postgres.md
  Basis: commit:3f9a1c2 is not in history
  Evidence: patch-id d064e03f4e53 matches new commit 8ff9f762
  Suggest: change Implemented-by to commit:8ff9f762
```

没有匹配项时用一行说明。`full` 模式改为报告每类计数，包括零。旧格式与未校验记录分别单列。`gh` 缺失或未认证时，将 PR 锚点标为未校验，继续其他检查。
