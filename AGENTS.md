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

- 修改模块前阅读 `docs/architecture.md`；模块边界或入口变化时同步更新。
- 为概念命名时阅读 `docs/glossary.md`；引入新概念时补充术语。
- 开始任何仓库任务前，阅读 `docs/decisions/AGENTS.md`，按其中的查找规则阅读与任务相关的记录。

## 目录文档

每个目录的文档只负责本目录的实际职责、约定和边界：

| 目录 | 入口文档 |
| --- | --- |
| `native/` | [native/AGENTS.md](./native/AGENTS.md) |
| `playground/` | [playground/AGENTS.md](./playground/AGENTS.md) |
| `port/` | [port/AGENTS.md](./port/AGENTS.md) |
| `src/` | [src/AGENTS.md](./src/AGENTS.md) |
| `skills/` | [skills/AGENTS.md](./skills/AGENTS.md) |

- 目录文档只写本目录规则，其他目录只放指针，不重复内容。
- 目录职责变化时同步更新对应目录的 `AGENTS.md` 和根指针。

## Commits

- 破坏性变更提交使用 Conventional Commits 的 `type!:` 形式，例如 `feat!: ...`；不要使用 `!feat:`。

## Local scratch

- 本地验证的临时文件写入仓库 `.tmp/`；后续步骤要读取的文件放在可持续访问的工作区。
- 真实插件运行测试统一走 `playground/`，遵循目录指引。真实会话的模型选择由用户确认，agent 用会话日志佐证。
