# EXT-003：pstack 角色模型配置页

- status: review
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

- 实现文件：`src/client/locales.ts`（`pstackRoles` 的 `en` / `zh` 新增 `effortBaselineTitle`、`effortBaselineIntro`、`effortRuleRange`、`effortRuleUp`、`effortRuleDown`、`effortRuleTrigger`、`effortRuleBoundary` 七个键，键集合保持一致）；`src/client/RoleSettingsPage.tsx`（新增 `RoleEffortNote` 说明区块，置于页头与正文之间，`en` / `zh` 复用同一套键）；`tests/role-page.test.tsx`（新增中英各一条渲染断言）。
- 行为：说明该页配置的推理强度是基准值（起步值）而非固定值；浮动只在该模型声明的强度阶梯（下拉列出的 token，如 `low → medium → high`）内移动；任务更难时上调、转为机械时下调；单次委派用 `pstack_subagent` 的 `reasoningEffort` 覆盖，运行中的子代理用 `set_reasoning_effort` 从下一步生效；模型未声明 effort 时不浮动，「未指定」＝适配器默认。复用页面已有 `efforts` 列表描述阶梯，未新增后端字段，未改保存/校验行为。
- 验证：`vp test tests/role-page.test.tsx` 8 passed；`vp test` 97 passed（16 files）；`vp check` exit 0（另 1 条为 `pstack/scripts/generate-pstack-harness-tree.mjs` 既有 warning，非本次改动）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 输出 `pstack/pstack is up to date`，exit 0。
- 范围检查：`git diff --name-only` 仅 `src/client/locales.ts`、`src/client/RoleSettingsPage.tsx`、`tests/role-page.test.tsx`，无 port 基线路径。

## 审查证据

待审查。
