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
- 升级 DSH 基线时按 `docs/dsh-baseline-bump.md` 执行，装配审查是其中一步，不能只看版本声明。

## 实现与文档

- 说明和代码以实际需求、已观察行为或当前契约下可达的流程为依据；不为尚无依据或正常流程不会发生的假设场景增加说明、预留、兜底或防御代码。
- 除决策记录外，所有文档以最新实现和当前约定为准；实现变化时替换或删除旧说明，不留存旧版实现方式的介绍或沿革。

## 目录文档

每个目录的文档只负责本目录的实际职责、约定和边界：

| 目录 | 入口文档 |
| --- | --- |
| `native/` | [native/AGENTS.md](./native/AGENTS.md) |
| `playground/` | [playground/AGENTS.md](./playground/AGENTS.md) |
| `src/` | [src/AGENTS.md](./src/AGENTS.md) |
| `skills/` | [skills/AGENTS.md](./skills/AGENTS.md) |

- 目录文档只写本目录规则，其他目录只放指针，不重复内容。
- 目录职责变化时同步更新对应目录的 `AGENTS.md` 和根指针。

## Commits

- 破坏性变更提交使用 Conventional Commits 的 `type!:` 形式，例如 `feat!: ...`；不要使用 `!feat:`。

## Pull requests

- PR 创建后，在 PR 正文保留逐文件改动说明；后续推送改变文件集合或改动意图时同步更新。
- 每个新增、修改、删除、重命名文件各占一行，格式为 `文件 | 问题或需求 | 改动原因与验证依据`。原因解释为什么需要改、为何采用当前处理，不能只复述 diff。生成或同步文件注明来源和命令。
- 用 PR 的实际文件列表核对说明表，保证无遗漏、无已撤销条目；验证结果和仍未验证的部分另行汇总。

## Issues

- 一个 issue 聚焦一个问题，以观察到的行为、证据和影响为主。
- 可以简述根因判断或改进建议，并注明依据；区分已验证事实与推测。
- 默认写简短的问题报告；详细设计、方案对比、任务分解和验收或验证计划按用户要求展开。
- 带上能复现的环境：版本、模型、命令或会话。
- 行为偶发时附重试结果和出现频率，让问题可判定。
- 正文按 `.github/ISSUE_TEMPLATE/` 里的模板写；`gh issue create` 不过模板、不打标签，需要时手动加。

## Local scratch

- 本地验证的临时文件写入仓库 `.tmp/`；后续步骤要读取的文件放在可持续访问的工作区。
- 真实插件运行测试统一走 `playground/`，遵循目录指引。真实会话的模型选择由用户确认，agent 用会话日志佐证。
