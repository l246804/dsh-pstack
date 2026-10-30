# pstack 移植审查报告

- 轮次（round）：`baseline`
- 上游提交：pstack `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe`（`0.15.36`）；DSH `ce7073d51254c26cd63b22a60835b8f948deb447`（`0.2.2-alpha.2`）
- 开始时间（started_at）：2026-10-30T11:56:52+08:00

## findings

（空）

## 实现记录

`implement port` 的范围是 `pstack/README.md` 第 5 节的 `PI-01`～`PI-09`（`PI-04` 已随上游 `1ba91fc` 删除 `orch.ts` 与 `store.ts` 退役），以及 `docs/port-fixes.yaml` 中 `status: active` 的 FIX。本轮没有 active FIX；8 个插件内实现项逐项读取现有实现后全部记为「保留」，生产代码沿用上一轮已通过审查的实现，本轮没有新增、修改或删除代码。

保留的依据有两点：`docs/port-prepare.md` 已确认 pstack 子树在 `1ba91fc..4dd1d05` 间无文件差异（树哈希同为 `4719e1c`）；DSH `f3803c9..ce7073d` 对插件实际绑定并使用的 `ctx.skills.get()`、`ctx.llm`、`ctx.subagents.startActivation`、`ctx.tools.register`、`ctx.jobs.start` 公共签名没有破坏性变化，`vp check` 的类型检查通过。没有出现需要改动 `src/**`、`tests/**`、`pstack/runtime/**` 或 `pstack/harness/**` 的新需求。

| 编号 | 覆盖能力 | 实现位置 | 验证用例 |
|---|---|---|---|
| PI-01 | `TOOL-04b`、`SKL-01`、`SKL-02`、`SKL-29` | `src/skill.ts`、`src/internal/skill-provider.ts`、`src/internal/frontmatter.ts` | `tests/skill.test.ts`：隐藏技能按名称加载、相对资源可读且拒绝越界、未知名称报错、非法名称在访问注册表前拒绝 |
| PI-02 | `MOD-01`、`MOD-04`、`MOD-06`、`SET-01`、`SET-02`、`SET-04`、`SET-06` | `src/models.ts`、`src/subagent.ts`、`src/internal/role-config.ts`、`src/internal/role-manifest.ts`、`src/internal/effort.ts` | `tests/models.test.ts`（provider、route、effort 枚举）、`tests/subagent.test.ts`（角色行、自动面板、`roleIndex`、缺失回退、旧文件名忽略、格式错误行号）、`tests/effort.test.ts`（effort schema 与模型选择） |
| PI-03 | `SCR-01`、`PB-21` | `pstack/runtime/skills/poteto-mode/scripts/check-plan.mjs` | `check-plan.test.ts`：H1、How to read this、Program checklist、五个 program H3、10 lanes、perf 四项、review gate、appendix 与退出码 1/2 |
| PI-05 | `SCR-02`、`PB-13`、`PB-14`、`PB-17`、`PB-18` | `pstack/runtime/skills/poteto-mode/scripts/watch-pr/{watch-pr,cli,github,policy,render,types}.ts` | `watch-pr/cli.test.ts`、`github.test.ts`、`policy.test.ts`：single、stack、queued-stack、`--status-only`、JSON 与 pretty、四种 verdict、退出码与 `gh` 读取 |
| PI-06 | `SCR-03`、`PB-22` | `pstack/runtime/skills/poteto-mode/scripts/worktree-audit.ts` | `worktree-audit.test.ts`：TSV 列、base 解析、bucket 分类、未知 usage 不判 safe、符号链接目录不遍历 |
| PI-07 | `SCR-04`、`SKL-30`、`PB-04` | `pstack/runtime/skills/show-me-your-work/scripts/log.ts` | `log.test.ts`：header 只写一次、UTC 时间戳、tab 与换行清理、公式前缀转义、用法错误退出 1 |
| PI-08 | `SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24` | `cordis.patch.yml` 的 `poteto-agent` 与 `comment-sicko` preset、`src/subagent.ts`、`src/internal/effort.ts` | `tests/subagent.test.ts`：agent 到 preset 映射、poteto-agent 注入 `poteto-mode` 绝对路径、comment-sicko 静态移除 `write` 与 `edit`、普通子代理行为不变；`tests/effort.test.ts`：运行中改 effort 走 `Agent.model.select` |
| PI-09 | `SCR-05`、`SKL-33` | `pstack/runtime/skills/statechart/scripts/**`（源码 26 个文件，随包不含上游 corpus） | `statechart.test.ts`：TLA+ 值语法、配置、消息、pipeline、缺 spec 退出 2、fake TLC 的 worker 路径与 `report.md`、`chart.mmd`、`tlc.out`、`tlc-RULE.out` 输出 |

`pstack_script` 的五个 id 由 `src/internal/script-registry.ts` 固定为 `check-plan`、`watch-pr`、`worktree-audit`、`log`、`statechart`；`pstack/scripts/replace-scripts.mjs` 的 `REPLACED` 集合为 `poteto-mode`、`show-me-your-work`、`statechart`，构建时整目录替换上游附带的脚本。

### 公共接口与权限边界

| 工具 | 公共接口 | 权限与副作用 |
|---|---|---|
| `pstack_skill` | `ctx.skills.get(name)`；只读 `SKILL.md` 与技能目录内的相对资源 | 只读；资源路径经过绝对路径与 `../` 越界检查；不进入宿主文件系统写入 |
| `pstack_models` | `ctx.llm.listProviders()`、`listModels()`、`resolveModelInfo()` | 只读；不写文件，不推断 live adapter 未报告的 route |
| `pstack_subagent` | `ctx.subagents.startActivation`，preset 由 `cordis.patch.yml` 声明 | 每次委派重读 `$DSH_HOME/pstack-models.mdc`；启动前统一校验 route 与 effort；`comment-sicko` 的写工具由 preset 静态移除 |
| `pstack_script` | `src/internal/script-registry.ts` 的封闭 id 集合 | 用 `process.execPath` 启动随包脚本；不经过 bash 审批与文件系统沙箱是 AD-01 已接受的代价 |

### 上游对照

| 文件组 | 对照结果 |
|---|---|
| `watch-pr/{cli,github,policy,render,types}.ts` | 与 pstack `4dd1d05` 逐字相同；`watch-pr` 启动器去掉 Bun bootstrap，改为 Node 入口 |
| `statechart/{run,worker,pipeline,ir}.ts`、`backends/**`、`frontends/**`、`passes/**` | 与 pstack `4dd1d05` 逐字相同；`statechart.ts` 只按运行文件扩展选择 `worker.ts` 或 `worker.mjs` |
| `check-plan.mjs` | 只把 `/loop 1h` 检查扩展为 `/loop 1h` 或 `create_goal` 加 `schedule_create` 的 DSH tick；其余检查不变 |
| `worktree-audit.ts`、`log.ts` | Node 等价重写，输入、输出格式与退出码由行为测试固定 |
| `statechart/scripts/test/**` | 按 7.1 的 B 方案不随包发布；入口行为由精选测试覆盖，TLC 端到端留在有 `TLA2TOOLS`、Java、mise 的环境复核 |

## 验证记录

| 检查 | 命令或用例 | 退出码 | 结果 |
|---|---|---|---|
| 静态检查 | `vp check` | 0 | 49 个文件格式正确；0 errors；1 个既有 warning：`pstack/scripts/generate-pstack-harness-tree.mjs:204` 的 `require-array-sort-compare` |
| 插件测试 | `vp test` | 0 | 7 个测试文件、39 个测试通过 |
| 运行时测试 | `vp run @internal/pstack#test` | 0 | 12 个 suite、76 个测试通过、0 失败 |
| 构建 | `vp run build` | 0 | 5/5 任务成功；根发布产出 12 个文件，`replace:scripts: replaced 3 skill script directories` |
| 生成树漂移 | `node pstack/scripts/generate-pstack-harness-tree.mjs --check` | 0 | `pstack/pstack is up to date.` |
| 适配文档对账 | `node pstack/scripts/check-harness-doc.mjs` | 0 | `harness doc is consistent with README, the upstream template, and src.` |
| FIX 重放 | `node pstack/scripts/port-fixes.mjs replay` | 0 | `No active FIX records; replay passed.` |
| 脚本入口 | 五个随包入口逐个调用 | 0/1/2 | `check-plan` 无参数 2、`watch-pr --help` 0、`worktree-audit --help` 0、`log` 无参数 1、`statechart` 无参数 2，符合各脚本契约 |
| 技能索引 | `node -e` 加载 `dist/index.mjs` 的 `loadBundledSkillIndexes(SKILL_ROOTS)` | 0 | 63 个技能加载成功，其中 60 个为隐藏技能，`pstack_skill` 可按名称路由 |

## 范围检查

本轮改动只涉及 `pstack/README.md` 的实现说明、`docs/port-review.md` 的实现与验证证据、`docs/port-state.yaml` 的阶段字段。`docs/extensions.md`、`docs/port-fixes.yaml`、`docs/port-fixes-archive.yaml` 无差异；`src/**`、`tests/**`、`pstack/runtime/**`、`pstack/harness/**` 无改动；`pstack/pstack/` 与 `dist/` 只由生成器与构建刷新，没有手写。`git diff --name-only` 仅列出上述三个文件。

## 未解决限制

无新增未解决限制。`pstack/README.md` §9.3 的 `U-01` 至 `U-06` 保持原样：视频录制工具链、headless `ask_user_question` 回答者、子代理 transcript 覆盖、浏览器截图证据、连续工作树创建、宿主外部命令可用性仍按「当前提交未证实」处理，不在本轮实现范围内。
