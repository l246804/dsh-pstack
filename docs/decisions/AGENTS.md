# 决策记录约定

本目录保存一次已定取舍的记录，是这个仓库决策格式、范围与检索规则的唯一来源。`decision-write` 与 `decision-audit` 两个技能读本文件；改格式前先确认二者仍能解析。

## 何时写

非机械改动，且存在代码和测试都解释不了的长期理由时写一条。改名、格式化、文案调整、纯机械重构不写；与代码改动放在同一个提交。

## 文件名

`docs/decisions/YYYY-MM-DD-<topic>.md`，`<topic>` 用连字符小写词。

## 记录格式

```markdown
# 决定：<标题>

Status: proposed | accepted | superseded
Date: YYYY-MM-DD
Scope: <glob>[, <glob>...]
Implemented-by: <PR #N | commit:SHA | ->
Review: YYYY-MM-DD

## 背景

要解决什么问题，约束是什么。

## 决定

决定做什么。系统现在实际是什么样。

## 备选方案

- 方案 A。不选的原因是……
- 方案 B。不选的原因是……

## 后果

得到了什么，付出了什么代价，什么情况下需要重新考虑。
```

- `Scope`：受该决定约束的仓库相对路径 glob，供 `decision-audit` 把改动路由到记录。
- `Implemented-by`：落地锚点。`PR #N` 须为 MERGED，`commit:SHA` 须在历史中；未落地或无法核验写 `-`。
- `Review`：下次人工复核日期，`full` 模式审计据此提示逾期。
- 备选方案必写；没有记下被放弃的选项，同一个决定会被反复拿出来重新讨论。

## 状态流转

- `proposed`：已记录、未落地，`Implemented-by` 为 `-` 或待核验锚点。
- `accepted`：已落地，`Implemented-by` 核验通过。
- `superseded`：被新记录取代；正文不改写，只把 `Status` 改为 `superseded`，并与新记录互链。

决定被推翻时新写一条并链接旧记录，不改写旧记录来假装一直是这个决定。

## 检索

- 写新记录前：`grep -ril "<关键词>" docs/decisions/*.md`，逐个归类为 replaced / overlapping / unrelated，未决项带入报告。
- 只读每条记录的头部（首个 `## ` 之前）即可判定状态与范围，需要细节再读正文。
- 审计规则见 `decision-audit` 技能（按 `Scope`、`Implemented-by`、`Review` 做五类检查）。

## 先不做

`proposed/` 与 `implemented/` 分目录、双语三件套、归档流程、格式检查脚本。等记录数量与返工成本证明需要时再加。
