<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# AGENTS.md

## Project docs

- 改动某个模块前读 `docs/architecture.md`；模块边界或入口点变化时同步更新它。
- 命名概念前读 `docs/glossary.md`；引入新概念时补充术语。
- 开始任何仓库任务前读 `docs/decisions/AGENTS.md`，按其检索规则读取与任务相关的决策记录。

## Local scratch

- 本地验证的临时文件一律写仓库 `.tmp/`（已 gitignore，`vp check` 不扫描）；Bash 每次调用是独立沙箱，`/tmp` 不跨调用保留，不要用它承载后续步骤要读的文件。
- 真实插件运行测试统一走 `playground/`（见 `docs/decisions/2026-10-30-playground-real-plugin-testing.md`）：不要在 `~/.dsh` 或 `.tmp` 下另建测试用 home/profile；能用 `dsh` 命令判定的检查也在 playground 内跑。启动用 `vp run playground`（task 在根 `vite.config.ts`）。
- playground 验证：截图/视觉与不涉及模型的 UI 交互由 agent 用 `playground/browser.mjs` / agent-browser 自动完成；真实会话涉及用户所选模型，由用户操作并确认，agent 用 `zstdcat playground/.dsh/sessions/**/session.v4.jsonl.zstd` 佐证。
