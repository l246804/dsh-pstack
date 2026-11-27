# 项目架构

本文描述 `dsh-pstack` 当前的模块边界、依赖方向和扩展入口。用户使用方式见根 README；基准钉定与缺口提取按 `native/AGENTS.md` 执行，产品实现规范见 `src/AGENTS.md`。

## 端到端流程

```text
native 上游基准与最小适配答案 → generate 生成 native/pstack/
  → playground 按场景运行 native，对照缺口与适配答案
  → 用户审批处理建议 → src/dsh.md + src/ 实现和 cordis.patch.yml 装配
  → build 复制并盖章 src/dsh.md → playground 按需验证 adapted
  → 根 README 状态/兼容表
  → release-ready
```

- `native` 是基准子包：钉定的已发布上游树、native 适配答案和缺口清单。
- `playground` 以自行维护的场景为验证范围，运行 native/adapted probe；本地保存运行记录，提交逐场景结论与截图。独立的 adapted/ui worker 用于 agent 操作客户端、截图和验证修复，入口见 `playground/docs/ui.md`。
- `src` 负责随包适配答案与 Host/Client 实现；`cordis.patch.yml` 负责装配。
- 根 README 同步已有兼容表、技能与能力状态、能力限制和最终适配结果。
- 发布由用户手动执行；agent 停在 release-ready。

## Bundle assembly

根 `cordis.patch.yml` 是 Host/Client 装配清单，不是生成物。它选择模块、注册技能和组合 preset；新增、删除或改变模块、工具、服务或 preset 时，同步 `src/` 实现、导出和测试，生成树 `native/pstack/` 不手工编辑。

## 系统边界

本仓提供一个 DSH Cordis bundle：

- Host 端注册技能、模型目录、角色目录和子代理工具，并提供角色配置与工作流开关 Remote 服务、Agent preset。
- Client 端在插件详情页注入配置入口，通过 Remote 服务管理角色配置，并通过可选的插件管理接口管理关联插件。
- 上游 pstack 内容经生成器进入 `native/pstack/`，构建时复制到 `dist/pstack/` 并把适配答案盖章为 `src/dsh.md`；vendored 和 authored 技能分别复制到 `dist/skills/` 下。
- 角色配置保存在 `$DSH_HOME/pstack/models.json`，由本插件读取和编辑；旧文件在服务初始化时迁移，后续读取只访问当前文件。迁移入口与兼容格式见下方角色文件模块。
- 会话级 Poteto 工作流开关的全局默认保存在 `$DSH_HOME/pstack/settings.json` 的 `potetoDefault`，与角色文件分开维护；根目录旧的 `pstack-settings.json` 同样在服务初始化时迁入。

## 模块与入口

| 模块 | 真实路径与入口 | 当前职责 |
|---|---|---|
| Bundle 装配 | `cordis.patch.yml` | 注册技能目录、Host 工具和角色服务；组合三个子代理 preset（`poteto-agent`、`comment-sicko`、`readonly`）。 |
| 模型目录 | `src/models.ts`、`src/models/catalogue.ts` | 实现 `pstack_models`，读取实时 LLM adapter 目录，保留单 provider 或 model 的发现错误；共享 catalogue 类型、schema 与 wire 解析。 |
| 角色清单 | `src/roles/role-manifest.ts`、`src/role-catalog.ts` | 定义角色 key 与 shape；实现只读的 `pstack_roles`，按角色报告配置好的 provider/model/effort 路由，并附实时目录中该路由的可用 efforts 与默认档位。 |
| 子代理委派 | `src/subagent.ts` | 实现 `pstack_subagent` 薄包装：一次调用只启动一个子代理，`description` 和 `prompt` 必填，支持可选 `agent_preset`、`name`、`maxDepth`；`provider`/`model`/`reasoning_effort` 转成 `agentOptions`，省略则继承父路由；做能力校验与路由预检后调用 `ctx.subagents.startActivation`，返回原生 `{kind:"activation", name}`。同一模块还注册 `pstack_interrupt`，用于按名称或会话 id 中断 pstack 子代理；列出与续聊改用原生 `list_agents`、`send_message`。 |
| 角色文件 | `src/index.ts`、`src/pstack/home.ts`、`src/compat/migrate-pstack-home.ts`、`src/roles/role-store.ts`、`src/roles/route.ts`、`src/roles/budget.ts`、`src/roles/role-editor.ts`、`src/compat/` | `src/index.ts` 的 `PstackHomeService` 在服务初始化时调用 `src/compat/migrate-pstack-home.ts` 的 `migratePstackHome` 一次；`src/pstack/home.ts` 定义 `$DSH_HOME/pstack/` 布局与当前文件名。迁移把根目录旧 `pstack-models.json` 移入并升级，`pstack-models.mdc` 经 `compat/mdc-to-json.ts` 转成当前 JSON 并删除旧文件，`version: 1` 经 `compat/version-1-to-2.ts` 重写成版本 2 对象，当前版本则清理已退役角色与预算标签。`role-store.ts` 读写 `$DSH_HOME/pstack/models.json` 这份 typed JSON 文档，版本 2，每个角色保存结构化 Route 对象数组；读取为纯读，不再触发迁移。迁移逻辑集中在 `compat/`；旧角色与预算名称的识别分别由角色清单与预算模块提供。按预算把目标推理档位映射到具体模型并原子保存。 |
| 角色 Remote 边界 | `src/roles/role-wire.ts`、`src/roles/role-remote.ts`、`src/role-service.ts` | 定义并严格校验传输结构；共享 Typert 描述符；在 Host 暴露状态、目录、保存和预算应用方法。 |
| Preset 与工作流开关 | `src/preset.ts`、`src/presets/preset-copy.ts`、`src/poteto-toggle.ts`、`src/poteto/remote.ts`、`src/poteto/projection.ts`、`src/poteto/preset-gate.ts`、`src/poteto/settings.ts`、`src/poteto/storage.ts`、`src/readonly.ts` | 注册本地化 preset；实现会话级 Poteto 工作流开关并向系统提示注入常驻 `poteto-mode` 内容；持久化开关的全局默认；按会话所在的 Agent preset 判定能否启用（极简模式不启用）；为只读子代理设置沙箱策略。 |
| Client 入口与对话框 | `src/client/index.ts`、`src/client/pages/PstackConfigDialog.tsx`、`src/client/pages/GeneralSettingsPage.tsx` | 挂载 Remote 描述符、注册 locale 和插件详情动作；管理配置对话框、页签、未保存草稿和通用默认开关。 |
| 角色与插件页面 | `src/client/pages/RoleSettingsPage.tsx`、`src/client/pages/RecommendedPluginsPage.tsx`、`src/client/components/RoleCard.tsx`、`src/client/components/BudgetDialog.tsx` | 编辑角色草稿并展示保存结果；按预算批量预览并应用推理档位；展示关联插件及其变更结果。 |
| Client 支撑 | `src/client/components/`（`ui.tsx`、`icons.tsx`、`DiscardConfirmation.tsx`、`PotetoModeToggle.tsx`、`PotetoModeBadge.tsx`）、`src/client/session-projection-types.ts`、`src/client/lib/`（`styles.css`、`poteto-mode.ts`、`toast.ts`、`message.ts`）、`src/client/roles/`（`role-copy.ts`、`role-draft.ts`、`role-selectors.ts`）、`src/client/locales/` | 提供本插件的 UI 组件、样式、共享提示、翻译、角色草稿和选择器文案；样式经 Client 模块元数据交给 DSH renderer 装载。 |
| 维护修复 | `src/poteto/maintenance.ts`、`src/poteto/maintenance-remote.ts`、`src/poteto/maintenance-types.ts`、`src/client/pages/MaintenanceSettingsPage.tsx` | 扫描含旧 `poteto/mode` 事件的会话，按工作区展示并选择；确认后写入 `$DSH_HOME/pstack/repair.json`，下次启动时修复日志、把旧开关值写入会话 sidecar，并清理队列。旧的根目录 `pstack-repair.json` 不参与启动迁移，保持原样。 |
| 移植与生成 | `native/scripts/fetch-upstream.ts`、`native/scripts/generate-pstack.ts`、`native/`（`upstream/`、`upstream.lock.json`、`dsh.md`、`dsh.zh.md`、`dsh-evidence.md`、`gaps.json`）、`src/dsh.md`、`src/dsh.zh.md`、`playground/scenarios/` | fetch 把已发布上游版本钉定到 `native/upstream/`；生成器从上游树加注入行并盖章 `native/dsh.md` 产出唯一生成树 `native/pstack/`；`src/dsh.md` 是随包适配答案，构建时盖章替换 dist 内的基准答案；缺口提取规则见 `native/AGENTS.md`，场景由用户独立维护，规则见 `playground/docs/scenarios.md`。 |
| 发布元数据与发布说明 | `scripts/release-compatibility.ts`、`scripts/release-surface.ts`、`scripts/release.sh`、`bump.config.ts`、`changes/AGENTS.md` | 发布时按 DSH 兼容范围分组同步各本地化 README 的发布版本表与 pstack 徽标，并把对应本地化 README 加入发布提交；已发布行不可改写，`compatibility:check` 校验表格、徽标与最新发布行一致，并允许 pin 领先于最新发布版本。发布说明由 agent 会话按 `changes/AGENTS.md` 从版本间提交生成到 `changes/RELEASE.md`；`release.sh` 要求该文件存在且已提交后才 bumpp，打完 tag 后删除它，发布工作流在 tag 上读取它作为 Release 正文；`release-surface.ts` 维护 `src/surface.json`。 |
| 构建与打包 | `vite.config.ts`、`package.json` | 分别构建 Host 与浏览器 Client；导出 Host 模块，复制生成树和技能资源。 |
| 自动化验证 | `tests/`、`native/tests/`、`src/tests/`、`playground/tests/`、`playground/runner/`、`playground/results/` | 自动化测试按包归属；runner 执行真实场景并保留本地记录，collect 只导出截图；按场景维护分析、建议、审批和适配结果。 |

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
  → src/roles/role-remote.ts 的 Typert 描述符
  → src/role-service.ts
  → src/roles/role-editor.ts
  → src/roles/role-store.ts
  → $DSH_HOME/pstack/models.json
```

`roles/role-wire.ts` 是 Host 与 Client 共享的传输契约；`roles/role-remote.ts` 同时供 Host 注册和 Client 挂载。Client 使用共享类型、清单和描述符，不直接访问文件系统或 Host 的 LLM 服务。

委派链路不再读取角色文件。调用方在委派前按需读取同一份角色文件，自己决定传哪个模型：

```text
src/subagent.ts
  → 参数校验 + DSH LLM 预检（仅当显式给了 provider/model）
  → ctx.subagents.startActivation
```

`pstack_subagent` 只把调用方给的 `provider`、`model` 和可选 `reasoning_effort` 转成子代理的 `agentOptions`；三者都省略时子代理继承父路由。文件缺失或某个角色未配置不影响委派，因为工具本身不解析角色文件。一次调用只启动一个子代理；多子代理由调用方在同一消息里并行多次调用。

### 生成与发布

```text
已发布上游版本 --fetch--> native/upstream/（+ upstream.lock.json）
native/upstream/ + native/dsh.md
  → native/scripts/generate-pstack.ts
  → native/pstack/（唯一生成树）

native/pstack/ + src/dsh.md
  → vite.config.ts（copy + build 盖章）
  → dist/pstack/
```

`skills/.agents/skills/` 与 `skills/authored/` 由构建配置分别复制到 `dist/skills/vendored/` 和 `dist/skills/authored/`；vendored 与 authored 技能目录由 `cordis.patch.yml` 的 `bundledSkillDir` 值在 `dist/skills/...` 下定位。`src/lib/paths.ts` 在发布后的 `dist/pstack/` 下定位 pstack 资源。

## 扩展点

- **技能内容**：生成树只由生成器维护。手工适配文案进入 `src/dsh.md`，本仓技能进入 `skills/authored/`，外部随包技能保留在 vendored 工作区。
- **Host 工具或服务**：在 `src/` 实现 Cordis 入口，由 `cordis.patch.yml` 选择并配置；声明实际需要的 DSH 服务依赖。
- **角色能力**：`src/roles/role-manifest.ts` 同时驱动角色目录、文件解析、设置视图和只读的 `pstack_roles` 发现；`pstack_subagent` 不按角色解析路由。修改角色时同步其上游来源和对应测试。
- **Agent preset**：在 `cordis.patch.yml` 组合插件行，由 `src/preset.ts` 注册；展示文案集中在 `src/client/locales/` 或 `src/presets/preset-copy.ts`。
- **Client 配置能力**：通过 `plugins.detail.actions` 进入现有对话框；Host 数据通过显式 Remote 描述符和页面 API 适配层传递。
- **上游移植**：先在 playground 审核技能，再调整生成器或手写适配来源，最后重新生成并检查漂移。
- **验证**：纯逻辑和 DOM 行为放入各包的 `tests/`（`native/tests/`、`src/tests/`、`playground/tests/`）；仓库级发布测试留在 `tests/`；需要真实 Cordis、profile 或模型的验证放入 `playground/`。

## 验证分层

`vp check` 与 `vp test` 覆盖静态检查和自动化测试；`vp run native:generate:check` 检查生成树漂移。native 的缺口枚举由本包测试检查。playground 场景以文件集合为准，不与缺口审批状态或发布版本联动；真实运行与结果判定遵循 `playground/AGENTS.md`，按需运行。
