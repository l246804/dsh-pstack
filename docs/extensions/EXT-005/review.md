# EXT-005：bundle 配置模态框

- status: passed
- repair_target: extension
- issue: https://github.com/l246804/dsh-pstack/issues/12
- 关联能力: EXT-003（角色模型配置）、EXT-004（推荐可选插件）

## required_behavior

- bundle 详情页页头右上角出现「配置」按钮（`plugins.detail.actions` 页头控件槽），与页面自身的开关、卸载等控件同区。
- 点击「配置」按钮打开一个居中模态框，外观与交互仿照 Settings 设置弹窗（遮罩、圆角居中卡片、可关闭）。
- 模态框内部左右分栏：左侧为配置分区导航（推荐可选插件、角色模型配置），右侧显示当前选中分区的表单内容；切换左侧分区时右侧随之切换。
- 详情页不再通过 `plugins.bundle.config` 内联渲染配置块，配置只在模态框中出现。
- 各分区原有功能不回归：推荐可选插件的状态展示、单项开关与「一键启用推荐项」；角色模型配置的读取、编辑、保存、重置、校验错误展示均正常。
- 关闭模态框后回到 bundle 详情页；未保存的编辑按现有策略丢弃（离开即丢弃暂存修改，只有保存才写入）。
- 支持中 / 英两种语言，沿用现有 `pstackRoles` / `pstackPlugins` locale 命名空间。

## 实现证据

- 入口：`src/client/index.ts` 改为向 `plugins.detail.actions` 注册 `PstackBundleConfigAction`（`id: dsh-pstack`，`locale: pstackPlugins`），不再注册 `plugins.bundle.config`；注入面为角色 Remote API、推荐插件 API 与 `pstackRoles` translator。
- 页面：`src/client/PstackBundleConfigDialog.tsx` 的「配置」按钮只对 `subject.kind === "bundle" && subject.pkg.name === "dsh-pstack"` 渲染；点击后用 `createPortal` 打开仿 Settings 的居中模态框（遮罩、圆角 `--dsw-radius-panel` 卡片、右上关闭按钮、遮罩点击与 Escape 关闭），左侧 188px 分区导航在「推荐插件」与「角色模型配置」间切换，右侧渲染对应分区。
- 分区复用：推荐分区继续使用 `OptionalPluginsSection`（EXT-004），角色分区继续使用 `RoleSettingsPage`（EXT-003）；`RoleSettingsPage` 的 props 从 `plugins.bundle.config` 槽位类型改为模态框内使用的 `RoleSettingsPageProps`，不改变表单行为。
- 文案：`pstackPlugins` 命名空间新增 `configureAction` / `configureTitle` / `configureSections` / `configurePluginsSection` / `configureRolesSection` / `configureClose` 的中英词条；分区正文标题沿用现有 `optionalPluginsTitle` 与 `pstackRoles.title`。
- 测试：`tests/bundle-config-dialog.test.tsx` 覆盖按钮仅对 dsh-pstack bundle 出现、两种分区在全部支持语言下的标题/内容/关闭文案；`tests/client-plugin.test.ts` 改为断言 `plugins.detail.actions` 注册与注入面，并确认不再注册 `plugins.bundle.config`。原有 `tests/role-page.test.tsx`（7 例）与 `tests/optional-plugins-page.test.tsx`（5 例）继续通过，覆盖角色表单的读取/编辑/保存/重置/校验与推荐区状态/开关/一键启用。
- 真实插件验证：`playground`（17353）重启后，Plugins → pstack 详情页页头出现「Configure」按钮；点击打开仿 Settings 的居中模态框（截图 `.tmp/pg-dialog-final.png`、`.tmp/pg-dialog-roles-final.png`），左侧 Plugins / Roles 分区切换正常，角色分区读取 `playground/.dsh/pstack-models.mdc` 为 `loaded`（17 个 `select`）；Escape 从打开到关闭的观察结果为 `{ before: true, after: false }`，点击关闭按钮同样从 `true` 变为 `false`，控制台无错误；详情页 `[data-plugin-config]` 观察结果为 `false`。
- 验证：`vp check` 退出 0（0 errors，保留 `pstack/scripts/generate-pstack-harness-tree.mjs` 既有 warning）；`vp test` 退出 0（16 个文件、95 个用例）；`vp run build` 退出 0；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` 退出 0；`vp run @internal/pstack#check:harness-doc` 退出 0；`node pstack/scripts/port-fixes.mjs replay` 退出 0（无活跃 FIX）。

## 审查证据

- 审查（2026-10-31，`review #12`）：通过。对象为实现提交 `c73a48f134e80ce8dee6122c7560cf96bf19c267`（审查基线 `a650a12`，功能基线 `3088705`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- 行为核对：`src/client/index.ts:107-117` 向 `plugins.detail.actions` 注册 `PstackBundleConfigAction`，不再注册 `plugins.bundle.config`；`src/client/PstackBundleConfigDialog.tsx:191-209` 只对 dsh-pstack bundle 渲染按钮，`230-250` 用 `createPortal` 打开模态框并在 `useEffect` 绑定 Escape，`266-318` 渲染遮罩、居中面板、左侧分区导航与右侧分区；`src/client/RoleSettingsPage.tsx:513-519` 的 `RoleSettingsPageProps` 只保留 `api` 与 translator，表单逻辑未改。七个 `required_behavior` 均有对应实现。
- 自动化：`vp check` exit 0（78 个文件格式通过，0 errors，仅保留 `pstack/scripts/generate-pstack-harness-tree.mjs:204` 既有 `require-array-sort-compare` warning）；`vp test` exit 0（16 个文件 / 95 个用例，含 `tests/bundle-config-dialog.test.tsx` 2 例、`tests/client-plugin.test.ts` 1 例、`tests/role-page.test.tsx` 7 例、`tests/optional-plugins-page.test.tsx` 5 例）；`vp run build` exit 0；`vp run @internal/pstack#check:harness-doc` exit 0（2/2）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0（无活跃 FIX）。
- 真实安装（独立复核）：`pnpm pack --ignore-scripts` 生成 `dsh-pstack-0.2.0-beta.3.tgz`，在临时 `$DSH_HOME` 的新 profile `review12` 安装后 `dsh plugin --profile review12 list` 显示 `dsh-pstack@0.2.0-beta.3`；启动 `dsh --profile review12 --port 3218 --no-open` 后 boot HTML 的模块图含 `plugins/??dsh-pstack/client.js&rev=087b22070362`，安装包 `dist/client.mjs` 含 3 处 `plugins.detail.actions`、0 处 `plugins.bundle.config`，说明真实安装产物加载的是新入口。
- 视觉：查看实现方 playground 截图 `.tmp/pg-detail.png`（页头 Configure 按钮）、`.tmp/pg-dialog-final.png`（Plugins 分区模态框）、`.tmp/pg-dialog-roles-final.png`（Roles 分区，角色文件 `loaded` 与 17 个 `select`）；遮罩、圆角居中卡片、左侧导航和关闭方式与 Settings 样式一致，控制台无错误。
- 范围：`git diff --name-only 3088705..HEAD` 仅涉及 `README*.md`、`docs/`、`playground/README.md`、`src/client/` 与 `tests/`；未改 `pstack/pstack/`、`pstack/runtime/`、`pstack/harness/`、`pstack/README.md`、`docs/harness-doc.yaml` 等 port 基线路径。
- 结论：`required_behavior` 均有实现、自动化测试或真实安装/视觉证据；未发现未解决 finding。EXT-005 工作文件写 `passed`，登记表恢复 `active`；下一步 `/pstack-port issue #12`。

## 验收证据

- 待验收（Issue #12）。
