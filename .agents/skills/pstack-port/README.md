# `/pstack-port` 使用说明

用于从零建立或完整重建 pstack 的 DSH 移植基线。`SKILL.md` 只负责路由，`references/` 保存四个阶段说明；每次只加载一个分支，完成该阶段后停止。本说明供人阅读，不是额外执行分支。

## 使用方式

```text
/pstack-port audit
/pstack-port implement
/pstack-port review
/pstack-port doc
```

未指定分支时，技能会询问，不自动执行完整流水线。

## 阶段与确认门

1. `audit`：清点上游文档和脚本、核对 DSH 能力与本仓既定适配，生成**中文** `pstack/README.md`。
2. `implement`：按既定适配和 README 中已确定的方案实现插件内缺口、声明式插件组合及权限边界。
3. `review`：只读审查 DSH 插件范式、宿主能力复用、权限、最小实现和冗余残留，生成 `docs/port-review.md`；必要时退回实现。
4. `doc`：在实现审查通过后，按上游模板和真实实现生成**英文** `pstack/overlay/docs/harness/dsh.md`。

既定适配直接成为实现与验收基线。只有 `audit` 标为“待选择”的能力需要你在 `implement` 前选定方案。

## 与其他技能的分工

- 完整移植基线：本技能。
- 已移植插件的缺陷、独立功能和上游增量维护：`/pstack-maintain`。
- DSH 版本地扩展登记：`docs/extensions.md`，不属于上游原子能力。
