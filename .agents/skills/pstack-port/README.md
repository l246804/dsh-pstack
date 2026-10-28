# `/pstack-port` 使用说明

用于从零建立或完整重建 pstack 的 DSH 移植基线。`SKILL.md` 只负责路由，`references/` 保存三个阶段说明；每次只加载一个分支，完成该阶段后停止。本说明供人阅读，不是额外执行分支。

## 使用方式

```text
/pstack-port audit
/pstack-port implement
/pstack-port doc
```

未指定分支时，技能会询问，不自动执行完整流水线。

## 阶段与确认门

1. `audit`：清点上游需求、核对 DSH 证据，生成**中文** `pstack/README.md` 移植审查记录。
2. `implement`：按 README 中确定的方案实现插件内缺口。
3. `doc`：按上游模板和真实实现生成**英文** `pstack/overlay/docs/harness/dsh.md`。

若某个待实现能力存在多种合理实现建议，`audit` 会在 README 中列出候选、限制与取舍，并标记“待选择”。此时 `implement` 会暂停，请你明确选择一种；选择结果写入 README 后才继续。证据只支持一种方案时标记“证据唯一”，无需形式化选择。

## 示例

### 从零审查

```text
/pstack-port audit
```

只生成中文审查记录，不读取现有实现来反推需求，也不继续开发。

### 确认方案后实现

```text
/pstack-port implement
```

检查 README 的上游提交、实现范围与方案状态。遇到“待选择”时先请你选定方案，再开始修改实现。

### 基于真实实现生成使用文档

```text
/pstack-port doc
```

只生成英文 DSH 使用文档，不继承 README 的审查章节，也不把规划能力写成已提供能力。

## 与其他技能的分工

- 完整移植基线：本技能。
- 已移植插件的缺陷、独立功能和上游增量维护：`/pstack-maintain`。
- DSH 版本地扩展登记：`docs/extensions.md`，不属于上游原子能力。
