# Issue #12：bundle 详情页配置改为页头「配置」按钮 + 仿 Settings 弹窗

- target: extension
- status: open
- port_round: pending
- stage: implement
- issue: https://github.com/l246804/dsh-pstack/issues/12
- 公开状态: OPEN（2026-10-30 创建，无评论、无标签）
- 关联 EXT: EXT-005（`status: implement`）
- 关联能力: EXT-003（角色模型配置）、EXT-004（推荐可选插件）

## required_behavior

- bundle 详情页页头右上角出现「配置」按钮（`plugins.detail.actions` 页头控件槽），点击打开居中模态框。
- 模态框为左右分栏：左侧分区导航可切换，右侧显示对应表单。
- 各分区原有功能不回归：推荐可选插件的状态展示、单项开关与「一键启用推荐项」；角色模型配置的读取、编辑、保存、重置、校验错误展示均正常。
- 详情页本身不再通过 `plugins.bundle.config` 出现内联配置块。
- 模态框视觉与 Settings 弹窗一致（遮罩、圆角居中卡片、关闭方式）。
- 支持中 / 英两种语言（沿用现有 `pstackRoles` / `pstackPlugins` 命名空间）。

## 分诊依据

- 事实核对（HEAD `3088705`）：`src/client/index.ts` 将配置注册在 `plugins.bundle.config`；`src/client/PstackBundleConfigPage.tsx` 以 grid 同时渲染 `OptionalPluginsSection` 与 `RoleSettingsPage`，即详情页内联配置块。
- DSH 公共接口（0.2.2-alpha.2，`dsh-client-ui-plugin-manager` 类型）：`plugins.bundle.config` 在详情页描述与行列表之间渲染（`view: 'page'`）；`plugins.detail.actions` 提供详情页页头控件，带 `subject`。目标落点可行。
- 版本与环境：dsh-pstack `0.2.0-beta.3`、DSH `>=0.2.2-alpha.2`，与 Issue 声明一致。
- 最小复现：不适用（体验改进 / 能力变更，非缺陷）。
- 分类结论：仅改 `src/client/` 的 Client 配置页表现层，不触 `pstack/README.md`、`docs/harness/dsh.md`、生成树或运行时脚本，不属 port 基线（`core`）；不是缺陷（`bug`）；无外部责任层（`external`）。故为 `extension`，新建 EXT-005 承载「页头入口 + 仿 Settings 模态框」容器，分区内容复用 EXT-003 / EXT-004。
- 首次分诊后停止：不实现、不关闭 Issue。
