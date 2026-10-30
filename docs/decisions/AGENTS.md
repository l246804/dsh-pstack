# 决策记录约定

本目录保存一次已定取舍的记录，是这个仓库决策格式、范围与检索规则的唯一来源。`decision-write`（写入、落地更新与取代）与 `decision-audit`（只读审计）两个技能读本文件；改格式前先确认二者仍能解析。

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
Superseded-by: <记录路径> — <一句原因>（仅 Status 为 superseded）

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
- `Implemented-by`：落地锚点，指向实现该决定的改动。实现改动的路径须与 `Scope` 相交，且至少一个路径在本目录之外。仅当 `decision-write` 的 Land 找不到实现且用户明确确认 record-only exception 时，才可锚到新增记录的提交；审计仍会报告该例外。`PR #N` 须为 MERGED，`commit:SHA` 须在默认分支历史中；未落地或无法核验写 `-`。
- `Superseded-by`：仅 `Status: superseded` 时必填，写替代记录路径和一句原因；只写链接或只改状态不算完成。
- `Review`：下次人工复核日期，`full` 模式审计据此提示逾期。
- 备选方案必写；没有记下被放弃的选项，同一个决定会被反复拿出来重新讨论。

## 状态流转

- `proposed`：已记录、未落地，`Implemented-by` 为 `-`。
- `accepted`：已落地，`Implemented-by` 核验通过。
- `superseded`：被新记录取代；新记录即使还是 `proposed`，旧记录也立即改为 `superseded`。保留正文与原锚点，填写 `Superseded-by`（路径 + 一句原因），并与新记录互链。旧记录原为 `proposed` 时保留 `Implemented-by: -`，不删除、不回退。

`Status` 与 `Implemented-by` 是一对，必须同时改：未落地只能 `proposed` + `-`，已落地只能 `accepted` + 核验过的 `PR #N` 或 `commit:SHA`；`accepted` 与 `-` 不能并存。

### 落地后

只新增记录的提交只把记录带入仓库，不构成实现。只有上述经确认的 record-only exception 可以把它作为锚点；其他记录只有在描述已经落地的既有事实、且 `Implemented-by` 指向那次实现时，才写 `accepted`。

记录与代码同一次改动写入时，`Status` 按当时的落地证据取值；代码还没合并到默认分支就写 `proposed` + `-`。

代码合并到默认分支后，在同一 PR 或紧随的文档提交里更新 `Status`、`Implemented-by` 和 `Review`，不要等审计提醒。这是对头部字段的局部修改，不重写正文；修改统一走 `decision-write` 的“落地”模式，不要直接编辑记录文件。

## 检索

- 写新记录或实质更新前：`grep -ril "<关键词>" docs/decisions/*.md`，排除 `AGENTS.md` 与 `README.md`，逐个归类为 duplicate / replaced / overlapping / unrelated，未决项带入报告。
- 只读每条记录的头部（首个 `## ` 之前）即可判定状态与范围，需要细节再读正文。
- 审计规则见 `decision-audit` 技能（按 `Scope`、`Implemented-by`、`Superseded-by`、`Review` 做六类检查）。

## 先不做

`proposed/` 与 `implemented/` 分目录、多语言三件套、归档流程、格式检查脚本、独立的 `decision-update` 技能（状态更新并入 `decision-write` 的落地模式，避免两个写侧技能在模型目录里竞争）。等记录数量与返工成本证明需要时再加。
