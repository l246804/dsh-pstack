# 决策：直接使用官方 DSH 契约类型

Status: accepted
Date: 2026-11-07
Scope: src/**, tests/**, package.json, pnpm-workspace.yaml, docs/architecture.md
Implemented-by: commit:ff64abe0a068157cc1f0041ba68fe5db32a8eba4
Review: 2026-11-22

## 背景

本仓多个模块曾手写 DSH 的 wire 类型和服务类型：Client 自写 `Result<T>` 与插件管理 namespace，推荐插件页自写 bundle 视图与变更结果，角色服务自写 Typert 注册接口，子代理、技能加载、模型目录和 preset 各自维护宿主服务的局部切片。这些结构与官方 `@deepseek-ai/*` 声明重复，容易与运行时契约漂移：测试曾使用官方并不存在的 `availability: "available"`，并把缺少必填字段的对象当作 `ChangeResult`。

与此同时，为兼容这些手写形状，代码加入了对 application 枚举的白名单检查、错误对象重建、以及宽度不定的 `unknown` 返回值。静态类型本可以保证这些字段，防御分支反而扩大了维护面。目标不是修某一个包，而是为全仓建立统一的类型来源规则。约束是：官方类型包只能作为开发期类型依赖，不能变成运行时依赖；`dsh.client.inject` 只承载需要运行时模块装载的 assembly；`dist` 不打包官方运行时实现。

## 决策

本仓直接使用官方完整类型，不再为非必要收窄定义 `Pick` 或类型别名。

- 跨包 Remote 类型统一从 `@deepseek-ai/dsh-api-remotes/client` 的 `import type` 获取：`ClientRemote`、`RemoteResult`、`BundleInfo`、`ChangeResult`、`SettingsNamespaceView`。不从某个功能包的 `typert.remote-client` 借用其他包的 namespace。
- Host 服务直接使用官方服务类型：`LlmRuntime`、`SubagentRuntime`、`WorkingDirectoryService`、`SkillRegistry`、`SettingsForms`、`TypertRegistryContract`。`ctx.typert.remotes.register(...)`、`ctx.agentPresets.register(...)` 等调用按官方声明书写，不再手写服务切片。
- 页面 API 直接消费官方 `BundleInfo` 与 `ChangeResult`；删除 `toBundleChange`、`CHANGE_APPLICATIONS` 白名单、未知 application 的错误重建，以及 `RemoteResult` 解包时对 `value` 的冗余检查。
- 本仓自有结构保留在本地：角色文件、委派计划与结果、模型目录、工具 schema、UI 草稿和页面窄接口。`SystemPromptHost` 等官方类型图未提供的服务切片仍保留，不伪造官方来源。
- 官方类型包只进入 `devDependencies` 与 workspace 的 `catalogs.types`，不进入 `dependencies`、`peerDependencies`，也不加入 `dsh.client.inject`。Host 与 Client 构建继续把 `@deepseek-ai/*` 保持为外部依赖。
- 运行时官方依赖的放置（哪些平台服务包进 `peerDependencies`、哪些随包运行时工具库进 `dependencies`）见 [2026-11-08-dsh-dependency-declarations.md](./2026-11-08-dsh-dependency-declarations.md)；本记录只管类型来源。
- 规则写入 `docs/architecture.md`，并用 `tests/harness-types.test.ts` 固定依赖分类、Remote 来源和构建外部化。依赖安装协议与 `catalogMode` 另见 [2026-11-07-pnpm-catalog-policy.md](./2026-11-07-pnpm-catalog-policy.md)。

## 替代方案

**保留本地窄接口（`Pick`、类型别名、手写服务切片）并配合运行时防御校验。** 这是本轮首次实现的方案，实际采用后被否决。它让 `BundleView`、`BundleChange`、`ModelsLlm`、`SkillsHost`、`LlmHost` 等派生类型散落各模块，仍需维护一份与官方契约平行的形状；`availability: "available"` 与不完整的 `ChangeResult` 都能通过测试，证明它无法阻止漂移。它还要求 `toBundleChange` 等运行时代码重复校验静态类型已经保证的字段。用户明确要求「非必要不处理（Pick、定义别名）类型」并「优先相信静态类型定义以避免过多的防御性代码」，因此不保留该方案。

**把官方类型包放入 `dependencies`、`peerDependencies` 或 `dsh.client.inject`。** 官方包自身把这些类型聚合包放在 `devDependencies`，`peerDependencies` 只保留 `@deepseek-ai/cordis`，`dsh.client.inject` 只列出需要运行时装载的 assembly。本仓只做类型引用，不需要运行时模块，跟随官方布局即可；否则会把类型依赖误变成运行时依赖。该方案被否决。

**仅从功能包各自的 `typert.remote-client.d.ts` 取类型。** 这些文件只声明本包拥有的 namespace，例如 plugin-manager 的 `pluginRegistryProbe`，不声明其他包的 `pluginManager`；跨包契约以 `@deepseek-ai/dsh-api-remotes` 的重新导出为准。该方案被否决。

## 后果

- 官方声明成为唯一来源，测试 fixture 必须构造完整官方对象；`availability: "available"` 和缺少 `changed` / `stage` / `target` 的变更结果在编译期即被拒绝。
- 运行时代码减少一层投影与校验；`unwrap` 只区分成功与失败分支，`ChangeResult.application` 的五种取值由官方联合类型保证。
- 官方类型聚合包需要显式出现在开发依赖：`@deepseek-ai/dsh-api-remotes` 的声明引用 `@deepseek-ai/dsh-plugin-manager/types`，pnpm 不会安装其 `devDependencies`，缺少该直接依赖时类型会退化为不可解析；`@deepseek-ai/dsh-settings` 则因 `SettingsForms` 的直接 `import type` 需要保留。
- 官方类型图未提供 prompt 注册服务声明，`SystemPromptHost` 仍是本地切片；后续若官方提供对应类型，应替换而不是继续维护手写形状。
- 本记录已由 `commit:ff64abe` 落地，实现锚点位于默认分支历史中。
