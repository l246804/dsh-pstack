# EXT-003：pstack 角色模型配置页

- status: implement
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

待实现（下一步 `/pstack-port implement #14`）。

## 审查证据

待审查。
