# 项目架构

本文描述 `dsh-pstack` 的模块边界、依赖方向和扩展入口。用户使用方式见根 README；目录内的操作规则见各目录 `AGENTS.md`。

## 端到端流程

```text
native 钉定上游、维护标准模式答案与经确认的缺口
  → playground 验证 native/adapted 行为并提供证据
  → src 维护产品适配答案与实现，cordis.patch.yml 装配
  → generate 生成 native/pstack/，build 产出 dist/
  → 核对根 README 的能力说明与发布元数据
  → release-ready
```

`native/`、`playground/`、`src/` 分别拥有基准、验证和产品实现。playground 的快照证明所记录环境中的行为，不作为发布门禁。发布由用户手动执行，agent 停在 release-ready。

## Bundle assembly

根 `cordis.patch.yml` 是 Host/Client 装配清单，选择模块、注册技能并组合 Agent preset。模块、工具、服务或 preset 的公开面变化时，同步实现、导出与装配；`native/pstack/` 由生成流程维护。

Host 注册工具、技能、preset 和 Remote 服务；Client 通过宿主插槽挂载配置入口，通过 Remote 管理 Host 状态，并通过可选的插件管理服务管理关联插件。各模块通过 Cordis 注入获取能力，不建立独立的 DSH 运行时。

## 模块与入口

下表提供定位入口；具体字段、内部辅助文件与调用步骤以入口实现为准。

| 模块 | 入口 | 职责与边界 |
| --- | --- | --- |
| 模型与角色发现 | `src/models.ts`、`src/role-catalog.ts` | 读取实时模型目录与角色配置，报告可用路由及发现错误；不执行委派。 |
| 子代理委派 | `src/subagent.ts` | 校验调用方给定的路由与后端能力，启动一个子代理或中断指定子代理；不读取角色文件。 |
| 角色配置 | `src/role-service.ts`、`src/roles/role-editor.ts`、`src/roles/role-store.ts` | 校验与编辑角色路由、应用预算并原子保存；读取保持纯读。角色清单和路由语法由 `src/roles/` 维护。 |
| 共享协议 | `src/roles/role-remote.ts`、`src/roles/role-wire.ts`、`src/models/catalogue.ts` | Host 与 Client 共用传输描述符、类型与边界解析，页面不另建协议副本。 |
| 全局文件与兼容迁移 | `src/index.ts`、`src/pstack/home.ts`、`src/compat/` | 集中定义 pstack 文件路径；服务初始化时执行配置迁移，当前文件优先，后续读取保持纯读。 |
| Preset 与工作流 | `src/preset.ts`、`src/poteto-toggle.ts`、`src/readonly.ts` | 注册本地化子代理 preset、管理会话级 Poteto 工作流与新会话默认值，并提供只读沙箱策略；相关状态与协议归 `src/poteto/`。 |
| 维护修复 | `src/poteto/maintenance.ts` | 扫描旧会话事件、执行排队修复并报告结果；会话日志与插件 sidecar 分开维护。 |
| Client | `src/client/index.ts`、`src/client/pages/` | 挂载配置入口、Remote 和会话插槽，管理页面交互与草稿；共享组件、辅助逻辑、角色草稿与本地化各归其子目录。 |
| 基准与生成 | `native/scripts/fetch-upstream.ts`、`native/scripts/generate-pstack.ts` | 按 lock 恢复已发布上游并生成基准树；钉定与缺口维护规则见 [native/AGENTS.md](../native/AGENTS.md)。 |
| 真实会话验证 | `playground/runner/cli/`、`playground/scripts/` | 运行容器 worker、收集证据与审核快照；场景、运行和脱敏规则见 [playground/AGENTS.md](../playground/AGENTS.md)。 |
| 构建与发布 | `vite.config.ts`、`package.json`、`scripts/release.sh` | 构建 Host/Client 和资源，维护发布元数据与发布说明生命周期。 |

## 依赖方向

### 官方类型与本地投影

官方契约直接从所属 `@deepseek-ai/*` 包引入，跨包 Remote 类型从官方聚合入口获取；本仓保留角色配置、页面草稿等自有结构。类型与外部边界验证规则见[项目类型纪律](./decisions/2026-11-13-project-type-discipline.md)和[官方契约类型](./decisions/2026-11-07-official-contract-types.md)。

平台服务、独立运行时库与类型依赖按[依赖分类决策](./decisions/2026-11-08-dsh-dependency-declarations.md)声明，安装使用[命名 catalog](./decisions/2026-11-07-pnpm-catalog-policy.md)。Host 与 Client 构建保持官方运行时实现外部化；Client 的 React 由宿主模块加载器提供。

### 角色配置与委派

```text
Client 页面 → 页面 API → 共享 Remote 描述符
  → Host 角色服务 → 角色编辑器 → 角色文件

调用方读取角色配置并选择路由 → pstack_subagent → DSH 子代理服务
```

Client 使用共享清单、类型和描述符，不直接访问文件系统或 Host 的 LLM 服务。角色配置与委派解耦：未配置角色时由调用方继承父路由；一次工具调用只启动一个子代理，多次委派由调用方组织。

### 系统边界

`src/pstack/home.ts` 是 `$DSH_HOME/pstack/` 路径的唯一来源，角色配置、工作流全局默认和修复队列各自保存。

会话级 Poteto 选择通过 DSH storage domain 保存为 sidecar，不写入会话事件日志。维护修复在下次启动时处理排队的旧会话，保留失败信息；该流程的入口见上表。

### 生成与发布

```text
已发布上游版本 → native/upstream/（由 upstream.lock.json 恢复）
  + native/dsh.md → native/pstack/
  + src/dsh.md（覆盖基准答案）→ dist/pstack/

skills/.agents/skills/ → dist/skills/vendored/
skills/authored/       → dist/skills/authored/
```

技能内容的维护边界见 [skills/AGENTS.md](../skills/AGENTS.md)。`cordis.patch.yml` 定位随包技能目录，`src/lib/paths.ts` 定位构建后的 pstack 资源。根 `.agents/skills/` 用于本仓维护，不作为插件资源打包。

发布元数据由 `scripts/release-compatibility.ts` 维护：兼容表与徽标记录已发布事实，上游 pin 可以领先，已发布行不能改写。公开工具参数清单由 `scripts/release-surface.ts` 从工具工厂生成。

发布说明的撰写与生命周期见 [changes/AGENTS.md](../changes/AGENTS.md)；发布脚本、版本 bump 配置和 tag 工作流共同消费该说明。版本发布前的检查从 `package.json` 与 `vite.config.ts` 读取。

## 扩展与验证

- 新工具、服务或 preset 在 `src/` 实现，通过装配清单公开；Client 扩展沿用现有插槽和 Remote 边界。
- 角色清单由 `src/roles/role-manifest.ts` 驱动配置与发现，修改时核对上游来源与相应测试。
- 随包的本仓技能进入 `skills/authored/`；随包适配答案进入 `src/dsh.md` 及本地化版本，写作规则见 [dsh-adapter.md](./dsh-adapter.md)。
- 纯逻辑与 DOM 行为测试归各包 `tests/`；根 `tests/` 保存仓库级测试。需要真实 Cordis、profile、浏览器或模型的验证归 playground，按其目录规则执行。
- 静态检查、测试、生成一致性、公开工具面、兼容元数据和构建由项目 CI 任务核验。DSH 基线升级另按 [dsh-baseline-bump.md](./dsh-baseline-bump.md) 核对目标运行时与装配。
