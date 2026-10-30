# EXT-004：pstack 推荐可选插件启用页

- status: passed
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
- 推荐插件页与角色模型配置页使用独立的 locale 命名空间与完整 `en` / `zh` 词典；不同能力之间不共享命名空间或同义键。
- `pstack` 既有技能、工具、agent preset 与测试不回退；新增 UI 行为有自动化测试覆盖。

## 实现与验证

- 目录：`src/internal/optional-plugins.ts` 为 `OPT-01` 至 `OPT-09` 的唯一目录，记录分组、包名、可切换 bundle 与默认推荐集；`tests/optional-plugins.test.ts` 对账 `pstack/harness/docs/harness/dsh.md` 的每个 OPT 行与包名，并核对两版 README 覆盖全部包名。
- 状态与开关：`src/client/optional-plugins-state.ts` 将 `BundleInfo` 映射为 `enabled` / `off` / `missing` / `unsupported-platform` / `error`；只对 `off` 或 `enabled` 的 bundle 行提供开关。`OPT-08` 固定 `switchable: false`；`OPT-03`、`OPT-07` 等非 bundle 项只给文档指引。
- 页面：`src/client/OptionalPluginsPage.tsx` 的推荐区按“会话与隔离 / 验证与证据 / 多代理”分组，显示推荐、GitHub 建议与冲突标签；`src/client/PstackBundleConfigPage.tsx` 把它放在角色模型配置页之前。打开页面只调用 `pluginManager.listBundles()`，不修改 profile。
- Locale：`src/client/optional-plugins-locales.ts` 以 `NS = "pstackPlugins"` 提供推荐插件区与启用引导的完整 `en` / `zh` 词典；`src/client/locales.ts` 只保留角色模型配置页的 `pstackRoles`。`src/client/index.ts` 的 `apply` 分别注册两个命名空间，并把 `ctx.locale.bind("pstackPlugins")` 作为 `pluginsT` 注入推荐区；`plugins.bundle.activation` 注册使用 `pstackPlugins`。两个词典的键集合无交集。
- 一键启用：`enableRecommendedPlugins()` 按 `OPT-01`、`OPT-06` 顺序逐项调用 `pluginManager.setBundleEnabled(name, true)`，失败后继续并汇总 `applied` / `restart-required` / `failed` / `skipped`；`tests/optional-plugins.test.ts` 覆盖顺序、失败继续与缺失跳过。
- 启用引导：`plugins.bundle.activation` 注册以 `dsh-pstack` 为 key 的一次性提示，显示未开启推荐项数量，点击打开 bundle 详情页；`GuidanceStorage` 使用 `localStorage` 标记已读，`tests/optional-plugins.test.ts` 覆盖 dismissal。
- 验证：`vp check` 通过（0 errors，仅保留 `pstack/scripts/generate-pstack-harness-tree.mjs` 既有 warning）；`vp test` 16 个文件 95 个用例通过，其中新增 `tests/optional-plugins.test.ts` 11 例、`tests/optional-plugins-page.test.tsx` 6 例、`tests/bundle-config-page.test.tsx` 2 例；`tests/client-plugin.test.ts` 校验 `pstackRoles` / `pstackPlugins` 两个命名空间注册、各自 `en` / `zh` 键集合完整、跨能力键集合无交集，以及推荐区注入的独立 translator；`vp run @internal/pstack#check:harness-doc`、`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 与 `vp run build` 均通过。
- 范围：未改 `pstack/runtime/`、`pstack/harness/`、`pstack/README.md` 或 port 能力；新增代码只使用 Client 侧 `pluginManager` 公共 Remote 与现有 slot，不新增 Host 服务。

## 审查证据

审查（2026-10-30，`review #4`）：未通过。

- 对象：本仓实现提交 `6c89da0b9e53c04fc8dac7cdad93baaf7d7f5e90`；当前 HEAD `9c3e556180073a5bf32b0d26eceb6e0c1d08a74e`（决策记录更新）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- 范围：`git diff --name-only 1c2f12d..6c89da0` 只涉及根 README、`docs/`、`package.json`、`src/client/`、`src/internal/optional-plugins.ts` 与 `tests/`；未修改 `pstack/pstack/`、`pstack/runtime/`、`pstack/harness/`、`pstack/README.md` 等 port 基线路径。
- 自动化：`vp check` exit 0（69 个文件格式通过，0 errors，仅保留 `pstack/scripts/generate-pstack-harness-tree.mjs:204` 既有 `require-array-sort-compare` warning）；`vp test` exit 0（15 个文件 / 93 个用例通过，含 `tests/optional-plugins.test.ts` 11 例、`tests/optional-plugins-page.test.tsx` 6 例、`tests/client-plugin.test.ts` 1 例）；`vp run @internal/pstack#check:harness-doc` exit 0（2/2）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0（无 active FIX）；`vp run build` exit 0。
- 真实安装（独立复核）：临时 `$DSH_HOME` 安装 `pnpm pack` 产物并启动 `dsh --profile ext004 --port 3199 --no-open`；boot HTML 的模块图包含 `dsh-pstack/client.js`（combo HTTP 200，66,287 bytes），bundle 同时包含 `plugins.bundle.config` 与 `plugins.bundle.activation` 注册；RPC `pluginManager/listBundles` 返回 `ok: true`，`@deepseek-ai/dsh-experimental-tool-worktree` 与 `@deepseek-ai/dsh-experimental-session-search` 为 `off`，`@deepseek-ai/dsh-cua-bundle` 返回 `error.code = "unsupported-platform"`；`pluginManager/setBundleEnabled(tool-worktree, true)` 返回 `{ changed: true, application: "applied" }`，profile `package.json` 的 bundle 列表持久化该选择，重新读取 `listBundles` 为 `enabled: true`。未用真实浏览器查看视觉；页面结构由 `react-dom/server` 静态渲染测试覆盖。
- **Finding F-EXT-004-01（open）：推荐插件页 locale 未按能力分层。** 决策记录 `docs/decisions/2026-10-30-pstack-config-page-bilingual.md:17` 要求角色模型配置页使用 `pstackRoles`、推荐插件页使用 `pstackPlugins`，且不同能力不得共享命名空间、词典或复用同义键；当前 `src/client/locales.ts:3` 只有 `export const NS = "pstackRoles"`，`src/client/index.ts:56` 只注册这一份字典，`src/client/index.ts:92-114` 两个 slot 都使用 `locale: NS`，`src/client/OptionalPluginsPage.tsx:31` 仍从 `locales.ts` 取 `PstackRolesLocaleKey`，仓库中不存在 `pstackPlugins` 命名空间或独立词典。`tests/optional-plugins-page.test.tsx:11` 也从角色词典取文案，`tests/client-plugin.test.ts:61-66` 断言两个 slot 的 locale 都是 `pstackRoles`，没有覆盖命名空间隔离或跨能力键集合无交集。影响：推荐插件页的文案与角色模型配置页共用一套键空间，违反「每个插件配置能力独立命名空间与词典」的当前契约，后续新增能力时存在键覆盖风险。
- 修复方向：把推荐插件页文案拆到 `src/client/optional-plugins-locales.ts`（`NS = "pstackPlugins"`，完整 `en` / `zh`），在 `apply` 中分别注册 `pstackRoles` 与 `pstackPlugins` 并用独立 translator 注入推荐区/activation；同步更新页面测试和 `docs/architecture.md`、`docs/glossary.md`。
- 结论：除 F-EXT-004-01 外，其余 `required_behavior` 均有实现、自动化测试或实现层证据；真实安装覆盖 HMR 的 `applied` 与 profile 持久化，未覆盖无 HMR 的 `restart-required` 和真实浏览器视觉。审查不通过，回到 implement。

## 修复记录

- F-EXT-004-01（closed，2026-10-30）：推荐插件文案已拆到 `src/client/optional-plugins-locales.ts`（`NS = "pstackPlugins"`，完整 `en` / `zh`）；`src/client/index.ts` 的 `apply` 分别注册 `pstackRoles` 与 `pstackPlugins` 两套字典，向推荐区注入 `pluginsT`，`plugins.bundle.activation` 注册使用 `pstackPlugins`；`src/client/locales.ts` 只保留角色模型配置页文案。`tests/client-plugin.test.ts` 覆盖命名空间注册、各词典 `en` / `zh` 键集合完整与跨能力键集合无交集；`tests/bundle-config-page.test.tsx` 覆盖组合页中英各一次。
- 验证：`vp check` exit 0（0 errors，仅既有 `require-array-sort-compare` warning）；`vp test` exit 0（16 文件 / 95 用例）；`vp run @internal/pstack#check:harness-doc`、`node pstack/scripts/generate-pstack-harness-tree.mjs --check`、`node pstack/scripts/port-fixes.mjs replay` 与 `vp run build` 均 exit 0。
- 范围：只改 `src/client/`、`tests/`、`docs/architecture.md` 与 `docs/glossary.md`；未改 `pstack/runtime/`、`pstack/harness/`、`pstack/README.md`。

## 复核证据

复核（2026-10-30，`review #4`）：通过。

- 对象：修复提交 `9ed61907d96f0db0e16c5e13f8257c12097a1260`（审查基线 `8420b09`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- Finding F-EXT-004-01：已关闭。`src/client/optional-plugins-locales.ts:5` 定义独立 `pstackPlugins`，`src/client/locales.ts:3` 只保留 `pstackRoles`；`src/client/index.ts:60-67` 分别注册两套字典，`src/client/index.ts:103-125` 的 config slot 以 `pstackRoles` 注册并注入绑定 `pstackPlugins` 的 `pluginsT`，activation slot 使用 `pstackPlugins`。`tests/client-plugin.test.ts:65-76` 校验两个命名空间、完整 `en` / `zh` 键集合与跨能力键集合无交集；`tests/bundle-config-page.test.tsx` 校验组合页中英各一次。
- 自动化：`vp check` exit 0（71 个文件格式通过，0 errors，仅保留 `pstack/scripts/generate-pstack-harness-tree.mjs:204` 既有 `require-array-sort-compare` warning）；`vp test` exit 0（16 个文件 / 95 个用例通过，含 `tests/bundle-config-page.test.tsx` 2 例、`tests/client-plugin.test.ts` 1 例、`tests/optional-plugins-page.test.tsx` 6 例）；`vp run @internal/pstack#check:harness-doc` exit 0（2/2）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0（无 active FIX）；`vp run build` exit 0。
- 真实安装（独立复核）：用 `pnpm pack --ignore-scripts` 产物在临时 `$DSH_HOME` 的新 profile 安装并启动 `dsh --profile ext004 --port 3218 --no-open`；boot HTML 的模块图含 `{"id":"dsh-pstack","url":"plugins/??dsh-pstack/client.js&rev=1b626f386268"}`，client combo HTTP 200（66,558 bytes）；served client.js 同时定义 `pstackRoles` 与 `pstackPlugins`，`ctx.locale.register` 两次并带 `pstack-roles.locale` / `pstack-plugins.locale` 标签；config slot 的 `locale` 为 `pstackRoles` 且 `pluginsT: ctx.locale.bind(NS)` 绑定 `pstackPlugins`，activation slot 的 `locale` 为 `pstackPlugins`。未用真实浏览器查看视觉；页面结构由 `react-dom/server` 静态渲染测试覆盖。
- 范围：`git diff --name-only 8420b09..9ed6190` 仅涉及 `docs/`、`src/client/` 与 `tests/`；未改 `pstack/pstack/`、`pstack/runtime/`、`pstack/harness/`、`pstack/README.md` 等 port 基线路径。
- 结论：`required_behavior` 均有实现、自动化测试或真实安装证据；未发现未解决 finding。EXT-004 工作文件写 `passed`，登记表恢复 `active`；下一步 `/pstack-port issue #4`。
