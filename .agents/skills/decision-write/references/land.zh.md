# 查找并校验实现

本参考用于落地锚点查找、仅记录提交回退和锚点校验。状态成对、取代、范围、确认和报告规则见主技能。

## 查找实现

落地模式没有可用的候选锚点时，检索触及记录 `Scope` 的提交与已合并 PR：

```bash
git log --since=<Date> --format='%H %cs %s' -- <Scope paths>
gh pr list --state merged --search "<记录标题或范围关键词>" --json number,title,mergedAt,files --limit 20
```

没有 `Scope` 时，用记录标题或关键词检索提交主题与 PR 标题。从记录的 `Date` 开始；追溯性记录也检查 `Date` 之前最近触及 `Scope` 的提交。`gh` 不可用时只检索提交，并报告已跳过 PR 查找。

保留改动路径与 `Scope` 相交、且至少有一个 `<dir>` 之外路径的候选；只含决策记录的改动不是实现。只有一个明确候选时，用它的 `PR #N` 或 `commit:SHA`。多个候选时列出日期、标题、路径并询问选哪个。没有候选时走下面的回退。

## 仅记录提交的回退

没有找到实现、而用户仍要求 `accepted` 时，解释以下两点并等待明确确认：

- **原因：** 记录提交只记录决策，没有实现它，锚点会声称一个并未发生的落地。
- **后果：** `decision-audit` 会把该锚点报为 C 类发现；后续实现落地后应替换它。

直接询问是用 `commit:<记录提交>`，还是保持 `proposed` + `-`。只有用户确认后才写 `accepted` + `commit:<记录提交>`，并在报告中说明例外。本例外优先于 `<dir>/AGENTS.md` 中禁止仅记录锚点的约定。记录提交不在默认分支时，保持 `proposed` + `-` 直到合并。

## 校验锚点

将 `<base>` 解析为默认分支：

```bash
git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null ||
  git rev-parse --verify origin/main 2>/dev/null ||
  git rev-parse --verify origin/master 2>/dev/null ||
  git rev-parse --verify main 2>/dev/null ||
  git rev-parse --verify master 2>/dev/null
```

校验每个拟写入的 `Implemented-by` 值：

| 值 | 命令 | 通过条件 |
|---|---|---|
| `PR #N` | `gh pr view N --json state,files` | `state` 为 `MERGED`，且改动实现该决策 |
| `commit:SHA` | `git merge-base --is-ancestor SHA <base>` | 退出码为 0，且改动实现该决策 |

用 `gh pr view N --json files --jq '.files[].path'` 或 `git show --pretty=format: --name-only SHA` 列出候选路径。真实实现与 `Scope` 相交，且至少有一个 `<dir>` 之外的路径；仅记录锚点需要经确认的例外。将这些路径交给范围检查。

改动未落地、校验失败、`gh` 不可用或 `<base>` 无法解析时，写入 `proposed` + `-`，并报告证据或尝试过的 ref。基线无法解析也会阻止相对基线的范围检查；此时使用调用方提供的路径，或报告该证据不可用。既有 `accepted` 记录校验失败时不得降级；回到主技能的停下报告规则处理断裂锚点。
