# EXT-004：pstack 推荐可选插件启用页

- status: review
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

- 目录：`src/internal/optional-plugins.ts` 为 `OPT-01` 至 `OPT-09` 的唯一目录，记录分组、包名、可切换 bundle 与默认推荐集；`tests/optional-plugins.test.ts` 对账 `pstack/harness/docs/harness/dsh.md` 的每个 OPT 行与包名，并核对两版 README 覆盖全部包名。
- 状态与开关：`src/client/optional-plugins-state.ts` 将 `BundleInfo` 映射为 `enabled` / `off` / `missing` / `unsupported-platform` / `error`；只对 `off` 或 `enabled` 的 bundle 行提供开关。`OPT-08` 固定 `switchable: false`；`OPT-03`、`OPT-07` 等非 bundle 项只给文档指引。
- 页面：`src/client/OptionalPluginsPage.tsx` 的推荐区按“会话与隔离 / 验证与证据 / 多代理”分组，显示推荐、GitHub 建议与冲突标签；`src/client/PstackBundleConfigPage.tsx` 把它放在角色模型配置页之前。打开页面只调用 `pluginManager.listBundles()`，不修改 profile。
- 一键启用：`enableRecommendedPlugins()` 按 `OPT-01`、`OPT-06` 顺序逐项调用 `pluginManager.setBundleEnabled(name, true)`，失败后继续并汇总 `applied` / `restart-required` / `failed` / `skipped`；`tests/optional-plugins.test.ts` 覆盖顺序、失败继续与缺失跳过。
- 启用引导：`plugins.bundle.activation` 注册以 `dsh-pstack` 为 key 的一次性提示，显示未开启推荐项数量，点击打开 bundle 详情页；`GuidanceStorage` 使用 `localStorage` 标记已读，`tests/optional-plugins.test.ts` 覆盖 dismissal。
- 验证：`vp check` 通过（0 errors，仅保留 `pstack/scripts/generate-pstack-harness-tree.mjs` 既有 warning）；`vp test` 15 个文件 93 个用例通过，其中新增 `tests/optional-plugins.test.ts` 11 例、`tests/optional-plugins-page.test.tsx` 6 例；`vp run @internal/pstack#check:harness-doc`、`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 与 `vp run build` 均通过。
- 范围：未改 `pstack/runtime/`、`pstack/harness/`、`pstack/README.md` 或 port 能力；新增代码只使用 Client 侧 `pluginManager` 公共 Remote 与现有 slot，不新增 Host 服务。

## 审查证据

待审查。
