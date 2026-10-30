# EXT-003：pstack 角色模型配置页

- status: implement
- repair_target: extension
- Issue: [#8](https://github.com/l246804/dsh-pstack/issues/8)
- 建立：2026-10-30（Issue #8 分诊，EXT-003 补充文案事项）
- DSH 版本：0.2.2-alpha.2（`ce7073d51254c26cd63b22a60835b8f948deb447`）
- 说明：EXT-003 主体已于 Issue #2 验收通过并在登记表保持 `active`；本工作文件只跟踪 Issue #8 的页面文案补充。

## required_behavior

- 角色模型配置页（`pstackRoles` 命名空间）在 `en` 与 `zh` 两种文案中都说明：配置的推理强度是**基准值（起步值）而非固定值**。
- 浮动规则说明：
  - 范围：只在**该模型声明的强度阶梯内**上下移动（即下拉里列出的那组 token，如 `low → medium → high`），无固定数值幅度。
  - 向上升级：任务比角色预设更难时（如复杂设计、并发、算法工作），调到更高 token。
  - 向下降低：剩余工作转为机械、常规时，调到更低 token。
  - 触发方式：单次委派用 `pstack_subagent` 的 `reasoningEffort` 覆盖；运行中的子代理用 `set_reasoning_effort` 调整，从下一步生效。
  - 边界：模型未声明任何 effort 时不浮动；「未指定」＝适配器默认。
- 说明可复用页面已有的 `efforts` 列表引用当前模型声明的强度阶梯，无需新增后端字段。
- `pstackRoles` 命名空间保持 `en` / `zh` 键集合完整且一致；现有 locale 完整性与页面渲染测试通过；不改变保存/校验行为。

## 实现与验证

待实现（下一步 `/pstack-port implement #8`）。

## 审查证据

待审查。
