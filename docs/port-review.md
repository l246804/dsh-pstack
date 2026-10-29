# pstack 移植审查报告

- 轮次（round）：`#1`
- 上游提交：pstack `1ba91fc25c0977741dd0e267849e6234b037ed0a`（`0.15.36`）；DSH `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`（`0.2.2-alpha.2`）
- 开始时间（started_at）：2026-10-29T23:08:09+08:00
- 本轮输入：core Issue #1「角色配置文件名 poteto-models.mdc 与上游 pstack-models.mdc 不一致」

## findings

| id | origin | status | affected_ext | required_behavior | evidence |
|---|---|---|---|---|---|
| F-01 | Issue #1 | closed | — | 角色文件读写路径为 `$DSH_HOME/pstack-models.mdc`；不识别、不迁移旧 `poteto-models.mdc`，旧文件按缺失回退 `inherit-parent`；格式错误仍按行号报告；用户文档、DSH 适配文档、术语表与测试同步为上游同名 | `src/internal/role-manifest.ts`、`src/internal/role-config.ts`、`src/models.ts`、`tests/subagent.test.ts`、`README.md`、`README.zh.md`、`docs/glossary.md`、`pstack/harness/docs/harness/dsh.md`、`pstack/pstack/docs/harness/dsh.md`、`docs/decisions/2026-10-28-pstack-plugin-tools.md` |

## 实现证据（implement）

- 需求 → 能力行：Issue #1 的四条 `required_behavior` 已映射到 `pstack/README.md` §1.8（`SET-02`、`SET-06`、`MOD-04`、`PI-02`、`AD-01`）。
- 代码：`PSTACK_MODELS_FILENAME` 改为 `pstack-models.mdc`，`modelsFilePath()` 随之派生绝对路径；未新增旧文件名兼容分支，旧 `poteto-models.mdc` 走 `missing` 回退。`src/internal/role-config.ts` 头注释与 `src/models.ts` 的 `pstack_models` 工具描述同步。
- 测试：`tests/subagent.test.ts` 的夹具写入 `pstack-models.mdc`，诊断断言改为 `/pstack-models\.mdc:1:/`；覆盖角色读取、自动面板、列表 `roleIndex`、缺失回退、旧 `poteto-models.mdc` 被忽略与按行号报错。
- 文档与决策：根 `README.md` / `README.zh.md`、`docs/glossary.md`、DSH 适配器 `pstack/harness/docs/harness/dsh.md`（已渲染到 `pstack/pstack/docs/harness/dsh.md`）与既定决策 `docs/decisions/2026-10-28-pstack-plugin-tools.md` 均同步为上游同名；`pstack/README.md` §8.1 的 `SET-02`、`SET-06` 实现列更新为「已实现（本轮 #1）」，§6.1 注明决策记录已同步。
- 门禁（2026-10-29 23:19 +08:00）：
  - `vp check` 退出 0（1 条既有 warning，位于 `pstack/scripts/generate-pstack-harness-tree.mjs`，与本轮无关）。
  - `vp test` 退出 0，28 个测试通过（含 `tests/subagent.test.ts` 8 个）。
  - `node pstack/scripts/generate-pstack-harness-tree.mjs --check` 退出 0（`pstack/pstack is up to date.`）。
  - `node pstack/scripts/port-fixes.mjs replay` 退出 0（无 active FIX）。

## 审查证据（review）

- 审查时间：2026-10-29T23:53 +08:00；受审提交：`c1369ed`（port #1 implement，基于 `e0027ef` audit）。审查过程未修改实现与测试。
- 范围：core Issue #1 的 4 条 `required_behavior`，以及 `SET-02`、`SET-06`、`MOD-04`、`PI-02`、`AD-01` 的关联字段；同步 README 审查字段。
- 门禁（2026-10-29 23:53 +08:00，实际退出码）：
  - `vp check` 退出 0（46 个文件格式通过；1 条既有 warning 位于 `pstack/scripts/generate-pstack-harness-tree.mjs:204`，与本轮无关）。
  - `vp test` 退出 0，6 个文件 / 28 个测试通过（含 `tests/subagent.test.ts` 8 个）。
  - `node pstack/scripts/generate-pstack-harness-tree.mjs --check` 退出 0（`pstack/pstack is up to date.`）。
  - `node pstack/scripts/port-fixes.mjs replay` 退出 0（`No active FIX records; replay passed.`）。
- `active` EXT：`docs/extensions.md` 无登记，无可执行验收测试。
- `active` FIX：`docs/port-fixes.yaml` 为 `fixes: []`，replay 通过。

### required_behavior 逐条核对

| required_behavior | 证据 | 结论 |
|---|---|---|
| 新写入和读取路径为 `$DSH_HOME/pstack-models.mdc` | `src/internal/role-manifest.ts:29`（`PSTACK_MODELS_FILENAME = "pstack-models.mdc"`）；`src/internal/role-config.ts:62-64`（`modelsFilePath` 用该常量派生绝对路径）；`src/subagent.ts:363`（委派时按此读取） | 通过 |
| 用户文档、DSH 适配文档、术语表、测试与上游同名 | `README.md:75,98`、`README.zh.md:75,98`、`docs/glossary.md:37-38`、`pstack/harness/docs/harness/dsh.md:34,37,42,46` 及其生成副本 `pstack/pstack/docs/harness/dsh.md`（`generate --check` 退出 0）、`tests/subagent.test.ts:18,129` | 通过 |
| 不迁移旧 `poteto-models.mdc`，旧文件按缺失回退 `inherit-parent` | 代码无旧文件名分支；`tests/subagent.test.ts:114-124` 只写旧文件后断言 `route == inherit` 且诊断含 `has no line`（`src/subagent.ts:392`） | 通过 |
| 格式错误仍按行号报告 | `src/internal/role-config.ts:44-47` 的 issue 带 `line`；`src/subagent.ts:374` 拼 `${rolePath}:${line}: ...`；`tests/subagent.test.ts:126-130` 断言 `/pstack-models\.mdc:1: bug-fix: .* is not a route/` | 通过 |

公共 API：`PSTACK_MODELS_FILENAME` 仅改常量值，`modelsFilePath` 签名与导出不变，`pstack_models` 只改描述文本、工具 schema 不变。权限面不变；`pstack_subagent` 除文件名外行为不变。变更最小，只触 Issue #1 映射的代码、文档与测试。

findings：F-01 复核通过，状态由 `fixed-pending-review` 改为 `closed`；无新增开放 finding。

审查结论：core 需求逐项覆盖，四个门禁全部通过，无开放 finding → `phase: doc`，保持 core blocker。
