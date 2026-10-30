# Issue #12：bundle 详情页配置改为页头「配置」按钮 + 仿 Settings 弹窗

- target: extension
- status: open
- port_round: no-impact
- stage: passed
- issue: https://github.com/l246804/dsh-pstack/issues/12
- 公开状态: OPEN（2026-10-30 创建，无评论、无标签；2026-10-31 实现审查通过）
- 关联 EXT: EXT-005（`status: passed`）
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

## 实现

- 扩展实现：`src/client/PstackBundleConfigDialog.tsx`（新增）、`src/client/index.ts`、`src/client/RoleSettingsPage.tsx`、`src/client/optional-plugins-locales.ts`。
- 入口变更：`client/index.ts` 从 `plugins.bundle.config` 改为 `plugins.detail.actions` 注册 `PstackBundleConfigAction`；只有 dsh-pstack bundle 详情页显示「配置」按钮。
- 模态框：点击按钮打开 `createPortal` 到 `document.body` 的仿 Settings 居中模态框；遮罩、圆角面板、右上关闭按钮、遮罩点击与 Escape 均可关闭；左侧导航切换「推荐插件」与「角色模型配置」，右侧复用 EXT-004 的推荐区与 EXT-003 的角色编辑器。
- 详情页：不再存在 `plugins.bundle.config` 注册或内联配置块。
- 文案：`pstackPlugins` 增加配置按钮、模态框标题、分区导航与关闭按钮的中英词条；分区标题沿用现有词典键。
- 测试：`tests/bundle-config-dialog.test.tsx` 覆盖按钮出现条件、两种分区与全部支持语言文案；`tests/client-plugin.test.ts` 覆盖新槽位注册与注入面。
- 真实插件验证：playground 17353 重启后，详情页页头出现「Configure」按钮，点击打开仿 Settings 模态框；Plugins / Roles 分区切换正常，角色分区读取到 `playground/.dsh/pstack-models.mdc` 的 `loaded` 状态（17 个 `select`）；Escape 与关闭按钮均从打开变为关闭（`{ before: true, after: false }`），详情页 `[data-plugin-config]` 为 `false`，控制台无错误（截图 `.tmp/pg-dialog-final.png`、`.tmp/pg-dialog-roles-final.png`）。
- 验证：`vp check`、`vp test`（16 个文件、95 个用例）、`vp run build`、`node pstack/scripts/generate-pstack-harness-tree.mjs --check`、`vp run @internal/pstack#check:harness-doc` 与 `node pstack/scripts/port-fixes.mjs replay` 均退出 0；未改 `pstack/runtime/`、`pstack/harness/`、`pstack/README.md` 或 port 能力。

## 审查

- 审查（2026-10-31，`review #12`）：实现审查通过。实现提交 `c73a48f134e80ce8dee6122c7560cf96bf19c267`（审查基线 `a650a12`，功能基线 `3088705`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- 行为核对：`src/client/index.ts:107-117` 改注册 `plugins.detail.actions` 且不再注册 `plugins.bundle.config`；`src/client/PstackBundleConfigDialog.tsx:191-209` 只对 dsh-pstack bundle 渲染按钮，`230-250` 用 `createPortal` 打开模态框并绑定 Escape，`266-318` 渲染遮罩、居中面板、左侧分区导航与右侧分区；`src/client/RoleSettingsPage.tsx:513-519` 保持原有表单行为。全部 `required_behavior` 均有实现对应。
- 自动化：`vp check` exit 0（78 个文件格式通过，0 errors，仅既有 `require-array-sort-compare` warning）；`vp test` exit 0（16 个文件 / 95 个用例，含 `tests/bundle-config-dialog.test.tsx` 2 例、`tests/client-plugin.test.ts` 1 例、`tests/role-page.test.tsx` 7 例、`tests/optional-plugins-page.test.tsx` 5 例）；`vp run build` exit 0；`vp run @internal/pstack#check:harness-doc` exit 0（2/2）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0（无活跃 FIX）。
- 真实安装（独立复核）：`pnpm pack --ignore-scripts` 产物在临时 `$DSH_HOME` 的新 profile `review12` 安装为 `dsh-pstack@0.2.0-beta.3`；`dsh --profile review12 --port 3218 --no-open` 的 boot HTML 模块图含 `plugins/??dsh-pstack/client.js&rev=087b22070362`，安装包 `dist/client.mjs` 含 3 处 `plugins.detail.actions`、0 处 `plugins.bundle.config`。
- 视觉：查看 playground 截图 `.tmp/pg-detail.png`、`.tmp/pg-dialog-final.png`、`.tmp/pg-dialog-roles-final.png`，页头 Configure 按钮、仿 Settings 模态框、Plugins / Roles 分区与 `loaded` 角色文件均可见；控制台无错误。
- 范围：`git diff --name-only 3088705..HEAD` 未触 `pstack/pstack/`、`pstack/runtime/`、`pstack/harness/`、`pstack/README.md`、`docs/harness-doc.yaml` 等 port 基线路径。
- 结论：`required_behavior` 全部有实现、自动化或真实安装/视觉证据，无未解决 finding；`stage: passed`。下一步 `/pstack-port issue #12` 验收。
