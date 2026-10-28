# 决策记录约定

启用决策记录时，起草 `<dir>/AGENTS.md`，作为仓库中格式、范围、状态与检索规则的权威参考。包括：

- 五字段头部：`Status`、`Date`、`Scope`、`Implemented-by`、`Review`。
- 状态/锚点成对规则与状态流转，包括新草稿立即取代旧记录。被取代的 `proposed` 记录保留 `Implemented-by: -`；保留旧正文，不删除、不回退。
- 相关记录检索与分类。
- 以 `decision-write` 作为所有记录修改的入口。
- 每条 `superseded` 记录都带 `Superseded-by`，包含替代记录路径和一句原因。

以 `decision-write` 的回退模板为基础，适配仓库的语言与约定。真实实现锚点的路径须与 `Scope` 相交，且至少一个路径在 `<dir>` 之外；仅允许通过 `decision-write` 落地模式中经用户明确确认的例外使用仅记录提交，并写明审计仍会报告该例外。
