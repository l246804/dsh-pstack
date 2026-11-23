# 决策：按官方插件惯例声明 DSH 依赖与客户端产物

Status: accepted
Date: 2026-11-08
Scope: package.json, pnpm-workspace.yaml, pnpm-lock.yaml, vite.config.ts, docs/architecture.md, tests/harness-types.test.ts, docs/decisions/**
Implemented-by: commit:670c9028e01cc00f1adf5cdfd516dce18b6283cc
Review: 2026-11-22

## 背景

本插件在运行时从多个 `@deepseek-ai/*` 包导入实现：`@deepseek-ai/cordis` 提供 Service 基类，`@deepseek-ai/cordis-plugin-loader` 提供 `EntryGroup`，`@deepseek-ai/schemastery` 提供 `Config` schema，`@deepseek-ai/dsh-typert-protocol` 提供 `TypertRemoteService`，`@deepseek-ai/dsh-sandbox-policy` 提供 `setSandboxMode`；浏览器端还从宿主模块加载器取得 React。此前这些包只写在 `devDependencies`，`peerDependencies` 只有 `@deepseek-ai/cordis`。构建把 `@deepseek-ai/*` 与 React 全部外部化后，发布物存在未声明的运行时导入，能否解析取决于宿主是否提供，缺少可追溯的规则说明。

官方插件包已经对同一问题给出了稳定做法。`@deepseek-ai/dsh-tool-web` 把 `dsh-llm`、`dsh-system-prompt`、`dsh-tools`、`dsh-web` 放进 `peerDependencies`，把 `@deepseek-ai/schemastery` 放进 `dependencies`；`@deepseek-ai/dsh-agent-preset` 把 `cordis`、`cordis-plugin-loader`、`agent-preset-registry` 放进 `peerDependencies`，把 `schemastery` 放进 `dependencies`；`@deepseek-ai/dsh-plugin-manager` 把 `dsh-typert-protocol`、`dsh-sandbox-policy` 放进 `peerDependencies`；`@deepseek-ai/dsh-client-ui-settings-plugins` 只把 `@deepseek-ai/cordis` 放进 `peerDependencies`，React 与客户端 assembly 留在 `devDependencies`。约束是：本插件仍只用 pnpm 命名 catalog，官方运行时实现不得打进 `dist`。

## 决策

依赖放置优先沿用官方插件的分类：

- 平台在运行时提供的 `@deepseek-ai/dsh-*` 服务包进入 `peerDependencies`：`@deepseek-ai/cordis`、`@deepseek-ai/cordis-plugin-loader`、`@deepseek-ai/dsh-typert-protocol`、`@deepseek-ai/dsh-sandbox-policy`。
- 随插件打包的独立运行时工具库进入 `dependencies`：`@deepseek-ai/schemastery`。
- 仅类型使用的官方包留在 `devDependencies` 与 workspace 的 `types` catalog，`peerDependencies`、`dependencies` 不因类型导入增加条目。
- React、`react-dom`、`react/jsx-runtime` 由宿主模块加载器提供，只保留在 `devDependencies`，不写成 `peerDependencies` 或 `dependencies`。
- 版本仍来自 pnpm 命名 catalog：运行时包用 `catalog:runtime`，仅类型包用 `catalog:types`，`catalogMode: strict` 不变。
- Client 产物沿用官方 loader 契约：`window.__ModuleLoader__.load({ factory: (require) => ... })` 包装，文件名用 `dist/client.js`；不生成也不发布 sourcemap。
- `tests/harness-types.test.ts` 固定上述分类；`docs/architecture.md` 的依赖方向一节引用本记录。

## 替代方案

**所有运行时 `@deepseek-ai/*` 都留在 `devDependencies`。** 这是本轮之前的写法，发布物因此存在未声明的运行时导入；与官方插件把平台服务写成 peer 的做法相反。该方案被否决。

**把所有运行时依赖写成 `dependencies`。** 平台服务由宿主提供，写成 `dependencies` 会在安装期重复拉取宿主已有的实现，并与官方 peer 布局冲突。该方案被否决。

**把 React 写成 `peerDependencies`。** 官方客户端插件只把 React 放在 `devDependencies`，运行时由宿主模块加载器提供；写成 peer 会让宿主外的安装提示缺失依赖。该方案被否决。

**Client 继续输出 `client.mjs` 并生成 sourcemap。** 官方客户端产物是 `lib/client.js` 且不随包发布 `.map`；`.mjs` 承载 CJS 工厂易误导工具链，sourcemap 会暴露源码。该方案被否决。

## 后果

- 发布物声明的运行时依赖与官方插件一致，宿主解析路径可追溯；`peerDependencies` 增多，但都由宿主 profile 提供。
- `@deepseek-ai/schemastery` 从 dev 移到 `dependencies`，`pnpm-lock.yaml` 的 importer 记录随之变化。
- 客户端入口由 `dist/client.mjs` 改为 `dist/client.js`，不再产出 `dist/client.mjs.map`；引用该路径的文档与导出同步更新。
- 依赖分类由测试固定，后续新增运行时导入时必须先判定平台服务还是随包工具库，再选择 peer 或 dependency。
- 本记录已由 `commit:670c9028e01cc00f1adf5cdfd516dce18b6283cc` 落地到默认分支，`Status` 更新为 `accepted` 并写入该实现锚点。
