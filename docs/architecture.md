# 项目架构

本文描述 `dsh-pstack` 当前的模块边界、依赖方向和扩展入口。用户使用方式见根 README；移植、上游升级、生成树及其构建边界按 `port/AGENTS.md` 执行。

## 系统边界

本仓提供一个 DSH Cordis bundle：

- Host 端注册技能、模型目录、角色目录和子代理工具，并提供角色配置 Remote 服务与 Agent preset。
- Client 端在插件详情页注入配置入口，通过 Remote 服务管理角色配置，并通过可选的插件管理接口管理关联插件。
- 上游 pstack 内容经生成器进入 `pstack/`，构建时复制到 `dist/pstack/`；vendored 和 authored 技能分别复制到 `dist/skills/` 下。
- 角色配置保存在 `$DSH_HOME/pstack-models.mdc`。该文件由本插件读取和编辑，不是 DSH 自动加载的规则文件。

## 模块与入口

| 模块 | 真实路径与入口 | 当前职责 |
|---|---|---|
| Bundle 装配 | `cordis.patch.yml` | 注册技能目录、Host 工具和角色服务；组合两个根 preset 与三个子代理 preset。 |
| Host 主入口 | `src/index.ts` | 注册可信的隐藏技能加载器；其余 Host 能力各自通过独立子路径（如 `dsh-pstack/models`）由 bundle 按行加载。 |
| 技能加载 | `src/skill.ts`、`src/paths.ts` | 实现 `pstack_skill`，按名称加载技能及目录内资源；集中定义发布包内资源路径。 |
| 模型目录 | `src/models.ts`、`src/catalogue.ts` | 实现 `pstack_models`，读取实时 LLM adapter 目录，保留单 provider 或 model 的发现错误；共享 catalogue 类型、schema 与 wire 解析。 |
| 角色清单 | `src/role-manifest.ts`、`src/role-catalog.ts` | 定义角色 key、shape 和自动面板属性；实现只读的 `pstack_roles`。 |
| 子代理委派 | `src/subagent.ts` | 实现 `pstack_subagent`；解析角色路由，完成参数、能力和模型预检，再调用 `ctx.subagents.startActivation`。 |
| 角色文件 | `src/role-config.ts`、`src/role-file.ts`、`src/route.ts`、`src/budget.ts`、`src/role-editor.ts` | 解析 `$DSH_HOME/pstack-models.mdc`，以共享 Route 语法和 RoleFileDocument 选择路由；按预算把目标推理档位映射到具体模型并原子保存。 |
| 角色 Remote 边界 | `src/role-wire.ts`、`src/role-remote.ts`、`src/role-service.ts` | 定义并严格校验传输结构；共享 Typert 描述符；在 Host 暴露状态、目录、保存和预算应用方法。 |
| 根与子代理 preset | `src/preset.ts`、`src/preset-copy.ts`、`src/poteto-mode.ts`、`src/readonly.ts` | 注册本地化 preset，向根会话注入常驻 `poteto-mode` 内容，并为只读子代理设置沙箱策略。 |
| Client 入口与对话框 | `src/client/index.ts`、`src/client/PstackConfigDialog.tsx` | 挂载 Remote 描述符、注册 locale 和插件详情动作；管理配置对话框、页签和未保存草稿。 |
| 角色与插件页面 | `src/client/RoleSettingsPage.tsx`、`src/client/RoleCard.tsx`、`src/client/BudgetDialog.tsx`、`src/client/RecommendedPluginsPage.tsx` | 编辑角色草稿并展示保存结果；按预算批量预览并应用推理档位；展示关联插件及其变更结果。 |
| Client 支撑 | `src/client/ui.tsx`、`src/client/icons.tsx`、`src/client/styles.ts`、`src/client/toast.tsx`、`src/client/message.ts`、`src/client/focus-trap.ts`、`src/client/locales/`、`src/client/role-copy.ts`、`src/client/role-draft.ts`、`src/client/role-selectors.ts` | 提供本插件的 UI 组件、样式、共享提示、焦点陷阱、翻译、角色草稿和选择器文案。 |
| 移植与生成 | `port/generate.mjs`、`port/dsh.md`、`port/dsh.zh.md`、`playground/raw/`（`AGENTS.md`、`dsh.md`、`generate.ts`）、`playground/scenarios/` | 从固定上游生成 `pstack/`；按 `playground/raw/AGENTS.md` 的规则改判出 DSH 适配文档，并在场景注册表维护行为场景、排除与环境。 |
| 发布元数据 | `port/release-compatibility.ts`、`bump.config.ts` | 按显式兼容键同步双语 README 的版本表；每个 `x.y` 保留最新 `z`，新兼容键新增行，并把双语 README 加入发布提交。 |
| 构建与打包 | `vite.config.ts`、`package.json` | 分别构建 Host 与浏览器 Client；导出 Host 模块，复制生成树和技能资源。 |
| 自动化验证 | `tests/`、`playground/scripts/`（raw-generate、prepare、bootstrap、run、run-batch、run-ui、run-conflict、collect、review、status、stop、browser） | 运行单元和 DOM 交互测试；在真实 DSH playground 中运行行为、插件 UI 与冲突场景，收集 RunRecord 并用审核侧车校验，浏览器脚本做不涉及模型选择的交互。 |

## 依赖方向

### 运行时装配

`cordis.patch.yml` 选择公开模块并注入 DSH 服务。各模块通过 Cordis `inject` 获取 Host 能力；工具实现依赖 DSH 的工具、技能、LLM 和子代理接口，不建立独立的运行时。

### 官方类型与本地投影

官方 Remote、wire 和服务契约直接从对应 `@deepseek-ai/*` 包 `import type`，优先使用官方完整类型，不再为非必要收窄定义 `Pick` 或类型别名。跨包 Remote 类型统一从 `@deepseek-ai/dsh-api-remotes/client` 获取；不从某个功能包的 `typert.remote-client` 借用其他包的 namespace。角色文件、委派结果、页面草稿等本仓自有结构保留在本地；仅在官方声明缺失时保留局部服务切片。静态类型已保证的字段无需重复运行时校验。

依赖声明沿用官方插件的分类方式（见 `docs/decisions/2026-11-08-dsh-dependency-declarations.md`）：平台在运行时提供的 `@deepseek-ai/dsh-*` 服务包（如 `dsh-typert-protocol`、`dsh-sandbox-policy`、`cordis-plugin-loader`）进入 `peerDependencies`；随插件打包的独立运行时工具库（`@deepseek-ai/schemastery`）进入 `dependencies`；仅类型使用的官方包留在 `devDependencies` 与 workspace 的 `types` catalog，这些运行时包的版本统一取自 `runtime` catalog。React 由宿主模块加载器提供，只保留在 `devDependencies`。`dsh.client.inject` 只列出需要运行时模块装载的 assembly，不因类型导入而添加条目。Host 与 Client 构建都把 `@deepseek-ai/*` 与 React 保持为外部依赖，不把官方运行时实现打进 `dist`。

### 角色配置

```text
Client 页面
  → src/client/index.ts 的页面 API 适配
  → src/role-remote.ts 的 Typert 描述符
  → src/role-service.ts
  → src/role-editor.ts
  → src/role-config.ts
  → $DSH_HOME/pstack-models.mdc
```

`role-wire.ts` 是 Host 与 Client 共享的传输契约；`role-remote.ts` 同时供 Host 注册和 Client 挂载。Client 使用共享类型、清单和描述符，不直接访问文件系统或 Host 的 LLM 服务。

委派链路独立读取同一份角色文件：

```text
src/subagent.ts
  → src/role-config.ts + src/role-manifest.ts
  → DSH LLM 预检
  → ctx.subagents.startActivation
```

委派前重新读取文件。未配置的角色继承父级路由；配置读取或校验失败会阻止相应委派，而不是静默改用其他路由。

### 生成与发布

```text
upstream/cursor-plugins/pstack + port/dsh.md
  → port/generate.mjs
  → 根 pstack/
  → vite.config.ts
  → dist/pstack/
```

`skills/.agents/skills/` 与 `skills/authored/` 由构建配置分别复制到 `dist/skills/vendored/` 和 `dist/skills/authored/`；vendored 与 authored 技能目录由 `cordis.patch.yml` 的 `bundledSkillDir` 值在 `dist/skills/...` 下定位。`src/paths.ts` 在发布后的 `dist/pstack/` 下定位 pstack 资源。

## 扩展点

- **技能内容**：生成树只由生成器维护。手工适配文案进入 `port/dsh.md`，本仓技能进入 `skills/authored/`，外部随包技能保留在 vendored 工作区。
- **Host 工具或服务**：在 `src/` 实现 Cordis 入口，由 `cordis.patch.yml` 选择并配置；声明实际需要的 DSH 服务依赖。
- **角色能力**：`src/role-manifest.ts` 同时驱动角色目录、文件解析、设置视图和委派选择。修改角色时同步其上游来源和对应测试。
- **Agent preset**：在 `cordis.patch.yml` 组合插件行，由 `src/preset.ts` 注册；展示文案集中在 `src/client/locales/` 或 `src/preset-copy.ts`。
- **Client 配置能力**：通过 `plugins.detail.actions` 进入现有对话框；Host 数据通过显式 Remote 描述符和页面 API 适配层传递。
- **上游移植**：先在 playground 审核技能，再调整生成器或手写适配来源，最后重新生成并检查漂移。
- **验证**：纯逻辑和 DOM 行为放入 `tests/`；需要真实 Cordis、profile 或模型的验证放入 `playground/`。

## 验证分层

`vp check` 与 `vp test` 覆盖静态检查和自动化测试；`vp run generate:check` 检查生成树漂移。移植审核另有 raw 适配覆盖率与场景覆盖守卫。真实运行验证统一使用 `playground/`，其模型选择规则见该目录文档。
