# pstack 移植审查报告

- 轮次（round）：baseline
- 上游提交：pstack `1ba91fc25c0977741dd0e267849e6234b037ed0a`（`0.15.36`）；DSH `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`（`0.2.2-alpha.2`）
- 开始时间（started_at）：2026-10-29T20:39:34+08:00

## Findings

| id | origin | status | affected_ext | required_behavior | evidence |
|---|---|---|---|---|---|

## 实现记录

`implement port` 的范围是第 5 节的 `PI-01`～`PI-09`（`PI-04` 已随上游删除 `orch` 退役），加上第 8 节全部非平台排除能力。现有实现已在 pstack `1ba91fc`、DSH `f3803c9` 基线上逐项核对；生产代码沿用 `f1ab4b0`（完成实现并移植 statechart）与 `66a705a`（修复 F-01～F-04）的实现，本轮不需要新增或修改代码。上一轮 F-01～F-04 的修复分别由 `tests/effort.test.ts`、`worktree-audit.test.ts` 与 `statechart.test.ts` 的回归用例覆盖。第 8 节 135 个能力行已按核对结果更新：122 项 `已实现`，13 项 `不适用（平台排除）`。

| 编号 | 覆盖能力 | 实现位置 | 验证用例 |
|---|---|---|---|
| PI-01 | `TOOL-04b`、`SKL-01`、`SKL-02`、`SKL-29` | `src/skill.ts`、`src/internal/skill-provider.ts`、`src/internal/frontmatter.ts` | `tests/skill.test.ts`：隐藏技能按名称加载、相对资源可读且拒绝越界、未知名称报错、非法名称在访问注册表前拒绝 |
| PI-02 | `MOD-01`、`MOD-04`、`MOD-06`、`SET-01`、`SET-02`、`SET-04`、`SET-06` | `src/models.ts`、`src/subagent.ts`、`src/internal/role-config.ts`、`src/internal/role-manifest.ts`、`src/internal/effort.ts` | `tests/models.test.ts`（provider、route、effort 枚举）、`tests/subagent.test.ts`（角色行、面板、缺失回退、格式错误行号）、`tests/effort.test.ts`（schema 与模型选择） |
| PI-03 | `SCR-01`、`PB-21` | `pstack/runtime/skills/poteto-mode/scripts/check-plan.mjs` | `check-plan.test.ts`：围栏、多反引号 code span、DSH tick 兼容与退出码 |
| PI-05 | `SCR-02`、`PB-13`、`PB-14`、`PB-17`、`PB-18` | `pstack/runtime/skills/poteto-mode/scripts/watch-pr/{watch-pr,cli,github,policy,render,types}.ts` | `watch-pr/cli.test.ts`、`github.test.ts`、`policy.test.ts`：三种模式、`--status-only`、JSON 与表格、四种 verdict、超时睡眠上限与 fork head 判定 |
| PI-06 | `SCR-03`、`PB-22` | `pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts` | `worktree-audit.test.ts`：TSV 列、bucket、未知 usage 不判 safe、符号链接目录不遍历 |
| PI-07 | `SCR-04`、`SKL-30`、`PB-04` | `pstack/runtime/skills/show-me-your-work/scripts/log.ts` | `log.test.ts`：header 只写一次、UTC 时间戳、单元格清理、用法错误退出 1 |
| PI-08 | `SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24` | `cordis.patch.yml` 的 `poteto-agent` 与 `comment-sicko` preset、`src/subagent.ts`、`src/internal/effort.ts` | `tests/subagent.test.ts`：agent 到 preset 映射、poteto-agent 注入 `poteto-mode` 绝对路径、comment-sicko 静态移除 `write` 与 `edit`；`tests/effort.test.ts`：运行中改 effort 走 `Agent.model.select` |
| PI-09 | `SCR-05`、`SKL-33` | `pstack/runtime/skills/statechart/scripts/**`（29 个文件、204 KB 发布树，不含上游 corpus） | `statechart.test.ts`：TLA+ 值语法、配置、消息、pipeline、缺 spec 退出 2、fake TLC 的 worker 路径与 `report.md`、`chart.mmd`、`tlc.out` |

`pstack_script` 的五个 id 由 `src/internal/script-registry.ts` 固定；`pstack/scripts/replace-scripts.mjs` 的 `REPLACED` 集合为 `poteto-mode`、`show-me-your-work`、`statechart`，构建时整目录替换上游附带的脚本。

## 上游对照

| 文件组 | 对照结果 |
|---|---|
| `watch-pr/{cli,github,policy,render,types}.ts` | 与 pstack `1ba91fc` 逐字相同；启动器去掉 Bun bootstrap，改为 Node 入口 |
| `statechart/{run,worker,pipeline,ir}.ts`、`backends/**`、`frontends/**`、`passes/**` | 与 pstack `1ba91fc` 逐字相同；`statechart.ts` 只按运行文件扩展选择 `worker.ts` 或 `worker.mjs` |
| `check-plan.mjs` | 只把 `/loop 1h` 检查扩展为接受 `create_goal` 加 `schedule_create` 的 DSH tick；其余检查不变 |
| `worktree-audit.ts`、`log.ts` | Node 等价重写，输入、输出格式与退出码由行为测试固定 |
| `statechart/scripts/test/**` | 按 7.1 的 B 方案不随包发布；入口行为由精选测试覆盖，TLC 端到端留在有 `TLA2TOOLS`、Java、mise 的环境复核 |

## 验证记录

| 检查 | 命令或用例 | 结果 |
|---|---|---|
| 静态检查 | `vp check` | 退出 0；46 个文件格式正确，0 errors；1 个既有 warning：`pstack/scripts/generate-pstack-harness-tree.mjs:204` 的 `require-array-sort-compare` |
| 插件测试 | `vp test` | 退出 0；6 个测试文件、27 个测试通过 |
| 运行时测试 | `cd pstack && vp run test` | 退出 0；76 个测试通过（check-plan、watch-pr、worktree-audit、log、statechart） |
| 构建 | `vp run build` | 退出 0；5/5 任务成功，`dist/runtime` 45 个文件，根发布 12 个文件 |
| 生成树漂移 | `node pstack/scripts/generate-pstack-harness-tree.mjs --check` | 退出 0；`pstack/pstack is up to date.` |
| FIX 重放 | `node pstack/scripts/port-fixes.mjs replay` | 退出 0；`No active FIX records; replay passed.` |
| 发布树 | `dist/pstack/skills/statechart` | 29 个文件、204 KB、0 个 corpus 文件 |
| 脚本入口 | `node dist/pstack/skills/...` 逐个调用 | `check-plan` 无参数退出 2；`log` 无参数退出 1；`statechart` 无参数退出 2；`watch-pr --help` 退出 0；`worktree-audit --help` 退出 0 |

## 范围检查

本轮改动只涉及 `pstack/README.md` 的实现字段与状态说明、`docs/port-review.md` 的实现与验证证据、`docs/port-state.yaml` 的阶段字段。`docs/extensions.md`、`docs/port-fixes.yaml`、`docs/port-fixes-archive.yaml` 无差异；`src/**`、`tests/**`、`pstack/runtime/**`、`pstack/harness/**` 无改动；`pstack/pstack/` 与 `dist/` 只由生成器与构建刷新，没有手写。

## 审查记录（2026-10-29，review port）

- 受审提交：`101654561f3c9c7a8422859fa9f252441dbdd766`（`docs: 记录 pstack port 基线实现与验证`），工作树干净（`git status --porcelain` 无输出）。
- 上游基线：pstack `1ba91fc25c0977741dd0e267849e6234b037ed0a`（`0.15.36`）；DSH `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`（`0.2.2-alpha.2`）。
- 审查范围：`pstack/README.md` 第 2～8 节的全部 135 个能力行；`PI-01`～`PI-09` 的实现与验收；受审文件共 75 个：`src/**`（14）、`tests/**`（6）、`pstack/runtime/**`（45）、`pstack/scripts/*.mjs`（4）、`cordis.patch.yml`、`package.json`、`vite.config.ts`、`pstack/package.json`、`pstack/vite.config.ts`、`pstack/harness/docs/harness/dsh.md`。
- 工作项：本轮没有 core Issue、core EXT、`active` EXT 或 `active` FIX；`docs/extensions.md` 与 `docs/port-fixes.yaml` 没有待验收条目。
- 审查结论：通过，无 open finding。`pstack/README.md` 的 122 个实现项审查列置为 `通过`，13 个平台排除项置为 `通过（平台排除）`；下一阶段为 `doc`。

### 1. 门禁结果

| 检查 | 命令 | 结果 |
|---|---|---|
| 静态检查 | `vp check` | 退出 0；46 个文件格式正确，0 errors；1 个既有 warning：`pstack/scripts/generate-pstack-harness-tree.mjs:204` 的 `require-array-sort-compare` |
| 插件测试 | `vp test` | 退出 0；6 个测试文件、27 tests passed（models、skill、effort、subagent、script、port-fixes） |
| 运行时测试 | `cd pstack && vp run test` | 退出 0；76 tests passed（check-plan、watch-pr、worktree-audit、log、statechart） |
| 构建 | `vp run build` | 退出 0；5/5 tasks successful，`dist/runtime` 45 个文件，根发布 12 个文件 |
| 生成树漂移 | `node pstack/scripts/generate-pstack-harness-tree.mjs --check` | 退出 0；`pstack/pstack is up to date.` |
| FIX 重放 | `node pstack/scripts/port-fixes.mjs replay` | 退出 0；`No active FIX records; replay passed.` |
| 发布树 | `dist/pstack/skills/statechart` | 29 个文件、204 KB、0 个 corpus 文件 |
| 脚本入口 | 五个 `pstack_script` id 逐个调用 | `check-plan` 无参数退出 2；`log` 无参数退出 1；`statechart` 无参数退出 2；`watch-pr --help` 退出 0；`worktree-audit --help` 退出 0；与脚本契约一致 |
| 技能索引 | 加载 `dist/index.mjs` 的 `loadBundledSkillIndexes(SKILL_ROOTS)` | 63 个技能加载成功；含隐藏技能 `how` 与 `poteto-mode` |
| 证据链接 | 扫描 `pstack/README.md` 的全部相对链接 | 315 条链接全部存在，`#L` 行号范围均在目标文件内 |

### 2. 能力行逐项核对

`pstack/README.md` 第 2～4 节共 135 个原子能力，第 8 节逐行复核结论如下：

| 范围 | 数量 | 核对结果 |
|---|---:|---|
| 映射层 | 47（完整 44、部分 3） | 上游名称、字段或路径均有 DSH 对应项；3 个部分项记录语义差异，审查通过 |
| 标准模式 | 72（完整 18、部分 54） | 18 个完整项由标准工具和随包技能正文承载；54 个部分项的缺口全部指向第 3.4 节 G-01～G-15，审查通过 |
| 可选插件 | 3（完整 1、部分 2） | `OPT-01`～`OPT-09` 的插件 ID、默认状态、实验性和降级路径与 DSH 当前提交一致，审查通过 |
| 平台排除 | 13 | `AUT-01`～`AUT-06`、`EXCL-01`～`EXCL-06`、`SKL-31` 按上游 `Cursor-only features` 基线复核，审查通过（平台排除） |

生成树核对：`pstack/pstack/skills` 下 58 个 `SKILL.md`、23 个 playbook、24 个 principle 与第 2.7～2.9 节的编号一一对应；`pstack/pstack/docs/harness/dsh.md` 存在。第 3.1 节的覆盖统计与第 8 节状态表一致。

### 3. PI-01～PI-09 实现核对

| 编号 | 实现位置 | 验证 |
|---|---|---|
| PI-01 | `src/skill.ts`、`src/internal/skill-provider.ts`、`src/internal/frontmatter.ts` | `tests/skill.test.ts` 4 tests：隐藏技能按名称加载、相对资源可读且拒绝越界、未知名称报错、非法名称在访问注册表前拒绝 |
| PI-02 | `src/models.ts`、`src/subagent.ts`、`src/internal/role-config.ts`、`src/internal/role-manifest.ts`、`src/internal/effort.ts` | `tests/models.test.ts` 2 tests、`tests/subagent.test.ts` 7 tests、`tests/effort.test.ts` 3 tests：provider/route/effort、角色行与面板、缺失回退、格式错误行号、运行中改 effort |
| PI-03 | `pstack/runtime/skills/poteto-mode/scripts/check-plan.mjs` | `check-plan.test.ts` 通过（包含围栏、多反引号 code span、DSH tick 与退出码），属于 76 tests |
| PI-05 | `pstack/runtime/skills/poteto-mode/scripts/watch-pr/{watch-pr,cli,github,policy,render,types}.ts` | `watch-pr/cli.test.ts`、`github.test.ts`、`policy.test.ts` 通过：三种模式、`--status-only`、JSON 与表格、四种 verdict、超时睡眠上限与 fork head 判定 |
| PI-06 | `pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts` | `worktree-audit.test.ts` 通过：TSV 列、bucket、未知 usage 不判 safe、符号链接目录不遍历 |
| PI-07 | `pstack/runtime/skills/show-me-your-work/scripts/log.ts` | `log.test.ts` 通过：header 只写一次、UTC 时间戳、单元格清理、用法错误退出 1 |
| PI-08 | `cordis.patch.yml` 的 `poteto-agent` 与 `comment-sicko` preset、`src/subagent.ts`、`src/internal/effort.ts` | `tests/subagent.test.ts`：agent 到 preset 映射、poteto-agent 注入 `poteto-mode` 绝对路径、comment-sicko 静态移除 `write` 与 `edit`；`tests/effort.test.ts`：运行中改 effort 走 `Agent.model.select` |
| PI-09 | `pstack/runtime/skills/statechart/scripts/**`（29 个文件、204 KB 发布树，不含上游 corpus） | `statechart.test.ts` 7 tests：TLA+ 值语法、配置、消息、pipeline、缺 spec 退出 2、fake TLC 的 worker 路径与 `report.md`、`chart.mmd`、`tlc.out` |

`pstack_script` 的五个 id 与 `src/internal/script-registry.ts` 的 `SCRIPT_ENTRIES` 一致；`pstack/scripts/replace-scripts.mjs` 的 `REPLACED` 集合为 `poteto-mode`、`show-me-your-work`、`statechart`，构建时整目录替换上游附带脚本。

### 4. 公共 API、权限、最小性与共享影响

- **公共 API**：`package.json` 的公开入口为 `.`、`./models`、`./script`、`./skill`、`./subagent` 与 `./locale/*.json`，由 `vite.config.ts` 的 `pack.exports` 生成，没有手写漂移。`src/internal/host-contract.ts` 只从 `@deepseek-ai/*` 导入类型，`vp check` 的类型检查按 DSH `f3803c9` 通过。
- **权限**：`pstack_script` 直接 `spawn` 随包 Node 脚本，不经过 bash 审批与文件系统沙箱；该代价已由 `docs/decisions/2026-10-28-pstack-plugin-tools.md` 接受并在工具描述中写明。`comment-sicko` 的 `dsh-tool-fs` 关闭 `write`/`edit`；`pstack_skill` 拒绝绝对路径与 `../` 越界；`pstack_subagent` 的 `cwd` 仅允许会话目录内或带 `.git` 的独立工作树。
- **最小性**：`src/**` 14 个文件均有消费者或验收依据；`pstack/runtime` 只替换 `poteto-mode`、`show-me-your-work`、`statechart` 三组脚本；没有新增公开入口或依赖。`pstack/README.md` 的 `PI-04 orch` 已按上游 `1ba91fc` 删除事实退役。
- **共享影响**：本轮没有修改 `src/**`、`tests/**`、`pstack/runtime/**` 或 `pstack/harness/**`；`generate --check` 证明 `pstack/pstack/` 与生成器期望一致；`docs/extensions.md`、`docs/port-fixes.yaml`、`docs/port-fixes-archive.yaml` 无差异。

### 5. 非阻断观察

以下不影响本轮能力验收，留给后续维护处理：

| 编号 | 位置 | 观察 |
|---|---|---|
| C-01 | `src/internal/role-config.ts:2` | 文件头注释写 `$DSH_HOME/pstack-models.md`，实际文件名是 `poteto-models.mdc`（见 `docs/glossary.md`）。 |
| C-02 | `src/internal/paths.ts:38,60-62` | `AGENTS_ROOT` 与 `agentPreamblePath` 没有消费者。 |
| C-03 | `pstack/scripts/generate-pstack-harness-tree.mjs:204` | `.sort()` 缺少 compare，保留 `vp check` 的既有 warning。 |
| C-04 | `src/internal/host-contract.ts:18,66` | `LlmCallConfig` 类型导入与 re-export 没有消费者。 |
| C-05 | `src/internal/host-contract.ts:2` | 注释写 DSH `0.2.1-rc.3`，`package.json` 的 `engines.dsh` 是 `0.2.2-alpha.2`。 |

### 6. 结论

本轮全部 `active` EXT 的验收测试与全部 `active` FIX 的 replay 均通过；`pstack/README.md` 的 135 个能力行逐项核对无阻断项；没有 `open`、`reopened`、`fixed-pending-review` 或 `blocked` finding。`docs/port-state.yaml` 的 `phase` 置为 `doc`，下一步执行 `/pstack-port doc`。
