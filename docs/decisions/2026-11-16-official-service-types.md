# 决策：直接使用 DSH 服务与插槽类型

Status: accepted
Date: 2026-11-16
Scope: src/**, package.json, pnpm-workspace.yaml, docs/decisions/**
Implemented-by: commit:700bcb0
Review: 2026-11-22

## 背景

客户端和 Host 集成代码需要引用 DSH 的 system prompt、slot、shortcut、agent-instructions、session 和 projection 类型。此前缺少直接类型依赖时，只能写局部结构类型、使用 `as never`、`as unknown as` 或从相邻包借用声明。这些做法会让编译期检查退化，也会在 DSH 发布新版本后暴露为运行时错误。

已有的 [2026-11-07-official-contract-types.md](./2026-11-07-official-contract-types.md) 已经规定 Remote、服务、Bundle、Role 等官方类型必须直接使用，但没有覆盖 slot、shortcut、system prompt 和 agent instruction source。本条记录补充这类运行时契约的类型来源规则。

本规则不改变外部边界校验。JSON、RPC、进程参数、环境变量和运行时文件仍然必须在边界处做运行时验证。

## 决策

当源码需要 DSH 服务、slot、shortcut 或 event source 的类型时，直接添加对应官方包到 `devDependencies` 和 workspace 的 `catalogs.types`，并在源码中 `import type` 使用官方类型。

- `ctx.systemPrompt` 的类型来自 `@deepseek-ai/dsh-system-prompt`。
- slot 名称和 slot 组件类型来自声明该 slot 的客户端包，例如 `@deepseek-ai/dsh-client-ui-model-selection` 和 `@deepseek-ai/dsh-client-ui-conversation`。
- shortcut 类型来自 `@deepseek-ai/dsh-client-shortcuts/client`。
- agent instruction source 来自 `@deepseek-ai/dsh-agent-instructions`。
- 服务类型和 event 类型来自 `@deepseek-ai/dsh-agent`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-session-projection` 等对应包。
- 类型包只放 `devDependencies` 和 `catalogs.types`，不放进 `dependencies`、`peerDependencies` 或 `dsh.client.inject`。
- 代码内不再用局部结构类型、`as never` 或 `as unknown as` 绕过这些类型。运行时 official 依赖的放置仍按 [2026-11-08-dsh-dependency-declarations.md](./2026-11-08-dsh-dependency-declarations.md) 执行。

## 替代方案

**继续用局部结构类型和 `as never` 处理 slot、shortcut、system prompt 和 source 类型。** 否决。局部结构和强转不会随官方契约更新，编译期无法发现字段变更，最终只能靠运行时错误暴露。

**从相邻功能包的内部声明路径 import 类型。** 否决。这会依赖未公开的包布局，跨包 namespace 也可能不是该包拥有的类型。使用官方 package export 或声明该 slot 的 owner 包。

**把类型包放进 `dependencies` 或 `peerDependencies`。** 否决。类型包不提供运行时实现，放进运行时依赖会重复安装宿主已有包，也违反官方插件的依赖布局。类型包仍只属于开发期和 `catalogs.types`。

**只依赖 TypeScript 推导，不显式依赖声明。** 否决。没有直接依赖时，pnpm 不会安装该包，类型会退化为不可解析的 `any` 或错误，后续升级时更脆弱。

## 后果

- `package.json` 的 `devDependencies` 和 `pnpm-workspace.yaml` 的 `catalogs.types` 会增加实际使用的 DSH 类型包。
- slot、shortcut、system prompt 和 script/source 类型由官方声明保证，删除本地猜测和强制转换。
- DSH 升级时先由类型检查暴露契约变化，再同步更新 catalog 版本。
- 外部数据边界仍保留运行时解析，不把类型优先误解为信任外部输入。
