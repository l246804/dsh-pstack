# pstack 移植与维护

本文件是移植与生成的基准。它保存适配文档规则、生成与发布约束、扩展目标和重建注意事项。

## 固定边界

- 根 `pstack/` 只放生成的插件树。生成器可以整体替换该目录，不允许把手工文件放在其中。
- 根 `port/` 集中保存移植工具与适配资料。以 `dsh.md` 为源生成的英文适配文档进入生成树；面向中文用户与审核者的版本不进入生成树，由 `README.zh.md` 直接链接。
- `port/dsh.md` 是当前适配文案的唯一手写来源，必须按审核通过的适配说明、当前 `cordis.patch.yml` 和实现维护。可选插件表以包名为主键，不另外维护编号。
- 插件源码、测试、扩展登记和回归记录都在生成树之外。生成器不会修改这些内容。
- 根 `package.json` 的 `exports` 由根 `vite.config.ts` 生成。主 pack 的 `entry` 为 `./src/*.ts`；仅第一个 pack 的 `customExports` 补齐非源码入口。其他 pack 使用 `exports: false`。
- `upstream/cursor-plugins` 提供 pstack 源文件。DSH 的基线来自目标运行时及其随附文档和 API。
- DSH 适配以 Web profile 的标准模式为基线。验证在 playground 的真实 Web 会话中进行。
- 上游 `claude-code.md` 明确排除的 Cursor 云服务和平台能力同样舍弃。通用本地能力可以独立适配，但不宣称其等价于云服务。

## 从 0 到 1

1. 按审核通过的适配说明编写 `port/dsh.md`，同时产出中文版 `port/dsh.zh.md`。
2. 维护可选插件表，以包名为主键，不另外维护编号。
3. 用 `port/generate.mjs` 生成根 `pstack/`，用 `--check` 检查生成漂移。
4. 验证生成树中的链接、适配提示与已确认行为。


脚本原样复制，保留依赖文件和可执行权限，不重写为 Node。为每个脚本登记用途、解释器、外部命令和限制。非常用能力不默认提供插件内补偿。环境不满足时明确报告不可用，不将跳过算作适配成功。

### 脚本登记

按当前随包生成树登记每个可执行入口脚本：

| 入口 | 用途 | 解释器 | 外部命令与运行时 | 重要限制 |
|:--|:--|:--|:--|:--|
| `check-plan` | 校验 multi-phase-plan 的计划文件 | `#!/usr/bin/env node` | 无外部命令，Node 运行时 | 无 |
| `watch-pr` | babysit 与 shipping 轮询 PR 状态 | `#!/usr/bin/env bun` | Bun、网络、`gh`（含登录）、`git`；首次运行 `bun install --frozen-lockfile` 写 `node_modules` | 只支持 GitHub，不支持 Origin；缺 Bun 或未登录 `gh` 时不可用 |
| `worktree-audit` | worktree-cleanup 的工作树分类审计 | `#!/usr/bin/env bash` | `git`、`gh`（PR 状态，可用 `origin` CLI 替代）、`jq`，以及 `awk`、`sed`、`grep`、`sort`、`head`、`du`、`stat`、`date` 等基础命令 | 只读审计，可能执行 `git fetch`；无 `gh` 或 `origin` 登录时缺少 PR 状态 |
| `log` | show-me-your-work 追加 TSV 决策日志 | `#!/usr/bin/env bash` | `date`、`mkdir`、`printf`、`tr` | 无 |
| `statechart` | TLA+ 模型检查与 Mermaid 状态图 | `#!/bin/sh`，按版本依次选择 Node 22.18 至 22.x 或 23.6 以上、Bun 1.1.5 以上、Deno 2.0 以上 | `mise`、`java`、`tlc`；首次 `mise install` 需网络 | 首次运行需网络安装 TLC 与 `java@temurin-25`；缺 TLC 时只输出 Mermaid 文本 |

## 从 1 到 100

新增或修改扩展时，继续遵守能力来源优先级和审核规则。在下方登记扩展类别及保留目标。具体按钮、字段、文案和布局由代码、测试及当前使用说明表达，不在这里复制。

## 破坏性变更

DSH 或 pstack 任一上游发生破坏性变更时，按新基线重新实现受影响内容，不维护跨基线兼容分支或过渡实现。运行时适配文档只描述所选基线的行为。

实现提交使用 Conventional Commits 的 `type!:` 形式。破坏性适配同时更新 `package.json` 的 DSH 范围和 `playground/baseline.json` 的 `compatibilityKey`，并在双语 README 注册新的兼容键、增加对应行；保留旧兼容行。

`vp run release` 在版本更新后、发布提交前由 `bump.config.ts` 的 `execute` 钩子在同一进程内调用 `port/release-compatibility.ts` 导出的 `syncCompatibility`。该函数读取当前版本、DSH 范围、兼容键与实际 pstack 版本：键匹配时更新该行，每个 `x.y` 只保留最新 `z`；键不存在时追加行；同一键对应不同 DSH 范围时停止。发布提交包含 `package.json` 和双语 README。`vp run compatibility:check` 以只读方式检查同步结果。

DSH 升级后从标准模式开始重新检查。标准能力已经满足时，删除本插件的补偿实现。

开始重建前读取下方的本地扩展和回归记录。扩展采用新基线的 API 实现，并保留其用户目标。每项扩展都需要在新基线上验证。

## 本地扩展

| 能力类别 | 用户目标 | 状态 |
|---|---|---|
| 插件配置入口 | 用户可在插件详情页集中进入下述配置能力。 | 已实现 |
| 推荐插件管理 | 用户可查看推荐插件及状态，并管理与本插件配合的官方插件。 | 已实现 |
| 角色模型配置 | 用户可在插件界面查看和编辑角色路由，无需手动改写配置文件。 | 已实现 |
| 根模式预设 | 用户可在新会话选择 `poteto-mode` 或 `poteto-mode-creator`，让完整技能常驻系统提示。 | 已实现 |

## 重建回归记录

记录每次移植都需要预防的问题及其验证方法。普通缺陷由修复提交和回归测试留存。

| 编号 | 问题与触发条件 | 根因 | 预防或验证 | 状态 |
|---|---|---|---|---|
| RG-001 | DSH 升级后根 preset 工具集漂移 | 根 preset 手工复制标准与创造模式的工具行 | `tests/preset-parity.test.ts` 对 `tests/fixtures/dsh-<version>/` 的基线做完整插件行对比；升级基线时刷新 fixture | 已覆盖 |
