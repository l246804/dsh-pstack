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
- `playground` 运行 native/adapted 的缺口与回归场景，缺口场景对应 native 中已确认的条目；本地保存运行记录，提交逐场景结论与截图。客户端交互验证复用独立的 adapted/ui worker；浏览器由 agent 使用 agent-browser 管理，入口见 `playground/docs/ui.md`。
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

| 模块 | 入口 | 职责与边界 |
|---|---|---|
| 装配 | `cordis.patch.yml`、`src/index.ts` | 选择 Host/Client 模块和技能来源；根服务先完成用户目录迁移。 |
| 模型与角色发现 | `src/models.ts`、`src/role-catalog.ts` | 从实时 DSH 服务和角色配置提供只读目录。共享模型结构在 `src/models/catalogue.ts`。 |
| 委派 | `src/subagent.ts` | 校验调用参数和模型路由，调用官方委派与中断服务；不解析角色文件。 |
| 角色领域与存储 | `src/roles/`、`src/role-service.ts` | 角色、路由及预算规划与文件编辑分离；Host 服务对外暴露状态和编辑操作。 |
| 兼容迁移 | `src/compat/`、`src/pstack/home.ts` | 启动时迁移旧位置和格式；`role-values.ts` 集中维护读取器仍支持的旧值规范化。路径定义由 home 模块提供。 |
| Remote | `src/roles/role-remote.ts`、`src/poteto/remote.ts`、`src/poteto/maintenance-remote.ts`、`src/shared/remote.ts` | 各功能定义自己的描述符；共享入口聚合 Host/Client 契约，由插件根入口注册唯一 Host face，各协议模块不导入 Host 实现。 |
| 工作流与 preset | `src/poteto-toggle.ts`、`src/poteto/`、`src/preset.ts`、`src/readonly.ts` | 管理会话开关、提示、工具限制和 sidecar；preset 与只读策略分别通过宿主能力实现。 |
| 旧日志维护 | `src/poteto/maintenance-service.ts`、`src/poteto/maintenance.ts` | 独立维护 Remote、修复队列及日志转换。开关服务打开 sidecar 后挂载维护服务，等待修复完成再注册投影；子服务随开关服务卸载。 |
| Client | `src/client/index.ts`、`src/client/pages/`、`src/client/components/`、`src/client/roles/` | 入口适配 Remote，页面管理交互与草稿，组件复用宿主 primitives；通过协议访问 Host。 |
| native 基准 | `native/scripts/`、`native/AGENTS.md` | 恢复上游钉定并生成基准树；纯转换与 Git 版本解析在 `scripts/lib/`，CLI 负责文件和命令执行。 |
| 技能工作区 | `skills/AGENTS.md`、`skills/package.json`、`skills/skills-lock.json` | 区分 authored 来源、vendored 锁定副本和根开发安装副本；由 skills CLI 同步，构建按原样复制。 |
| 发布与打包 | `vite.config.ts`、`scripts/release*.ts`、`scripts/release.sh`、`changes/AGENTS.md` | 构建 Host/Client 和资源，维护工具清单及已发布兼容事实；发布说明流程按 changes 指引。 |
| 验证 | 各目录 `tests/`、`playground/runner/`、`playground/results/` | 离线测试按所有者归属；真实 Cordis 与宿主验证在 playground，运行证据及逐场景结果按其指引维护。 |

## 依赖方向

### Playground runner

`playground/scripts/` 校验场景与 confirmed 缺口的契约；`runner/` 执行场景和管理 worker，两者共享场景定义。

| 目录 | 职责 |
|---|---|
| `cli/` | 解析命令参数、调用流程、输出结果和设置退出码。 |
| `execution/` | 批次调度、单场景流程、会话完成等待和取消；流程接收参数并返回结果。 |
| `worker/` | 准备 profile、安装插件、生成 fixture、管理 worker 路径与批次进度。 |
| `container/` | 镜像检查、挂载规格和容器生命周期。 |
| `browser/` | agent-browser 调用、DSH 页面操作、就绪检查与截图；页面选择器集中在这里。 |
| `storage/` | DSH 会话文件定位、事件读取和工作区存储读写；上游持久化格式的适配落在这里。 |
| `evidence/` | 从事件提取事实、执行机械断言、读写本地运行记录和导出图片。 |
| `config/` | 按命令需要读取 runtime、browser 或完整配置；凭据解析与模型预检仅用于需要模型配置的流程。 |
| `scenario/`、`shared/` | 场景注册与适用范围；共享路径和 CLI 参数解析。 |

状态查询、截图收集和停止 worker 只加载 runtime 配置；浏览器验证另读 browser 配置。`config.example.ts` 用 getter 延迟宿主 provider 发现，避免本地维护命令触发模型配置读取。执行流程通过 `storage/` 读取 DSH 数据，状态查询不依赖场景执行器。agent 手动检查 UI 仍按 `playground/docs/ui.md` 直接管理浏览器。

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

`roles/role-wire.ts` 是 Host 与 Client 共享的传输契约；各功能描述符由 `shared/remote.ts` 聚合，根入口统一注册 Host face，Client 挂载同一集合。Client 使用共享类型、清单和描述符，不直接访问文件系统或 Host 的 LLM 服务。

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

`skills/.agents/skills/` 与 `skills/authored/` 由构建配置分别原样复制到 `dist/skills/vendored/` 和 `dist/skills/authored/`；vendored 与 authored 技能目录由 `cordis.patch.yml` 的 `bundledSkillDir` 值在 `dist/skills/...` 下定位。`src/lib/paths.ts` 在发布后的 `dist/pstack/` 下定位 pstack 资源。

## 扩展点

- **技能内容**：生成树只由生成器维护。手工适配文案进入 `src/dsh.md`，本仓技能进入 `skills/authored/`，外部随包技能保留在 vendored 工作区。
- **Host 工具或服务**：在 `src/` 实现 Cordis 入口，由 `cordis.patch.yml` 选择并配置；声明实际需要的 DSH 服务依赖。
- **角色能力**：`src/roles/role-manifest.ts` 同时驱动角色目录、文件解析、设置视图和只读的 `pstack_roles` 发现；`pstack_subagent` 不按角色解析路由。修改角色时同步其上游来源和对应测试。
- **Agent preset**：在 `cordis.patch.yml` 组合插件行，由 `src/preset.ts` 注册；展示文案集中在 `src/client/locales/` 或 `src/presets/preset-copy.ts`。
- **Client 配置能力**：通过 `plugins.detail.actions` 进入现有对话框；Host 数据通过显式 Remote 描述符和页面 API 适配层传递。
- **上游移植**：先在 playground 审核技能，再调整生成器或手写适配来源，最后重新生成并检查漂移。
- **验证**：离线测试放入所属目录的 `tests/`；仓库级发布测试留在 `tests/`；需要真实 Cordis、profile 或模型的验证放入 `playground/`。

## 验证分层

`vp check` 与 `vp test` 覆盖静态检查和自动化测试；`vp run native:generate:check` 检查生成树漂移。`native/tests/` 校验钉定、生成转换和缺口枚举；`playground/tests/` 校验场景契约和集成行为；`playground:gap-lock` 检查 confirmed 缺口与场景覆盖、描述指纹。真实运行与结果判定遵循 `playground/AGENTS.md`，按需运行，不随发布版本变化强制重跑。

## 事实来源

| 事实 | 权威来源 |
|---|---|
| 上游钉定 | `native/upstream.lock.json` |
| 标准模式能力与缺口 | `native/dsh.md`、`native/dsh-evidence.md`、`native/gaps.json` |
| 当前协议和行为 | 官方类型、`src/` 实现及契约测试 |
| 真实场景结论 | `playground/results/`；原始运行记录保留在 worker 本地 |
| 技能来源与同步发布 | `skills/package.json`、`skills/skills-lock.json`、`skills/AGENTS.md` |
| 已发布兼容关系 | 发布流程维护的 README 兼容表，允许当前 pin 领先于最新发布行 |

本页保留跨模块边界；参数、schema 和兼容值由对应源码维护，具体操作遵循目录指引。
