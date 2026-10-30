# EXT-004：pstack 推荐可选插件启用页

- status: implement
- repair_target: extension
- Issue: [#4](https://github.com/l246804/dsh-pstack/issues/4)
- 建立：2026-10-30（Issue #4 创建）
- DSH 版本：0.2.2-alpha.2（`ce7073d51254c26cd63b22a60835b8f948deb447`）

## required_behavior

- `Plugins → Installed plugins → dsh-pstack` 的 bundle 详情页提供“推荐插件”区。
- 默认推荐 `@deepseek-ai/dsh-experimental-tool-worktree`（OPT-01）与 `@deepseek-ai/dsh-experimental-session-search`（OPT-06）；`@deepseek-ai/dsh-experimental-forge-bundle`（OPT-02）标注为 GitHub PR 用户建议，不默认勾选。
- `OPT-03`、`OPT-04`、`OPT-05`、`OPT-07`、`OPT-09` 按任务场景分组展示；`OPT-08` 只展示与 `pstack_subagent` 的冲突警告，不提供一键开启。
- 每项显示当前状态：`enabled`、`off`、`missing`、`unsupported-platform`、`error`；用户可直接开关，并看到 `applied`、`restart-required`、`failed` 结果。
- 提供“一键启用推荐项”，按顺序启用默认推荐集合并汇总结果。
- 首次启用 dsh-pstack 后，通过 `plugins.bundle.activation` 显示一次引导：“还有 N 个推荐插件未开启”，点击可打开推荐区；不重复打扰。
- 打开页面只读，不自动修改 profile；所有变更由用户点击触发。
- `dsh-mcp-client` 这类非 bundle 项不提供开关，只给文档指引；包缺失时显示 `missing` 而非报错。
- `pstack` 既有技能、工具、agent preset 与测试不回退；新增 UI 行为有自动化测试覆盖。

## 实现与验证

待实现（下一步 `/pstack-port implement #4`）。

## 审查证据

待审查。
