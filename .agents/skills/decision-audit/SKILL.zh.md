---
name: decision-audit
description: 只读审计 PR、本地改动或整个仓库的决策记录，报告路由、状态、范围、锚点、取代与复核逾期发现，并附命令证据。
disable-model-invocation: true
---

# 审计决策记录

以只读方式报告需要人工关注的记录，不判断代码是否仍符合决策。每项发现都附上支持它的命令与实际输出；所有修改交给 `decision-write`。

## 1. 确定输入

接受 `mode`（`pr`、`local` 或 `full`，默认 `pr`）、可选的 `base`，以及用于替代计算所得改动集合的可选 `scope` 路径。

`pr` 解析 PR 基线，`local` 或 `full` 先尝试 `origin/main`。不存在时依次尝试 `origin/master`、`main`、`master`、最新 tag、`HEAD~20`。报告实际选中的 ref。基线无法解析会阻止相对基线的改动集合计算与提交锚点校验；继续其他检查，并在 `Unverified` 中列出每个尝试过的 ref。

按以下顺序定位 `<dir>`：

1. 使用调用方提供的记录或目录路径。
2. 否则，解析根目录 `AGENTS.md` 的 `## Project docs` 中的决策指针；目标为现存的 `<dir>/AGENTS.md` 时使用该目录。
3. 否则，检查 `docs/decisions/`、`docs/adr/` 和 `doc/adr/`。

报告选中的路径。仍有多个候选时，询问哪个是当前目录并等待。都不存在或没有记录时，报告这一正常结果并停止。

## 2. 收集证据

未提供 `scope` 时计算改动集合：

```bash
# pr
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD

# local：相对基线的提交，加上工作区与暂存区
git diff --name-only "$(git merge-base HEAD <base>)"..HEAD
git status --porcelain=v1 --untracked-files=all
```

解析 `git status` 中的路径，重命名取目标路径。`full` 使用所有受 Git 跟踪的文件。从计算结果中剔除锁文件、生成文件、快照和纯资源文件；记录这些排除项与最终集合。显式 `scope` 替换计算所得集合，但不改变依赖基线的锚点校验。

存在 `<dir>/AGENTS.md` 和 `<dir>/README.md` 时读取；它们是约定而非记录。将其约定应用到其他所有 `*.md`。读取每条记录至第一个 `## ` 标题并解析头部。缺少 `Status`、`Date`、`Scope`、`Implemented-by`、`Review` 中任一项的记录单列为 `Legacy`，补齐必需字段前不执行后续检查。现行记录的 `Superseded-by` 可选，只在 E 类检查中处理。

对每条现行记录执行所有适用的检查；同一记录可以产生多项发现。所有 glob/路径检查都使用[匹配 Scope 路径](../decision-write/references/scope.zh.md)，并保留匹配结果作为证据。

## 3. 执行检查

A、B、B′ 和 D 只用于非 `superseded` 记录；C 和 E 按下方说明执行。

**A——路由。** 对每条 `Scope` 匹配改动集合的记录，用一行报告标题、路径、匹配路径及改动集合证据。

**B——状态成对。** 使用下方的锚点结果，报告每个匹配行：

| Status | 锚点结果 | 发现 |
|---|---|---|
| `proposed` | 已核验 | 应改为 `accepted` |
| `accepted` | `-` 或缺失 | 落地状态缺少已核验证据 |

`proposed` 带 `-` 时归为待落地。`proposed` 或 `accepted` 带待落地锚点都不是发现；将记录归为待落地。带未核验锚点时归入 `Unverified`，不归入 B 或 C。

**B′——范围失效。** 对 `Scope` 中所有 glob 都不匹配现存文件的每条 `accepted` 记录，报告路径与 glob 检查证据，并询问是决策已过时还是范围写错。

**C——锚点断裂。** 对每条非 `superseded` 记录的每个 `Implemented-by` 值，按证据分类：

| 值 | 校验 | 结果 |
|---|---|---|
| `-` 或缺失 | 无 | 待落地 |
| `PR #N` | `gh pr view N --json state,files` | `MERGED`：继续下方检查；`OPEN`：待落地；`CLOSED`：C；其他：未核验 |
| `commit:SHA` | `git merge-base --is-ancestor SHA <base>` | 退出码 0：继续下方检查；1：C；其他：未核验 |
| 任意值 | 命令不可用、认证失败或对象无法读取 | 未核验 |

对已合并 PR 或祖先提交，用 `gh pr view N --json files --jq '.files[].path'` 或 `git show --pretty=format: --name-only SHA` 列出路径。“已核验”要求至少一个路径匹配 `Scope`，且至少一个路径在 `<dir>` 之外；否则附路径证据报告 C。

报告提交丢失前，读取[恢复被改写的提交](references/recover-commit.zh.md)；只要其对象仍可用，就尝试恢复 patch 标识。

**D——复核逾期。** 仅在 `full` 模式，报告 `Review` 日期早于当前日期的每条记录，并收集决策日期以来匹配 `Scope` 的改动：

```bash
date +%F
git log --since=<Date> --format=%H <base> --
```

列出每个提交的路径，先用共享匹配器筛选，再计数；记录的 `Scope` 是匹配器输入，不是 Git pathspec。附上匹配提交的数量和最新主题（如有）。日期逾期本身就是发现，即使没有匹配改动；建议人工复核并更新 `Review` 日期。

**E——取代记录。** 对每条现行 `superseded` 记录，在 `Superseded-by` 缺失、无法解析到 `<dir>` 内的记录，或没有 ` — <原因>` 文本时报告。建议补上替代记录路径和一句原因。

## 4. 报告与裁剪

每条现行记录都必须归为待落地、无发现、未核验，或带一项或多项发现。按 `C`、`B`、`B′`、`E`、`D`、`A` 排列；同类中匹配文件更多的在前。

- `pr`：最多 15 项，随后给出省略数量。
- `local`：最多 8 项，其中 A 类最多 3 项。
- `full`：不裁剪，报告每类计数，包括零。

各项发现使用以下结构；每一类都要包含 `Evidence`：

```text
[C] Decision title
  Record: docs/decisions/2026-08-14-use-postgres.md
  Basis: commit:3f9a1c2 is not in history
  Evidence: git merge-base --is-ancestor 3f9a1c2 origin/main -> exit 1
  Suggest: replace the anchor with commit:8ff9f762 (matching patch-id d064e03f4e53)
```

`Legacy` 与 `Unverified` 分别单列，不计为发现。`gh` 缺失或未认证时，将 PR 锚点标为未核验，继续其他检查。没有现行记录带发现时明确说明。所有修改都交给 `decision-write`；仅在决策目录或根指针缺失时建议使用 `/setup-project-docs`。
