# EXT-003：pstack 角色模型配置页

- status: passed
- repair_target: extension
- Issue: [#14](https://github.com/l246804/dsh-pstack/issues/14)
- 建立：2026-10-31（Issue #14 分诊，EXT-003 补充事项）
- DSH 版本：0.2.2-alpha.2（`ce7073d51254c26cd63b22a60835b8f948deb447`）
- 说明：EXT-003 主体已于 Issue #2 验收通过并在登记表保持 `active`；本工作文件只跟踪 Issue #14 的角色标签、说明文案与下拉布局补充。

## required_behavior

- 中文与英文界面分别为 17 个 manifest 角色显示非空本地化名称与用途说明，并保留原始角色键；覆盖检查遍历 `ROLE_MANIFEST` 与 `SUPPORTED_LOCALES`。
- 推理强度说明在中英文下都不包含 `pstack_subagent`、`set_reasoning_effort`，并明确“起步值 / 随任务难度浮动 / 非固定值”。
- 角色卡片中 provider 下拉独占一行，model 与 effort 在下一行；选择 provider 后长名称不被截断，选择前后边框计算样式一致。
- `pstackRoles` 的 `en` / `zh` 词典键集合完整一致；现有保存、校验、列表角色多路由行为不变；`vp check`、`vp test`、构建通过。
- 在 playground 的 17353 实例分别以中文和英文打开角色配置页验证，无控制台错误；真实保存/重置沿用现有验证方式。

## 实现与验证

- 实现文件：`src/client/locales.ts`（`pstackRoles` 的 `en` / `zh` 词典新增 17 个角色的本地化名称与用途键，并导出 `rolePresentation`；键集合保持一致，遵守 [配置页 i18n 决策](../../decisions/2026-10-30-pstack-config-page-i18n.md)）；`src/client/RoleSettingsPage.tsx`（角色卡片显示本地化名称、原始键与用途说明；推理强度说明只保留“起步值 / 随任务难度浮动 / 非固定值”；provider 独占一行，model 与 effort 下一行并排）；`src/client/PstackBundleConfigDialog.tsx`（左侧导航宽度适配英文标签；移除已不需要的 locale 注入）；`src/client/index.ts`（不再向详情页 action 注入 locale 服务）；`tests/role-page.test.tsx`（中英文角色名称/用途与列表顺序覆盖）；`docs/architecture.md`（Client 模块说明同步）。
- 行为：17 个角色在中文/英文界面分别显示对应语言的名称与用途，并保留 `feature, refactoring` 等原始角色键；推理强度说明不再包含 `pstack_subagent` / `set_reasoning_effort`；provider 选择前后计算样式一致（`1px solid`，原生 `<select>` 外观不额外处理）。
- 验证：`vp check` exit 0（仅 `pstack/scripts/generate-pstack-harness-tree.mjs` 既有 warning）；`vp test` 16 文件 96 项通过；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 输出 `pstack/pstack is up to date.`；`vp run build` exit 0；playground `127.0.0.1:17353` 实测中文与英文角色配置页，角色名称、用途说明与两行下拉布局正常，无控制台错误；provider 选择前后 `border` 计算样式均为 `1px solid rgba(0, 0, 0, 0.12)`。
- 范围检查：`git diff --name-only` 无 `pstack/README.md`、`pstack/pstack/`、`pstack/harness/`、`docs/harness-doc.yaml`、`pstack/runtime/` 变更；现有保存/校验行为未改。

## 审查证据

审查（2026-10-31，`review #14`）：通过。

- 对象：实现提交 `ad7a284`（审查基线 `8bdc291`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- `required_behavior` 核对：`src/client/locales.ts:49-84`（en）与 `188-221`（zh）为 17 个角色各提供名称与用途键，`93-142` 的 `roleCopyKeys` 按原始角色键映射，`226-233` 的 `rolePresentation` 经 `pstackRoles` 的 `t` 取值；`src/client/RoleSettingsPage.tsx:287`、`304`、`313` 渲染本地化名称、原始键与用途；`394-395` 的推理强度说明只保留起步值与难度浮动；`159-193` 与 `195-250` 为 provider 独占行、model/effort 下一行；`tests/role-page.test.tsx:156-164` 断言说明不含 `pstack_subagent` / `set_reasoning_effort`，`182-190` 遍历 `ROLE_MANIFEST` 与 `SUPPORTED_LOCALES` 校验名称、用途与原始键。
- 决策与接口：角色文案并入 `pstackRoles` 词典，符合 [2026-10-30-pstack-config-page-i18n](../../decisions/2026-10-30-pstack-config-page-i18n.md) 的按能力 locale 目录与 `SUPPORTED_LOCALES` 全量补齐要求；移除独立 `role-copy.ts` 与自定义 locale 订阅；未新增 Host 服务、Remote 方法或权限。
- 门禁：`vp check` exit 0（0 errors，仅 `pstack/scripts/generate-pstack-harness-tree.mjs` 既有 `require-array-sort-compare` warning）；`vp test` exit 0（16 文件 / 96 用例）；`vp run @internal/pstack#check:harness-doc` exit 0；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 输出 `pstack/pstack is up to date.`；`node pstack/scripts/port-fixes.mjs replay` 输出 `No active FIX records; replay passed.`；`vp run build` exit 0。
- 真实运行：playground `127.0.0.1:17353` 重启 reviewed build；中文与英文角色配置页均渲染本地化名称、原始键、用途说明与两行下拉布局；provider 选择前后 `border` 均 `1px solid rgba(0, 0, 0, 0.12)`；无控制台错误。
- 范围与共享回归：`git diff --name-only 8bdc291..ad7a284` 为 `docs/architecture.md`、`docs/extensions.md`、EXT-003/Issue #14 工作记录、`src/client/PstackBundleConfigDialog.tsx`、`src/client/RoleSettingsPage.tsx`、`src/client/locales.ts`、`tests/role-page.test.tsx`；无 port 基线路径，无保存/校验行为改动；既有测试全部通过。
- 结论：`required_behavior` 全部有实现/测试/真实页面证据，无未解决 finding；`status: passed`，等待 Issue #14 验收。
