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

dsh-pstack 把 pstack 的技能与工作流移植到 DeepSeek Harness。仓库是 pnpm 工作区，只发布 `dist/`。

## Project docs

- 改动某个模块前读 `docs/architecture.md`；模块边界或入口点变化时同步更新它。
- 命名概念前读 `docs/glossary.md`；引入新概念时补充术语。
- 写、更新或评审决策记录前读 `docs/decisions/AGENTS.md`，按其格式、状态与检索约定执行。
- 重构 `pstack-port` 技能前读 `.agents/skills/pstack-port/SPEC.md`；该文件是用户锁定的场景与要求基线，任何 agent 不得修改，只能由用户明确要求追加。
- 改动 `pstack/harness/docs/harness/dsh.md`、`docs/harness-doc.yaml` 或 `pstack/README.md` 后，运行 `vp run @internal/pstack#check:harness-doc`；它是 `port doc` 与 `review port` 的门禁（SPEC R-12）。
