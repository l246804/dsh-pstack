# 决定：技能 provider 不依赖宿主包，资产在包内就地读取

Status: accepted
Date: 2026-10-25

## 背景

单元 2 要让 55 个生成技能在真实 DSH profile 里可发现、可调用。`@deepseek-ai/dsh-skill` 定义了一个完整的 provider seam：`SkillProvider`、`SkillCandidate`、`SkillDefinition`、`SkillResourceBase`，以及打包 provider 使用的 `BUNDLED_SKILL_RANK = 600`。

本仓库的 `node_modules` 里没有任何 `@deepseek-ai/*` 包。开发时用 `plugin_manager install_bundle` 安装工作区目录，安装结果是链接到 checkout，模块解析从 checkout 开始；profile 的 `pnpm-workspace.yaml` 设 `autoInstallPeers: false`，顶层只 hoist 了 `cosmokit` 和 `schemastery`。也就是说，任何运行时 `import "@deepseek-ai/dsh-skill"` 在本仓库和链接安装两种场景下都解析不到。

同时，`Config` 需要能通过 Cordis 的校验。rc.3 的 Cordis 只要求 `Config` 是一个 Standard Schema，用 `Config["~standard"].validate()` 校验并按 `value` 替换行配置，不要求 schemastery。

## 决定

1. `src/provider.ts` 用手写结构类型复述 rc.3 的 provider 契约，不 `import type` 宿主包。类型来源是 Host Inspect 的 `Service.listService({ service: "skills" })` 输出与已安装的 `lib/types/index.d.ts`，复述处注明版本。
2. `BUNDLED_SKILL_RANK = 600` 在包内以常量复述，不导入。
3. `Config` 导出为最小 Standard Schema（`~standard.validate`），不引入 schemastery。字段只有 `providerName`，省略行 `config` 时补默认值 `pstack`。
4. `package.json` 只声明一个 peerDependency：`@deepseek-ai/cordis`。它是 provider 真正接入的宿主 seam（`ctx.skills`），且 `autoInstallPeers: false` 不会触发额外安装。
5. 资产在包内就地读取：`resourceBase` 与 `path` 都指向包内真实路径（`assets/skills/<name>`），不复制到 `$DSH_HOME/skills`。
6. 索引在 `apply()` 中构建并校验。缺失 `SKILL.md`、frontmatter 非法、`name` 与目录不一致都会让插件激活失败并带出文件路径，不会静默少一个技能。
7. 不 watch。包更新是唯一刷新边界，provider 不宣称热更新，也不调用 `control.invalidate()`。

## 备选方案

- 把 `@deepseek-ai/dsh-skill` 作为 peerDependency 并 `import type` + 导入 `BUNDLED_SKILL_RANK`。放弃，因为换来的是一个常量和一组会被擦除的类型，代价是链接安装时必须能解析到宿主包；本仓库也拿不到这些类型做 typecheck。
- 用 schemastery 写真正的 schema。放弃，因为本单元的 `config` 只有一个可选字段，Cordis 只消费 Standard Schema 的 `validate`，多一个运行时依赖没有换来校验能力。
- 用 `ctx.skills.register()` 把 55 个技能逐条注册成 runtime skill。放弃，因为那样没有单一 provider 位置放 frontmatter 校验和资源基址，而 `register()` 的语义是运行时追加，不是包内目录。
- 安装时把 assets 复制到 `$DSH_HOME/skills`，复用官方 filesystem provider。放弃，因为会在生成器之外多出一份可变副本，同步检查和包更新都不再是唯一事实来源。
- 监听 assets 目录并 `invalidate()`。放弃，因为打包后的树只在升级时变化，watch 只会制造一个不存在的热更新承诺。
- 在 `list()` 里读文件、`apply()` 不预检。放弃，因为那样损坏的技能要等到第一次列目录才暴露，且可能被上层当作“技能不存在”。

## 后果

包在 checkout 和链接安装下都能加载，静态检查不需要宿主包也能 typecheck。代价是两处需要人工同步：`BUNDLED_SKILL_RANK` 的数值，以及复述的 rc.3 类型。DSH 升级时要用 Inspect 重新核对 `skills` 服务签名，而不是相信这份副本。

单元 3 要接 `tools`、`subagents`、`llm`，接口面比 `skills` 大得多，复述的收益会变差。届时需要重新评估：为类型引入 devDependency、把契约副本集中到一处，或接受解析宿主包。本决定只覆盖当前的 provider 边界。

`skills` 的 `list()` 与 `get()` 都是异步签名，本实现同步读盘后立即返回，没有并发或远程初始化需求。若今后支持用户自定义目录，watch 与错误隔离要按设计文档 §8.1 重新设计，不能直接沿用这里的“失败即报错”。
