# 决定：随包脚本改为 Node 产物，依赖内联，经 Host 运行时执行

Status: accepted
Date: 2026-10-25

## 背景

随包的六个脚本（`check-plan`、`orch`、`watch-pr`、`worktree-audit`、`log`，以及它们的测试）此前是上游的原始形态：TypeScript 直接用 Bun 跑，两个 shell 脚本用 bash 跑，`commander` 靠 `bootstrap.ts` 在启动时 `bun install`。

这带来三个必须在发布前解决的问题：

- **Bun 是运行依赖。** 用户机器上没有 Bun 时，编排、PR watcher、计划检查和决策日志全部不可用。上游 `bootstrap.ts` 还会在脚本目录里装出 `node_modules`，而该目录在生成树里没有上游来源，`check:assets` 会判成未声明文件。
- **bash 是运行依赖。** `worktree-audit.sh` 和 `log.sh` 需要 bash、`jq`、`awk`、`du`、`date` 等一串外部工具，Windows 上不成立。
- **Desktop 上没有 PATH `node`。** DSH 是纯 Node 应用（`bin` 是 `lib/bin.js`），但 Desktop 用 Electron 运行时执行同一个 CLI，且只在子进程启动时保留 `ELECTRON_RUN_AS_NODE=1`。因此 Desktop 用户的 `PATH` 上可能没有 `node`，任何 `#!/usr/bin/env node` 脚本或 `node <path>` 调用都可能失败。

## 决定

1. **构建。** 新增 `scripts/build-runtime.ts`，用 vite-plus 的 `build()` 编程式打包（`write: false`，内存产物，target `node22`，format esm，`codeSplitting: false`，单文件）。`commander` 固定 14.0.0，源码提交在 `vendor/commander/`（含 MIT LICENSE），通过 alias 供打包使用，**不是**运行时依赖。
2. **产物。** `orch/orch.mjs`、`watch-pr/watch-pr.mjs`、`worktree-audit.mjs`、`log.mjs`、`check-plan.mjs`，以及五个 `.test.mjs`。首行 `#!/usr/bin/env node`，CLI 可执行位 `0o755`、测试 `0o644`，不含 `bun:` 引用、`Bun.*` 全局和 `node_modules` 解析。随包的 `bootstrap.ts`、`package.json`、`bun.lock` 删除，产物不调用任何安装命令。
3. **Host 执行入口。** 新增模型工具 `pstack_script`：`id` 是固定枚举（只允许随包脚本，不接受任意路径或 shell 字符串），用 `node:child_process` 以 `process.execPath` 启动产物，当 `process.versions.electron` 存在时附加 `ELECTRON_RUN_AS_NODE=1`。非零退出码、超时、输出上限都显式返回；`background: true` 需要 jobs 服务，缺失时明确拒绝并说明原因。
4. **两个 shell 脚本改写成 Node**，行为逐字节对齐：`worktree-audit` 保留现有列、bucket 取值、`PINNED unknown`、`--sessions` 语义、git/du 等价逻辑，jq 改为 `JSON.parse`，不扫描会话存储；`log` 保留表头只写一次、追加不覆盖、tab/CR/LF 清理、`= + - @` 前缀转义和结尾换行。
5. **测试迁移。** 五个上游测试从 `bun:test` 迁到 `node:test`，用一个约百行的 `expect` 兼容层覆盖 `toBe`/`toEqual`/`toContain`/`toMatch`/`toThrow`/`rejects`/`not`；`Bun.spawnSync`/`Bun.spawn` 换成 `node:child_process` 适配。测试本身也纳入打包管线产出 `.test.mjs`，用 `node --test` 运行。
6. **`check:scripts` 零安装化。** 只复制 scripts 目录到临时目录，隔离 `HOME`/`TMPDIR`/`XDG_CACHE_HOME`，`node --test` 跑全部随包测试，再对每个 CLI 做一次 usage 冒烟；不调用 bun、不调用 bash、不联网，失败非零退出，`finally` 清理。

## 备选方案

- **保留 Bun。** 放弃。Bun 是三者中运行时开销最大的一项（下载、安装、把 `node_modules` 写进生成树），而且 Desktop 用户没有理由为一份技能包额外安装一个运行时。测试里唯一真正用到 Bun 的只有 `bun:test` 和 `Bun.spawn`，都不构成保留的理由。
- **只靠 PATH 的 `#!/usr/bin/env node`。** 放弃。这正是要解决的问题：Desktop 不保证 `PATH` 上有 `node`，加了 shebang 也只是把失败从"找不到 bun"变成"找不到 node"。
- **Node SEA 单文件可执行。** 放弃。SEA 需要为每个目标平台各构建一次，产物是二进制，`pnpm pack` 的体积和可审计性都会变差；而这里真正需要的只是"不依赖 PATH 上的 node"，Host 运行时已经提供。
- **纯环境变量启动器（脚本里判断 `process.versions.electron` 自行重启）。** 放弃。每个脚本都要重复这段逻辑，Windows/pwsh 上的语法分裂更严重，而且后台任务语义（谁持有 job、谁投递 settlement）无法在脚本内部实现。放在 Host 工具里只写一次，且能复用 jobs 服务。

## 后果

- 不再需要 Bun、bash 或任何安装步骤；npm CLI 与 Desktop 用同一条执行路径，Desktop 的行为由 `ELECTRON_RUN_AS_NODE` 保证。
- 代价一：这些文件不再是上游的逐字节副本。上游更新时必须人工重新移植 `worktree-audit` 和 `log` 的行为，`orch`/`watch-pr`/`check-plan` 则通过 `RUNTIME_SOURCE_PATCHES` 继续跟随上游源码。
- 代价二：Desktop 路径只有单测和本机普通 Node 实跑，**未在真实 Desktop 应用内验收**；Windows 也**未在实机验证**。这两项留在 `docs/release-verification-checklist.md` 的未验证清单里。
- 代价三：产物大小（`watch-pr.mjs` 约 158 KB，`orch.mjs` 约 150 KB）比源码大，因为它们内联了依赖。这是换取"零安装"的直接成本。
