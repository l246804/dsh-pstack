# 决定：真实装配与宿主校验走 devDependency，运行时不引入宿主包

Status: accepted
Date: 2026-10-26

## 背景

[委派契约决定](2026-10-25-delegation-host-contract.md)把宿主契约复述在 `src/host-contract.ts`，备选方案 (b)「devDependency 只做类型检查」被放弃，理由是当时只读 store 装不进依赖、宿主包也没有可安装来源。该记录末尾写明：「若某天本仓库的依赖安装改为可写、且宿主包有可安装来源，(b) 会重新变得可行，那时应新写一条记录取代本记录」。

现在这两个前提都不成立了：

1. store 可写，`pnpm add` 能落盘；
2. `@deepseek-ai/cordis-plugin-loader@1.0.6`、`@deepseek-ai/cordis-plugin-include@1.0.10`、`@deepseek-ai/dsh-tools@0.2.1-rc.3` 都发布在 npm 上，`dsh-tools` 装下来的 `lib/index.js` 与宿主安装树里的那份逐字节相同。

同时，两条缺陷在纯 fake context 下**结构上不可见**，这是引入依赖的直接动因：

- `inject` 缺失。手写的假 context 把 `tools` 直接放在对象上，`ctx.tools` 读得到；真实 Cordis 里 service 走 Proxy，未声明 `inject` 时抛 `cannot get property "tools" without inject`。第一版探针就因此给出假阴性——根 context `ctx.provide()` 把属性放上原型链，绕过了这道门。只有让每个服务由独立 fiber 提供，`inject` 才会真的生效。
- worktree 守卫读错 entry。`{ fiber: { entry: { parent: { data: rows } } } }` 这种 ctx 恰好把"读哪个 entry"这个唯一缺陷点绕过去：测试作者选定的 entry 就是它自己期望的那个。

## 决定

把宿主包加进 `devDependencies`，只在测试里用，运行时仍然零 `@deepseek-ai` import：

1. `@deepseek-ai/cordis-plugin-loader`、`@deepseek-ai/cordis-plugin-include`、`js-yaml` 供 `tests/plugin-wiring.test.ts` 起真实的 `Loader` + `cordis:include`，把 `cordis.patch.yml` 当补丁层挂上去，断言实际挂载了哪些行、哪些行被判 `disabled`、`logs` 里有没有服务冲突。
2. `@deepseek-ai/dsh-tools` 供测试直接调用宿主的 `validateJsonSchemaValue` / `assertSupportedJsonSchema` / `jsonSchemaToTs`，而不是手搓一个校验器复本。工具输出契约的断言必须用宿主自己的实现，否则测的是本仓库对契约的理解。
3. 模块解析是唯一被替换的一环：`ResolvingInclude` 把四个 `dsh-pstack*` 包名映射到 `src/*.ts`（Node 在该版本上原生导入 TS）。entry 树、`!!js` 求值、`inject` 门、服务注册全部是真实实现。
4. `package.json` 的 `peerDependencies` 不变，`src/` 下仍不 import 任何 `@deepseek-ai/*`。

## 备选方案

- 继续只用 fake context（现状）。放弃：`inject` 缺失和守卫读错 entry 这两类缺陷在 fake 下恒绿，本次两个阻断项正是这样漏过发布的。测试绿而装配坏，比没有测试更危险。
- 用 `tsconfig` 指向本机 DSH 安装路径。放弃：绝对路径不可提交，静态检查会变成机器相关，正是旧记录否决 (b) 的理由之一。
- 在 `tests/` 里复制一份最小 JSON Schema 校验器。放弃：复制件会随宿主演进而漂移，且它证明的不是"宿主接受这个值"。§2 的症状恰恰是"本仓库以为 `signal` 可以是 `null`、宿主不认"，复制件会跟着本仓库的误解一起错。
- 手工构造 entry 树而不起 Loader。放弃：`disabled: !!js` 的求值点是 `Entry.disabledOf`，它绑定在 Loader 的 entry 上，绕开 Loader 就绕开了被测行为本身。

## 后果

两条阻断项从"靠人工在真实宿主上验证"变成每个 `pnpm run check` 都跑的自动门，且宿主的 schema 子集与 Loader 语义成为可执行的断言，而不是文档里的一句话。代价是本仓库多 4 个 devDependency，测试需要在 `beforeEach` 之外管理临时目录与 600 ms 级别的等待（entry 的 `init` 由各自 fiber 在 `create` 之后 await）。

`peerDependencies` 仍只声明 `@deepseek-ai/cordis`：装载器与 include 只在测试里需要，装进 peer 会让插件在只跑插件的 profile 里多一条无谓的依赖。

这条记录不推翻[委派契约决定](2026-10-25-delegation-host-contract.md)本身——运行时零 import、契约集中在 `src/host-contract.ts` 这两条继续有效。被取代的只是该记录备选方案 (b) 的可行性判断。若将来 npm 上的宿主包与目标 DSH 版本脱节，或 CI 变成离线环境，应新写一条记录重新评估测试侧的这份依赖，而不是让测试静默退化成 fake。
