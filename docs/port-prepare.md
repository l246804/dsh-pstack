# pstack 移植结构整理报告

本文件是 `/pstack-port prepare` 的本轮产物，记录结构、目录映射、最小修正与构建验证。需求调查、脚本行为等价与适配文档内容分别留给 `audit`、`implement`、`doc`。

## 1. 基线

| 上游 | 检出路径 | 提交 | 版本 |
|---|---|---|---|
| pstack | `upstream/cursor-plugins/pstack` | `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe` | `0.15.36`（`plugin.json`） |
| DSH | `upstream/deepseek-harness` | `ce7073d51254c26cd63b22a60835b8f948deb447` | `0.2.2-alpha.2`（根 `package.json`） |

本轮由 `upstream` 分支更新子模块指针：pstack `1ba91fc` → `4dd1d05`，DSH `f3803c9` → `ce7073d`。`git diff --name-only 1ba91fc..4dd1d05 -- pstack` 为空，pstack 子树没有变化；DSH 区间有 351 个提交，包版本未变。`docs/port-state.yaml` 为 `idle/done`、`blocker: null`，本分支不修改它。

## 2. 结构追踪表

上游 573 个文件：58 个 `SKILL.md`、23 个 playbook、29 个 reference、169 个 Markdown。生成树 557 个文件、约 7.5 MB。随包树 `dist/pstack` 178 个文件、约 3.7 MB；差异来自 statechart 测试语料只在生成树中、构建时被整目录替换，以及 15 个不进入生成树的上游元数据与 automation 文件。

| 上游资产 | 手写位置 | 生成位置 | 随包位置 |
|---|---|---|---|
| `skills/<技能>/SKILL.md`、`references/`、`playbooks/`、图片与模板 | 无（上游原文；DSH 差异只进主适配器，生成器给使用 Cursor 名字的 23 个 `SKILL.md` 插入一次会话读取行） | `pstack/pstack/skills/<技能>/…` | `dist/pstack/skills/<技能>/…` |
| `docs/guide/**` | 无（上游原文） | `pstack/pstack/docs/guide/**` | `dist/pstack/docs/guide/**` |
| `docs/harness/claude-code.md`（主适配器） | `pstack/harness/docs/harness/dsh.md` | `pstack/pstack/docs/harness/dsh.md` | `dist/pstack/docs/harness/dsh.md` |
| `agents/**` | 无（上游原文） | `pstack/pstack/agents/**` | `dist/pstack/agents/**` |
| `README.md`、`LICENSE` | 无（上游原文） | `pstack/pstack/…` | `dist/pstack/…` |
| `automations/benny/**` | 无 | 不进入生成树；README 的相对链接由生成器改写为 `https://github.com/cursor/plugins/…` | 不随包（`EXCL-01`） |
| `assets/logo.png`、`plugin.json`、`.cursor-plugin/plugin.json` | 无 | 不进入生成树 | 根 `assets/logo.png`、根 `package.json` 与 `cordis.patch.yml` 承担品牌与插件声明 |
| `skills/poteto-mode/scripts/**`、`skills/show-me-your-work/scripts/**`、`skills/statechart/scripts/**` | `pstack/runtime/skills/<技能>/scripts/**` | `pstack/pstack/skills/<技能>/scripts/**`（先渲染上游原文，随后由 `replace:scripts` 整目录替换） | `dist/pstack/skills/<技能>/scripts/**`（编译 `.mjs`） |
| 根插件能力 | 根 `src/*.ts`、`cordis.patch.yml` | — | `dist/{index,models,script,skill,subagent}.mjs` |

生成器 `pstack/scripts/generate-pstack-harness-tree.mjs` 按生成树相对路径优先读取 `pstack/harness/`，否则读取上游原文；主适配器替换上游 CC 适配器进入生成树，并按主适配器为使用 Cursor 名字的技能插入一次会话读取提示、检查名称映射与相对链接；`--check` 逐字节比对生成树漂移。

## 3. 最小修正与清理

本轮没有结构修正，工作区只改本文件。上一轮已完成的 `pstack/overlay/` → `pstack/harness/` 迁移与 `orch` 清理（`1d1d8b6`、`66a705a`）保留，本轮只复核结果。以下项复核通过：

- `pstack/harness/` 只有 `docs/harness/dsh.md`，上游 `docs/harness/` 只有 `claude-code.md`；主适配器一一对应，生成树 `pstack/pstack/docs/harness/` 只有 `dsh.md`，没有重复适配器或散置实现。
- `pstack/overlay/` 不存在，生成器 `origin()` 只优先读 `pstack/harness/`；旧的 `orch` 镜像与 `SCRIPT_ENTRIES` 中的 `orch` id 均已删除；仅 `tests/script.test.ts` 保留拒绝 `orch` 的负向断言，`pstack/README.md` 保留历史能力行。
- `pstack/runtime` 45 个文件，对应三个技能；`replace-scripts.mjs` 的 `REPLACED` 为 `poteto-mode`、`show-me-your-work`、`statechart`，`SCRIPT_ENTRIES` 的 5 个 id 与镜像一致。
- 生成树已重跑生成器，`pstack/pstack` 无差异。

模块边界与入口点没有变化，`docs/architecture.md` 无需更新。

脚本清理：本轮未重构 `pstack-port` 技能，无旧脚本需要清理。

## 4. runtime 镜像逐脚本去向

| 上游脚本 | 镜像 | 入口与输入输出 | 测试 | 调用方与验收 | 状态 |
|---|---|---|---|---|---|
| `poteto-mode/scripts/check-plan.mjs` | `pstack/runtime/skills/poteto-mode/scripts/check-plan.mjs` | `check-plan.mjs <plan.md>`；读 plan，向 stdout 输出 findings；退出 0/1/2；DSH 版接受 `/loop 1h` 或 `create_goal` 加 `schedule_create` | `check-plan.test.ts` | `pstack_script` id `check-plan`；`vp run @internal/pstack#test` | Node 等价实现 |
| `poteto-mode/scripts/watch-pr/**` | `pstack/runtime/skills/poteto-mode/scripts/watch-pr/**` | `watch-pr [--owner] [--repo] [--pr] [--stack] [--queued-stack] [--stack-prs] [--interval] [--sweep-interval] [--timeout] [--max-query-errors] [--status-only] [--allow-draft] [--pretty]`；输出 JSON、NDJSON 或 pretty 表；verdict 决定退出码，用法错误 64 | `watch-pr/{cli,github,policy}.test.ts` | `pstack_script` id `watch-pr`；同一测试命令 | Node 等价实现 |
| `poteto-mode/scripts/worktree-audit.sh` | `pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts` | `worktree-audit.mjs [-b\|--base <ref>] [-s\|--sessions <json>] [repo-path]`；输出 TSV 表；退出 0/1/2 | `worktree-audit.test.ts` | `pstack_script` id `worktree-audit`；同一测试命令 | Node 等价实现 |
| `show-me-your-work/scripts/log.sh` | `pstack/runtime/skills/show-me-your-work/scripts/log.ts` | `log.mjs <logfile> <phase> <decision> <why> <evidence> <result>`；追加一行 TSV；退出 0/1 | `log.test.ts` | `pstack_script` id `log`；同一测试命令 | Node 等价实现 |
| `statechart/scripts/**`（非测试源码） | `pstack/runtime/skills/statechart/scripts/**` | `statechart SPEC.tla [--config FILE] [--view FILE] [--out DIR]`；写 `report.md`、`chart.mmd`、`tlc.out`、`tlc-RULE.out`；退出 0/1/2/130/143 | `statechart.test.ts` | `pstack_script` id `statechart`；同一测试命令 | Node 等价实现（26 个源文件） |

| 上游资产 | 镜像 | 去向与理由 |
|---|---|---|
| `poteto-mode/scripts/bootstrap.ts`、`package.json`、`bun.lock`、`watch-pr/tsconfig.json` | 无 | 明确不移植：依赖自装删除，`commander` 由本包 `pnpm` 安装 |
| `poteto-mode/scripts/watch-pr/types.compile.ts` | 无 | 上游编译期类型断言；不进入运行时，现有测试不覆盖负向类型断言 |
| `statechart/scripts/package.json`、`tsconfig.json`、`statechart` 启动器 | 无 | 构建元数据与启动器不随包；编译后的 `statechart.mjs` 承担入口 |
| `statechart/scripts/test/**`（405 个文件，含 corpus） | 无 | 不随包；关键行为由 `statechart.test.ts` 对照，完整 TLC 差分需要外部 TLC、Java、mise |

## 5. 生成与替换链路

- `pstack/vite.config.ts`：`build:runtime` 用 `vp pack`（`root: "."`、`unbundle: true`）把 `pstack/runtime/**` 编译到 `pstack/dist/runtime/**`；`generate` 调 `generate-pstack-harness-tree.mjs` 重建 `pstack/pstack`；`copy:pstack` 把 `pstack/pstack` 拷到 `pstack/dist/pstack`；`replace:scripts` 用 `dist/runtime/skills/<技能>/scripts` 替换 `dist/pstack/skills/<技能>/scripts`；`build` 依赖 `replace:scripts`。
- `pstack/scripts/generate-pstack-harness-tree.mjs`：逐路径优先读 `pstack/harness/`，否则读上游；主适配器 `docs/harness/claude-code.md` 换成 `docs/harness/dsh.md`；给 23 个使用 Cursor 名字的 `SKILL.md` 插入一次会话读取行；校验 frontmatter 名称、DSH 术语映射与相对链接；`--check` 按字节比对生成树。
- 根 `vite.config.ts`：`build` 依赖 `@internal/pstack#build`，`vp pack` 把 `pstack/dist/pstack` 拷入 `dist/pstack`，并复制 `skills/authored` 与 `skills/.agents/skills`。

上游 `upstream/cursor-plugins/scripts/generate-pstack-harness-trees.mjs` 是本仓生成器的来源：它复制 `skills/`、`agents/`、`docs/guide/`、`claude-code.md`、`README.md`、`LICENSE` 到 `harness/pstack/claude-code`，并从 `plugin.json` 生成 `plugin.json` 与 `.claude-plugin/plugin.json`，明确不复制 `automations/` 与 `assets/`。本仓生成器沿用同一套复制、适配行插入、缺失链接改写与 frontmatter 校验逻辑；差异只有输出路径 `pstack/pstack`、主适配器名 `dsh.md`、去掉 Cursor/Claude 插件清单、增加 `pstack/harness/` 优先读取。插件清单由根 `package.json` 与 `cordis.patch.yml` 承担；上游 `check-pstack-docs.mjs` 与 `validate-plugins.mjs` 不作用于本仓生成树。

## 6. 验证记录

| 检查 | 命令 | 退出码 | 结果 |
|---|---|---|---|
| 生成树漂移 | `node pstack/scripts/generate-pstack-harness-tree.mjs --check` | 0 | `pstack/pstack is up to date.` |
| pstack 构建链 | `vp run @internal/pstack#build` | 0 | 4/4 任务成功，`replace:scripts: replaced 3 skill script directories` |
| runtime 行为测试 | `vp run @internal/pstack#test` | 0 | 76 通过、0 失败 |
| 根发布构建 | `vp run build` | 0 | 5/5 任务成功，`dist/*.mjs` 与 `.d.mts` 产出 |
| 插件测试 | `vp test` | 0 | 7 个测试文件、39 个测试通过 |
| 格式、静态与类型检查 | `vp check` | 0 | 49 个文件格式正确；0 错误、1 条既有 warning（`generate-pstack-harness-tree.mjs:204` 的 `require-array-sort-compare`） |
| 适配文档对账 | `vp run @internal/pstack#check:harness-doc` | 0 | `harness doc is consistent with README, the upstream template, and src.` |
| FIX 重放 | `node pstack/scripts/port-fixes.mjs replay` | 0 | `No active FIX records; replay passed.` |

## 7. 后续实现事项与未决项

- 本轮没有发现需要 `implement` 处理的结构缺口。`statechart` 已按 B 方案完成 Node 移植（26 个源文件、1 个精选行为测试），`poteto-mode`、`show-me-your-work` 的镜像完整。
- DSH 参考文档在 `f3803c9..ce7073d` 间改动较大：`docs/tool-catalog.md` 增删 103/222 行，`docs/subsystems/forge.md` 增删 82 行；`pstack/README.md` 的 DSH 证据行号可能过期，`audit` 必须按 `ce7073d` 重新冻结，不能沿用旧行号。
- `pstack/README.md` 的审查基线仍写 `1ba91fc`/`f3803c9`，`docs/port-review.md` 仍是上一轮完成头部；`audit` 重建 README 与重置轮次工作文件时一并更新。`pstack/README.md` 中指向本文件的旧行号链接也需要在重建时改写。
- `docs/decisions/2026-10-29-pstack-harness-tree-port.md` 仍为 `proposed`、`Implemented-by: -`，而当前结构已按该记录运行；本分支不修改决策记录，若要把它转为既定适配，由用户走 `decision-write` 的落地流程。

下一步：`/pstack-port audit`。
