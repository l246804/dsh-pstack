# EXT-003：pstack 角色模型配置页

- status: passed
- repair_target: extension
- Issue: [#2](https://github.com/l246804/dsh-pstack/issues/2)
- 建立：2026-10-30（Issue #2 首次分诊）
- DSH 版本：0.2.2-alpha.2（`ce7073d51254c26cd63b22a60835b8f948deb447`）

## required_behavior

- Plugins 页的 dsh-pstack bundle 页提供配置页，显示 `$DSH_HOME/pstack-models.mdc` 的绝对路径与加载状态：`missing`、`loaded`、`unreadable`；`unreadable` 显示实际原因。
- 按 `src/internal/role-manifest.ts` 的 manifest 顺序显示全部 17 个角色；已配置角色显示当前 `provider/model [effort]`（无 effort 时 `provider/model`），未配置角色显示 `inherit-parent`（继承父级路由）。
- 每个角色可从 `pstack_models` 的实时目录选择 provider、model 与该模型声明的 effort；`inherit-parent` / `auto` 仍可选。
- 选择不存在的 provider/model 或该模型未声明的 effort 时，保存被拒绝并显示原因，文件不变。
- 每个角色提供重置按钮，恢复为默认的 `inherit-parent`；保存后不残留旧的 `provider/model [effort]`。
- 保存写回 `$DSH_HOME/pstack-models.mdc`：只更新对应角色行，其他角色行与 `# budget` 行保持不变；连续保存两次结果一致；文件缺失时创建。
- 保存后无需重启，下一次 `pstack_subagent` 委派立即使用新值；已在运行的子代理不受影响。
- 未知/退役角色行或格式错误按行号显示，不静默删除原行。
- 与 `/setup-pstack` 读写同一文件，结果一致。
- `pstack_models`、`pstack_subagent` 与既有测试不回退；新增 UI 行为有自动化测试覆盖。
- 列表角色（`arena runners`、`arena cross-judge pool`、`swarm workers`、`architect runners`、`interrogate reviewers`）显示完整多 route 现值；保存单个角色不得静默丢弃未展示的 route。

## 实现与验证

实现（2026-10-30）：

- Host：`src/roles.ts` 的 `PstackRolesService`（Cordis 服务 `pstackRoles`）提供 `status`、`catalogue`、`save` 三个方法；`Service.init` 用 `ctx.typert.register()` 注册 `src/remote.ts` 手写 strict `TypertRemoteInfo`，无 Typert 生成链。`catalogue` 与保存校验复用 `collectCatalogue`，写回复用 `readRoleConfiguration` 并新增 `src/internal/role-editor.ts`。
- Client：`package.json` 增加 `dsh.client`（`platform: "web"`）与 `./client`、`./remote`、`./roles` 出口；`vite.config.ts` 第二个 pack 配置把 `src/client/index.ts` 包成 `window.__ModuleLoader__.load({ id: "dsh-pstack", factory })`，React 与平台模块保持 external；`src/client/` 的配置页按 manifest 顺序渲染 17 个角色、多 route 列表、provider/model/effort 选择、逐角色保存与重置，并按行号显示未知/格式错误行。
- 写入语义：只替换目标角色的最后一行，其他角色行、`# budget` 行、未知行与格式错误行原样保留；文件缺失时创建，不可读时拒绝覆盖；同值连续保存结果一致。
- 测试：`tests/role-editor.test.ts`（快照、单行写回、重置、幂等、列表 route、拒绝时不改文件、不可读不覆盖）、`tests/roles-service.test.ts`（真实 Cordis + Typert registry 注册与保存/读取）、`tests/roles-remote.test.ts`（描述符与线解析）、`tests/role-page.test.tsx`（17 角色顺序、状态、行号、多 route、禁用态）、`tests/role-state.test.ts`（草稿与选择）、`tests/client-plugin.test.ts`（浏览器半挂载 Remote 与注册 slot）。
- 门禁：`vp check` exit 0（仅既有 `require-array-sort-compare` 警告）；`vp test` 13 个文件 / 75 个用例通过；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` 通过；`vp run @internal/pstack#check:harness-doc` exit 0。
- 真实 DSH 0.2.2-alpha.2 Web profile：用临时 `$DSH_HOME` 安装打包 tarball 并启动 `dsh web --port 3199`；boot graph 含 `id: dsh-pstack`，其 `client.js` combo 返回 200 且包含 `plugins.bundle.config` 注册；`POST /api/pstackRoles/status` 返回 `ok: true`、绝对角色文件路径与 17 个角色，`POST /api/pstackRoles/catalogue` 返回 `ok: true`。未用真实浏览器查看页面视觉；页面行为由 `react-dom/server` 静态渲染测试覆盖。

## 审查证据

审查（2026-10-30，`review #2`）：通过。

- 对象：本仓 `289bced0358c09fbb93094b576f1d802a0a3a72f`（实现提交，基线 `e7b69ea`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`；上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`。
- 范围：`git diff --name-only e7b69ea..289bced` 仅涉及根 `src/`、`src/client/`、`tests/`、构建配置、`cordis.patch.yml`、README 与文档；未改 `pstack/pstack`、`pstack/harness`、`docs/harness-doc.yaml`、`pstack/README.md` 等 port 基线路径。
- 自动化：`vp check` exit 0（63 个文件格式通过，0 error，仅既有 `require-array-sort-compare` 警告）；`vp test` exit 0（13 个文件 / 75 个用例通过，含 `tests/role-editor.test.ts` 16 项、`tests/roles-service.test.ts` 4 项、`tests/role-page.test.tsx` 5 项、`tests/role-state.test.ts` 6 项、`tests/roles-remote.test.ts` 4 项、`tests/client-plugin.test.ts` 1 项）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0（无 active FIX）；`vp run @internal/pstack#check:harness-doc` exit 0（2/2 成功）；`vp run build` exit 0。
- 真实安装（独立复核）：临时 `$DSH_HOME` 安装 `pnpm pack` 产物后启动 `dsh web --port 3199`；boot graph 含 `{"id":"dsh-pstack","url":"plugins/??dsh-pstack/client.js&rev=..."}`，client combo 返回 200 且包含 `plugins.bundle.config`；RPC `pstackRoles/status` 返回 `ok: true`、绝对路径与 17 个角色，`pstackRoles/catalogue` 返回 `ok: true`；`pstackRoles/save` 在缺失文件上创建 `pstack-models.mdc` 并写入 `bug-fix: inherit-parent`；列表角色保存 `auto, inherit-parent` 两条 route 时完整写回；非法 provider 保存被拒绝且文件哈希不变；未知角色行按第 4 行报告且原行保留。
- 结论：`required_behavior` 均有实现、自动化测试或真实安装/API 证据；未发现需回到实现的 finding。页面视觉未由真实浏览器查看，页面结构由 `react-dom/server` 静态渲染测试覆盖，与实现记录一致。
