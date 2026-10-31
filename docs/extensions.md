# DSH 版本地扩展

登记上游 pstack 未声明、由 DSH 版插件独立维护的产品能力。`EXT-*` 编号跨实现、Issue 和验收保持不变；`proposed` 表示已登记待实现，`active` 表示已实现并受回归验证保护，`retired` 表示已退役。移植能力使用 `pstack/README.md` 的原子能力编号，不在此登记。

每次基线重建都保留 `proposed` 与 `active` 条目，并验收 `active` 条目；本清单不代表功能已实现。

## EXT-003：pstack 角色模型配置页

- 状态：active
- 用户场景：安装 dsh-pstack 后，在 DSH Web/Desktop 的 Plugins 页查看并编辑 `$DSH_HOME/pstack-models.mdc`，无需手改文件或让 agent 整文件重写。
- 范围：角色文件路径与 `missing` / `loaded` / `unreadable` 状态；17 个角色的当前路由与 `inherit-parent` 回退；单角色编辑与重置；`pstack_models` 实时目录的 provider/model/effort 校验；幂等写回与缺失创建；未知角色或格式错误按行号展示；与 `/setup-pstack` 共用同一文件。
- 验收：Issue #2 验收通过（2026-10-30）；补充文案 Issue #8 验收通过（2026-10-30）；角色标签与布局 Issue #14 验收通过（2026-10-31）；验收行为、自动化测试与真实安装证据见对应 Issue 的验收评论。
- DSH 公共接口与兼容版本：0.2.2-alpha.2；`dsh.client` 浏览器半、Typert Remote（`TypertRemoteService` + 手写 strict 描述符，本仓无生成链）；配置分区经 EXT-005 的 `plugins.detail.actions` 模态框承载。
- 实现与验证：已实现、审查与验收通过（Issue #2，2026-10-30）；实现文件与测试见提交历史，验证证据见 Issue #2 的验收评论。
- Issue：[#2](https://github.com/l246804/dsh-pstack/issues/2)
- 补充 Issue：[#8](https://github.com/l246804/dsh-pstack/issues/8)（推理强度说明文案补充，2026-10-30 验收通过）
- 补充 Issue：[#14](https://github.com/l246804/dsh-pstack/issues/14)（角色标签本地化、推理强度说明简化与下拉布局，2026-10-31 验收通过）

## EXT-004：pstack 推荐可选插件启用页

- 状态：active
- 用户场景：安装 dsh-pstack 后，在 DSH Web/Desktop 的 Plugins 页集中看到 pstack 推荐的可选插件、用途、当前状态与平台/冲突限制，并可直接开关；不必从 README 抄包名再到 Plugins 页逐个搜索。
- 范围：dsh-pstack bundle 详情页的“推荐插件”区；默认推荐 OPT-01 与 OPT-06，OPT-02 标注 GitHub 建议，OPT-03/04/05/07/09 按任务分组，OPT-08 仅冲突警告；读取 pluginManager 的 bundle 状态；单项开关与“一键启用推荐项”；首次启用 dsh-pstack 后的 plugins.bundle.activation 引导；不自动启用、不复制官方可选插件组合。
- 验收：Issue #4 验收通过（2026-10-30）；验收行为、自动化测试与真实安装证据见 [Issue #4](https://github.com/l246804/dsh-pstack/issues/4) 的验收评论。
- DSH 公共接口与兼容版本：0.2.2-alpha.2；`plugins.bundle.activation`、`pluginManager.listBundles`、`pluginManager.setBundleEnabled`（通过插件管理器 Remote）；推荐分区经 EXT-005 的 `plugins.detail.actions` 模态框承载。
- 实现与验证：已实现、审查与验收通过（Issue #4，2026-10-30）；推荐插件页使用独立的 `pstackPlugins` locale 命名空间与按语言组织的完整词典，角色模型配置页保留 `pstackRoles`；实现文件与测试见提交历史，验证证据见 Issue #4 的验收评论。
- Issue：[#4](https://github.com/l246804/dsh-pstack/issues/4)

## EXT-005：bundle 配置模态框

- 状态：active
- 用户场景：安装 dsh-pstack 后，在 DSH Web/Desktop 的 Plugins → dsh-pstack bundle 详情页，配置（推荐可选插件 + 角色模型配置）不再内联铺满详情页，而是通过页头右上角的「配置」按钮打开一个仿 Settings 的居中模态框；模态框左侧为分区导航、右侧显示对应表单，便于集中查看与编辑。
- 范围：bundle 详情页页头「配置」按钮（`plugins.detail.actions`）；仿 Settings 的居中模态框（遮罩、居中卡片、可关闭）；内部左右分栏（左导航 / 右表单）；分区内容复用 EXT-003（角色模型配置）与 EXT-004（推荐可选插件）；详情页移除 `plugins.bundle.config` 内联渲染；中 / 英双语沿用现有 locale 命名空间。
- 验收：Issue #12 验收通过（2026-10-31）；验收行为、自动化测试与真实安装证据见 [Issue #12](https://github.com/l246804/dsh-pstack/issues/12) 的验收评论。
- DSH 公共接口与兼容版本：0.2.2-alpha.2；`plugins.detail.actions`（详情页页头控件槽）、`plugins.bundle.config`（由内联渲染改为不再使用）、`plugins.bundle.activation`；Settings 弹窗（`dsh-client-ui-settings` / `dsh-client-ui-settings-general` 的 SettingsRoot）仅作视觉参照，不复用其组件。
- 实现与验证：已实现、审查与验收通过（Issue #12，2026-10-31）；实现文件与测试见提交历史，验证证据见 Issue #12 的验收评论。
- Issue：[#12](https://github.com/l246804/dsh-pstack/issues/12)
