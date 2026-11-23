# 决策：依赖按命名 pnpm catalog 分类后安装

Status: accepted
Date: 2026-11-07
Scope: AGENTS.md, pnpm-workspace.yaml, pnpm-lock.yaml, package.json, tests/**, docs/decisions/**
Implemented-by: commit:ea63839ce3a1cfddeb4564b3cdb0a204df58a553
Review: 2026-11-22

## 背景

本仓使用 pnpm workspace，并在 `pnpm-workspace.yaml` 中按用途定义了命名 `catalogs`（`agentic`、`browser`、`cli`、`types`、`runtime`、`ui`、`testing`、`playground`）。但安装流程没有强制约束：此前用 `vp add` 新增官方类型包时，`package.json` 一度写成裸 `catalog:`，`pnpm-workspace.yaml` 一度出现顶层 `catalog:` 块；虽然后续手工修正为 `catalog:types`，这类写入仍会再次发生。

同时 `catalogMode` 原为 `prefer`：pnpm 在 catalog 版本与请求版本不兼容时会回退为直接版本号并只给出警告。这样依赖声明可以绕过 catalog，分类和版本唯一性都失去保证。用户明确要求「所有依赖都需要基于 pnpm catalog 并分类后再安装，不要装在 `catalog:` 中」，目标是让安装命令本身产生正确结果，而不是依赖事后人工清理。

约束是：根 `pstack/` 只由 `scripts/generate-pstack.mjs` 写入，其中上游脚本的 `package.json` 使用 Bun 与 `bun.lock`，保留直接版本号且不属于 pnpm workspace importer；不能为了统一规则改写生成树，也不能把生成树纳入 workspace packages。

## 决策

所有 pnpm workspace 依赖先按用途归入命名 catalog，再安装；依赖声明只使用 `catalog:<分类>`。

- `pnpm-workspace.yaml` 使用 `catalogMode: strict`。版本与 catalog 不兼容时安装失败，不再静默回退为直接版本号。
- 只使用复数 `catalogs` 下的命名分类。禁止顶层单数 `catalog:` 块、裸 `catalog:` 协议（等价于默认 catalog）、以及任何直接版本号。
- 安装命令固定为 `vp add --save-dev --save-catalog-name <分类> <pkg>`（或对应的 `--save-prod` / `--save-peer` 变体）。新增依赖前先确定分类；`types` 只放官方类型与类型工具，`runtime` 放 Host 或 Client 运行时直接导入的官方运行时包（如 `cordis`、`cordis-plugin-loader`、`dsh-typert-protocol`、`dsh-sandbox-policy`、`schemastery`），`ui` 放 React 与视图库，`testing` 放测试运行时，`playground` 放 playground 专用工具，`browser`、`cli`、`agentic` 各自对应工具用途。一个包从类型用途转为运行时用途时，必须从其原分类迁到 `runtime`，并同步修改 `package.json` 中的 `catalog:` 前缀。
- 本记录是依赖安装、分类和测试文件语言规则的唯一来源。由安装命令、`catalogMode: strict` 和约定保证，不另写专门的 catalog 策略测试用例。新增测试用例优先使用 TypeScript 文件，非必要不写 JavaScript 测试文件。生成树保持排除在 `packages` 之外。
- 与官方类型决策记录分工：该记录决定官方类型包的来源与依赖分类（类型包为 `devDependencies` / `catalogs.types`；运行时包按本记录归入 `catalogs.runtime`），本记录决定所有依赖的安装协议与 catalog 模式。

## 替代方案

**使用裸默认 catalog（`catalog:` 协议或顶层 `catalog:` 块）。** 这是 `vp add --save-catalog` 的默认行为，也是此前误写入的形态。它不携带用途分类，无法表达 `types`、`ui`、`testing` 等语义，且用户明确禁止「装在 `catalog:` 中」。该方案被否决。

**保留 `catalogMode: prefer`。** 它在 catalog 版本与请求版本不兼容时回退为直接版本号，只打印警告；依赖声明因此可以再次绕过 catalog，与本决策要求冲突。`strict` 才能让安装命令无法产生未分类依赖。该方案被否决。

**`catalogMode: manual`。** 该模式完全不自动把依赖写入 catalog，`vp add` 会默认写成直接版本号，需要每次显式传 `--save-catalog-name`。它使规则完全依赖人工记忆，弱于 `strict` 的强制约束。该方案被否决。

**把生成树 `pstack/` 下的上游脚本 `package.json` 也纳入 catalog。** 这些文件由生成器从固定上游整体复制，使用 Bun 与 `bun.lock`，不是 pnpm workspace importer；改写会破坏「上游脚本保持原样」的移植规则，并在下次生成时被覆盖。该方案被否决，改为在本记录中明确排除。

## 后果

- 新增依赖必须先选分类；安装命令带 `--save-catalog-name` 时，pnpm 会把版本写入对应命名 catalog 并在 `package.json` 写入 `catalog:<分类>`。
- 请求版本超出 catalog 范围时 `strict` 直接报错，升级版本应修改 `pnpm-workspace.yaml` 的 catalog 条目，而不是在 `package.json` 写直接版本号。
- 不维护专门的 catalog 策略测试；新增依赖时由 `--save-catalog-name` 和 `catalogMode: strict` 在写入阶段保证分类，评审时核对 `package.json` 与 `pnpm-workspace.yaml` 即可。
- 本记录已由 `commit:ea63839` 落地，实现锚点位于默认分支历史中。
