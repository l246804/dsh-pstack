# Issue #2：pstack 角色模型配置缺少 UI 查看与编辑入口

- Issue: https://github.com/l246804/dsh-pstack/issues/2
- target: extension
- status: open
- port_round: no-impact
- stage: passed
- EXT: EXT-003
- 公开状态: open（2026-10-30 创建；标题、正文与“每个角色增加重置为 `inherit-parent` 的按钮”经用户确认；2026-10-30 分诊为 EXT-003；2026-10-30 实现审查通过）
- 分诊证据提交: 本仓 `7716c06b9e46dd33067cc7c7784f4dcab9977324` · DSH `ce7073d51254c26cd63b22a60835b8f948deb447` · 上游 pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`

## 复核

- 版本与环境：dsh-pstack 0.2.0-beta.3、DSH 0.2.2-alpha.2、Node.js 24.22.1、Linux / Web GUI，与 Issue 一致；Issue 无评论（2026-10-30）。
- 当前行为：`pstack_models` 只通过 `ctx.llm` 读取实时目录，不读取角色文件（[models.ts](../../../src/models.ts#L80-L140)）；`pstack_subagent` 每次委派重读 `$DSH_HOME/pstack-models.mdc`（[subagent.ts](../../../src/subagent.ts#L363-L364)），`readRoleConfiguration` 已区分 `missing`、`unreadable`、`loaded` 并按行记录问题（[role-config.ts](../../../src/internal/role-config.ts#L50-L59)）。根 `package.json` 没有 `dsh.client` / `./client` 出口，`cordis.patch.yml` 也没有 Client 配置行。
- 最小复现（静态复核）：0.2.0-beta.3 的根 `package.json` 没有 `dsh.client` / `./client` 出口，`cordis.patch.yml` 没有 Client 配置行，因而不存在可挂载到 Plugins → Installed plugins → dsh-pstack 的配置页；页面只能显示 bundle 详情、版本、来源与行开关。
- 预期与实际：预期是同一页面提供角色配置页，可查看并单角色编辑/重置；实际是插件只有 Host 侧工具与 bundle 管理信息，没有任何 Client 配置入口。
- 分诊结论：`extension`。这是上游 pstack 未声明的 DSH 版产品能力，不改变 port 基线的上游需求或现有 `PI-02` 实现范围；登记为 `EXT-003`，走 issue blocker 的 implement/review 路径。不选 `core`（不改上游能力与 README 基线）；不选 `bug`（现状与声明一致，功能尚未实现）；不选 `external`（DSH 0.2.2-alpha.2 已提供所需公共接口，责任在本仓插件）。

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

## 映射

- 扩展登记：`EXT-003`（[docs/extensions.md](../../extensions.md)）；工作文件 [docs/extensions/EXT-003/review.md](../../extensions/EXT-003/review.md)。历史 `EXT-001`、`EXT-002` 为已清理的预置条目，编号不复用。
- DSH 能力（0.2.2-alpha.2，`ce7073d`）：
  - **Plugins 页 bundle 配置插槽**：`plugins.bundle.config` 以 npm 包名为 key，bundle 的 browser half 注册后在 bundle 详情页渲染；`plugins.item` 只用于安装内置的 official 插件，本包应使用 `plugins.bundle.config`（[ui-plugin-manager README#L89-L89](../../../upstream/deepseek-harness/packages/client/ui-plugin-manager/README.md#L89-L89)）。
  - **客户端半装载**：包在 `package.json` 声明 `dsh.client`（`platform: 'web'`）并导出 `./client`，`dsh-client-modules` 把 browser half 挂到裸包名的 Loader row（[client-modules README#L34-L34](../../../upstream/deepseek-harness/packages/client/modules/README.md#L34-L34)）。
  - **Host Remote**：`TypertRemoteService` + `@Remote` 可把 Host 方法暴露给 Client（[typert protocol README#L32-L47](../../../upstream/deepseek-harness/packages/typert/protocol/README.md#L32-L47)）。`settings` 只编辑插件 Config，`workspaceFiles` 明确“no mutation operation”，角色文件读写需新增 Host Remote 服务（[workspace-files README#L12-L12](../../../upstream/deepseek-harness/packages/api/workspace-files/README.md#L12-L12)）。
- 候选实现面：`package.json`（`dsh.client`、`./client` 与 `./remote` 出口）、`vite.config.ts`（client entry 与 pack exports）、`src/`（Host Remote：status/read/save，复用 `role-config.ts` 与 `collectCatalogue`）、`src/client/`（配置页、字典、17 行表单与重置按钮）、`cordis.patch.yml`（Client/Remote 行）、`tests/`（解析、校验、写回、幂等、重置、行保留、UI 行为）、`docs/architecture.md`、`README.md` / `README.zh.md`。
- 数据约束：manifest 中 `arena runners`、`arena cross-judge pool`、`swarm workers`、`architect runners`、`interrogate reviewers` 是列表角色，可持有多条 route；UI 必须显示完整现值，保存单个角色时不得静默丢弃未展示的 route。
- 实现前置：本仓当前用 vite-plus 打包，没有 Typert 生成链；实现阶段需先确定 `@deepseek-ai/dsh-typert-generator`（或手写 `TypertRemoteInfo`）产出 `./remote`/`./typert` 的可行路径，并用真实 DSH 0.2.2-alpha.2 Web profile 验证 Plugins 页挂载。

## 实现

- 结论：选择“手写 `TypertRemoteInfo`”路径，不引入 Typert 生成链。`src/remote.ts` 提供 3 个 strict 描述符，Client 用 `ctx.remote.$mount()` 挂载，Host 用 `ctx.typert.register()` 注册同一描述符；无 `./typert` 生成产物。
- 文件：`src/roles.ts`、`src/remote.ts`、`src/internal/role-editor.ts`、`src/internal/role-wire.ts`、`src/internal/role-config.ts`、`src/client/{index.ts,RoleSettingsPage.tsx,locales.ts,state.ts}`、`vite.config.ts`、`package.json`、`cordis.patch.yml`、`tests/{role-editor,roles-service,roles-remote,role-page,role-state,client-plugin}.test.{ts,tsx}`。
- 验证：`vp check` exit 0（仅既有 `require-array-sort-compare` 警告）；`vp test` 13 个文件 / 75 个用例通过；`generate-pstack-harness-tree.mjs --check` exit 0；`port-fixes.mjs replay` 通过；`check:harness-doc` exit 0。
- 真实 Web profile：临时 `$DSH_HOME` 安装 tarball 后启动 `dsh web --port 3199`；boot graph 含 `dsh-pstack`，`client.js` combo 200 且包含 `plugins.bundle.config`；`/api/pstackRoles/status` 与 `/api/pstackRoles/catalogue` 均返回 `ok: true`。页面视觉未由真实浏览器查看，由 `react-dom/server` 测试覆盖。
- 下一步：`/pstack-port review #2`。

## 审查

- 审查（2026-10-30，`review #2`）：实现 `289bced0358c09fbb93094b576f1d802a0a3a72f` 通过。`vp check` exit 0（仅既有 `require-array-sort-compare` 警告）；`vp test` exit 0（13 个文件 / 75 个用例）；`node pstack/scripts/generate-pstack-harness-tree.mjs --check` exit 0；`node pstack/scripts/port-fixes.mjs replay` exit 0；`vp run @internal/pstack#check:harness-doc` exit 0；`vp run build` exit 0。
- 真实安装复核：临时 `$DSH_HOME` 安装 `pnpm pack` 产物并启动 `dsh web --port 3199`；boot graph 含 `dsh-pstack`，client combo 200 且包含 `plugins.bundle.config`；`pstackRoles/status` 返回 17 个角色与绝对路径，`catalogue` 返回 `ok: true`，`save` 创建/写回角色文件，非法 provider 被拒绝且文件不变，未知角色行按行号报告。
- 结论：EXT-003 工作文件写 `passed`，登记表恢复 `active`；未发现 finding。下一步 `/pstack-port issue #2`。
