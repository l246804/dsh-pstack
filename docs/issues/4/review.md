# Issue #4：pstack 推荐可选插件缺少集中启用入口

- Issue: https://github.com/l246804/dsh-pstack/issues/4
- target: extension
- status: open
- port_round: no-impact
- stage: implement
- EXT: EXT-004
- 公开状态: open（2026-10-30 创建；标题、正文与“A+B、默认推荐 OPT-01 + OPT-06、OPT-02 标注 GitHub 建议、逐项开关 + 一键启用推荐项”经用户确认；2026-10-30 分诊为 EXT-004；2026-10-30 实现审查未通过，待修复 locale 分层）
- 分诊证据提交: 本仓 `d92376bac594b54d13660a5825f356bb5227cd21` · DSH `ce7073d51254c26cd63b22a60835b8f948deb447` · 上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`

## 复核

- 版本与环境：dsh-pstack 0.2.0-beta.3、DSH 0.2.2-alpha.2、Node.js 24.22.1、Linux / Web GUI，与 Issue 一致；Issue 无评论（2026-10-30）。
- 当前行为：`README.zh.md` / `README.md` 的“可选 DSH 插件”与 `pstack/harness/docs/harness/dsh.md` 的 `## Optional plugins` 只列出 `OPT-01` 至 `OPT-09` 的包名、能力和边界；`Plugins → Installed plugins → dsh-pstack` 的 bundle 详情页只有角色模型配置页，没有 pstack 专属的推荐或集中开关入口。
- 最小复现（静态复核）：0.2.0-beta.3 的 `src/client/index.ts` 只注册 `plugins.bundle.config` 的 `RoleSettingsPage`，没有推荐插件区或 `plugins.bundle.activation` 引导；用户只能从文档抄包名，再到 Plugins 页逐个搜索、开关。
- 预期与实际：预期是 dsh-pstack 页面集中展示推荐插件、当前状态、平台/冲突限制，并支持逐项开关与一键启用推荐项；实际是只有文档表格和通用 Plugins 页，缺少 pstack 专属的推荐顺序与启用入口。
- 分诊结论：`extension`。这是上游 pstack 未声明的 DSH 版产品能力，不改变 port 基线的上游需求或现有 `PI-02` 实现范围；登记为 `EXT-004`，走 issue blocker 的 implement/review 路径。不选 `core`（不改上游能力与 README 基线）；不选 `bug`（现状与声明一致，功能尚未实现）；不选 `external`（DSH 0.2.2-alpha.2 已提供所需公共接口，责任在本仓插件）。

## required_behavior

- `Plugins → Installed plugins → dsh-pstack` 的 bundle 详情页提供“推荐插件”区。
- 默认推荐 `@deepseek-ai/dsh-experimental-tool-worktree`（OPT-01）与 `@deepseek-ai/dsh-experimental-session-search`（OPT-06）；`@deepseek-ai/dsh-experimental-forge-bundle`（OPT-02）标注为 GitHub PR 用户建议，不默认勾选。
- `OPT-03`、`OPT-04`、`OPT-05`、`OPT-07`、`OPT-09` 按任务场景分组展示；`OPT-08` 只展示与 `pstack_subagent` 的冲突警告，不提供一键开启。
- 每项显示当前状态：`enabled`、`off`、`missing`、`unsupported-platform`、`error`；用户可直接开关，并看到 `applied`、`restart-required`、`failed` 结果。
- 提供“一键启用推荐项”，按顺序启用默认推荐集合并汇总结果。
- 首次启用 dsh-pstack 后，通过 `plugins.bundle.activation` 显示一次引导：“还有 N 个推荐插件未开启”，点击可打开推荐区；不重复打扰。
- 打开页面只读，不自动修改 profile；所有变更由用户点击触发。
- `dsh-mcp-client` 这类非 bundle 项不提供开关，只给文档指引；包缺失时显示 `missing` 而非报错。
- 推荐插件页与角色模型配置页使用独立的 locale 命名空间与完整 `en` / `zh` 词典；不同能力之间不共享命名空间或同义键。
- `pstack` 既有技能、工具、agent preset 与测试不回退；新增 UI 行为有自动化测试覆盖。

## 映射

- 扩展登记：`EXT-004`（[docs/extensions.md](../../extensions.md)）；工作文件 [docs/extensions/EXT-004/review.md](../../extensions/EXT-004/review.md)。
- DSH 能力（0.2.2-alpha.2，`ce7073d`）：
  - **bundle 配置插槽**：`plugins.bundle.config` 以 npm 包名为 key，在 bundle 详情页渲染配置页（[ui-plugin-manager README](../../../upstream/deepseek-harness/packages/client/ui-plugin-manager/README.md)）。
  - **启用引导插槽**：`plugins.bundle.activation` 在用户从列表或详情页显式启用 bundle 后渲染，带 `onDismiss` 与 `onOpenDetails` 回调。
  - **插件管理 Remote**：`pluginManager.listBundles()` 返回 `BundleInfo[]`，含 `optional`、`enabled`、`availability`、`error`、`rows`；`pluginManager.setBundleEnabled(name, enabled)` 返回 `ChangeResult`，含 `application` 的 `applied` / `restart-required` / `failed`。
- 候选实现面：`src/client/`（推荐区、状态与开关、activation 引导、双语字典）、`src/internal/`（可选插件目录与 `OPT-*` 映射，便于测试）、`tests/`（目录与 dsh.md/README 一致性、页面渲染、Remote 调用）、`README.md` / `README.zh.md`、`pstack/harness/docs/harness/dsh.md`、`docs/architecture.md`、`docs/glossary.md`。
- 约束：不新增 Host 服务；不复制官方可选插件的组合；页面打开只读；不自动启用任何插件；`OPT-08` 与 `pstack_subagent` 不可同时启用。

## 实现

- 扩展实现：`src/internal/optional-plugins.ts`、`src/client/optional-plugins-state.ts`、`src/client/OptionalPluginsPage.tsx`、`src/client/PstackBundleConfigPage.tsx`、`src/client/index.ts`、`src/client/locales.ts`。
- 页面行为：bundle 详情页顶部提供“推荐插件”区，按任务场景分组显示 `OPT-01` 至 `OPT-09` 的状态、包名、推荐/GitHub 建议/冲突标签；`OPT-01` 与 `OPT-06` 为默认推荐，一键启用按顺序执行并汇总结果；`OPT-08` 不提供开关，`OPT-03`、`OPT-07` 等非 bundle 项只给文档指引。
- 启用引导：注册 `plugins.bundle.activation`（key `dsh-pstack`），首次启用 dsh-pstack 后显示“还有 N 个推荐插件未开启”，点击打开 bundle 详情页；`localStorage` 标记已读，不重复打扰。
- 文档与验证：根 `README.md` / `README.zh.md` 增加推荐插件页说明，`docs/architecture.md` 与 `docs/glossary.md` 同步；`vp check`、`vp test`（93 例）、`vp run @internal/pstack#check:harness-doc`、`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 见 EXT 工作文件。
- 范围：未修改 port 基线路径（`pstack/runtime/`、`pstack/harness/`、`pstack/README.md`）。

## 审查

审查（2026-10-30，`review #4`）：未通过。

- 对象：实现提交 `6c89da0b9e53c04fc8dac7cdad93baaf7d7f5e90`；当前 HEAD `9c3e556180073a5bf32b0d26eceb6e0c1d08a74e`；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- 范围：`git diff --name-only 1c2f12d..6c89da0` 未涉及 port 基线路径；实现只改根 README、`docs/`、`package.json`、`src/client/`、`src/internal/optional-plugins.ts` 与 `tests/`。
- 门禁：`vp check` exit 0（0 errors，仅既有 warning）；`vp test` exit 0（15 个文件 / 93 个用例）；`vp run @internal/pstack#check:harness-doc` exit 0；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0；`vp run build` exit 0。
- 真实安装：临时 `$DSH_HOME` 安装 `pnpm pack` 产物并启动 `dsh --profile ext004 --port 3199 --no-open`；boot 模块图含 `dsh-pstack/client.js` 且 combo HTTP 200，包含 `plugins.bundle.config` 与 `plugins.bundle.activation` 注册；`pluginManager/listBundles` 返回 `ok: true`（含 `off` 与 `unsupported-platform` 状态），`setBundleEnabled` 返回 `applied` 并持久化到 profile `package.json`。未用真实浏览器查看视觉；页面结构由 `react-dom/server` 静态渲染测试覆盖。
- Finding F-EXT-004-01（open）：推荐插件页 locale 未按能力分层。`docs/decisions/2026-10-30-pstack-config-page-bilingual.md:17` 要求推荐插件页使用独立 `pstackPlugins` 命名空间与完整 `en` / `zh` 词典；现状是 `src/client/locales.ts:3` 只有 `pstackRoles`，`src/client/index.ts:56` 只注册一份字典，`src/client/index.ts:92-114` 两个 slot 都使用 `pstackRoles`，`src/client/OptionalPluginsPage.tsx:31` 仍引用 `PstackRolesLocaleKey`，且没有 `pstackPlugins` 或独立词典文件；测试未校验命名空间隔离与跨能力键集合无交集。详见 [EXT-004 审查证据](../../extensions/EXT-004/review.md#审查证据)。
- 结论：其余 `required_behavior` 均有实现、自动化测试或实现层证据；真实安装覆盖 HMR 的 `applied` 与持久化，未覆盖无 HMR 的 `restart-required` 和真实浏览器视觉。locale 分层未实现，回到 implement，`stage: implement`。
