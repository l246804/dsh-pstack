# 发布验收清单：未验证的实机与行为级用例

本文件是发布说明素材，不是支持声明。README 的"功能范围与已知限制"写能力边界，这里写验证进度。两者不互相替代。

为什么分成两步，见 [发布验收分期](decisions/2026-10-25-release-verification-staging.md)。静态检查、`check:assets` 和单元测试通过，都不构成本文件任何一行用例的证据。

单元 1 至 7 交付时（commit `6dedbf7`）的状态：静态门全绿，13 个测试文件 307 个用例通过，随包脚本改为零安装的 Node 产物后 5 个测试文件 68 个上游用例仍在副本上通过。这是那一刻的快照，不是当前数字——当前规模见 `pnpm run test` 的实际输出。下列 36 条用例一条都没有执行，原因分三类：

- **需要真实模型调用。** 任何要求 route、effort、child 实际请求头或 panel 结果的用例。
- **需要真实宿主进程。** goal 的 armed/disarmed 边沿、reminder 投递、后台 job 的 settlement 通知、宿主重启后的状态。
- **需要真实外部状态。** PR、CI、forge 读取、真实 trace、真实图像比较。

## 前置：一次性 profile 与本地构建

复现命令的安装步骤一律是**本地构建 + 工作区目录链接安装到一次性 profile**，从 registry 安装线上版本的写法不适用：线上版本不可修改，而待验证的是当前 checkout。链接安装的解析行为与 [自包含技能 provider 决策](decisions/2026-10-25-self-contained-skill-provider.md)记录的开发安装一致。

```bash
# 1. 在 checkout 内构建，确认生成树不漂移
pnpm install
pnpm run build                # runtime/ → assets/ → dist/，一条链写完
pnpm run release              # check 全家 + 重新打包 + 打包清单自检（含条目数）

# 2. 建一次性 profile，并把工作区目录链接安装进去
dsh plugin --profile pstack-verify add <absolute path to this checkout>

# 3. 记录环境
node --version
```

注意三点。

第一，第 2 步已在 rc.3 上实测确认，不再是待核实的写法。`dsh plugin --profile <name> <args...>` 把参数**原样转发给该 profile 目录里的 pnpm**（`dsh plugin --help` 原文：`args — pnpm arguments, forwarded verbatim`），profile 不存在时先按模板初始化，然后执行转发的命令。因此：

- `dsh plugin add <spec>` 等价于在该 profile 目录里跑 `pnpm add <spec>`；
- **不存在 `dsh plugin add --help` 这个子命令**：`--help` 会被当成要安装的包名交给 pnpm。本条目前一版让执行者"以 `dsh plugin add --help` 的实际输出为准"，那个探查方式本身是错的，已改掉；
- 顺带确认了一处会误导的报错来源：`dsh --profile <不存在的名字> --dump-config` 会报 `profile "x" does not exist; create it with 'dsh plugin --profile x add <package>'`。这条信息里的命令是宿主自己给出的，与本文第 2 步一致，可以作为交叉验证；
- 安装完成后 `dsh plugin` 会重写 profile 的 `package.json`，把新依赖里**声明了 `dsh.bundle`** 的包追加进 `dsh.profile.bundles`（`reconcile()` 的行为），不需要手工改 bundles。本包的 `package.json` 有 `dsh.bundle.patch`，所以链接安装后应当自动成为一层。**安装后务必立刻核对**：

```bash
node -e 'const p=require(process.argv[1]);console.log(p.dsh?.profile?.bundles)' \
  "$HOME/.dsh/profiles/pstack-verify/package.json"
# 期望输出里包含 dsh-pstack；若没有，说明这个 spec 没被当成 bundle，需要记下差异
```

第二，随包脚本已是单文件 Node 产物，依赖全部内联，不再有 `bootstrap.ts`、包内 `package.json` 或 `bun.lock`，因此**不需要安装步骤，也不需要 Bun 或 bash**；脚本冒烟只在受控副本里跑，不要在待发布的生产树里跑。

第三，条目数不再手抄。`pnpm run check:pack` 从生成器、`dist/`、`locale/`、`static/` 和根文件推导出应有集合，再与 `pnpm pack --dry-run --json` 的实际条目逐条比对，并按五栏打印：`assets`、`dist`、`locale`、`static`、`root`。基线变化时先看是哪一栏变了，再决定是否要改东西——不要改数字。当前实测输出见该命令的 `entries` 一行。

```bash
# 零安装脚本门：复制 assets/skills/、隔离 HOME/TMPDIR/XDG_CACHE_HOME、
# node --test 跑全部随包测试，再对五个 CLI 各做一次冒烟。
pnpm run check:scripts

# 单独跑某一个脚本（不需要 bun、bash 或安装）
node assets/skills/poteto-mode/scripts/watch-pr/watch-pr.mjs --help
node assets/skills/poteto-mode/scripts/worktree-audit.mjs --help
```

如果要在一次性 profile 内验证模型侧入口，用 `pstack_script` 工具（`id` 取脚本名），不要拼 shell 命令：它的 `id` 是固定枚举，用宿主的 `process.execPath` 启动产物，Desktop 下自动附加 `ELECTRON_RUN_AS_NODE=1`。

## 前置：不启动也能做的装配核对

启动之前先跑这一步。它不需要模型、不需要凭据，能在几十秒内把"六个行有没有进去、行 id 对不对"这类装配问题定位掉，避免带着错误的组合去跑 36 条用例。

**前提：profile 必须已经存在。** `--dump-config` 对不存在的 profile 直接报错退出（`profile "x" does not exist; create it with 'dsh plugin --profile x add <package>'`），所以这一步排在第 1 步安装之后，不能拿它做第 0 步的预检。

```bash
# 组合树（三者的差别只在叠加层次）
dsh --profile pstack-verify --dump-config           # profile 层 + --patch 覆盖层
dsh --profile pstack-verify --dump-default-config   # 只有模板层，不含用户层
dsh --profile pstack-verify --dump-config-schema    # 条目的 JSON Schema，不挂载
```

`--dump-config` 用的是与启动同一套 `applyEntryPatches` 语义，`cordis-plugin-include` 对该函数的注释原文是"`dsh --dump-config` so a dump can never drift from what boots"（挂载与离线 dump 共用这一个实现）。所以它能作为装配证据，而不是第二套实现。

核对三项：

1. `pstack`、`pstack-subagent`、`pstack-worktree`、`pstack-tool-worktree`、`pstack-history`、`pstack-script` 六个行 id 都在；
2. 两个 worktree 行的 `disabled` 求值结果符合预期（profile 里没有官方 worktree 行时应为启用）；
3. 与设计 §3.3 的行清单一致——不一致时改设计文档或补记录，不要照抄过期清单。

这一步**不能**替代 worktree 四路径用例：`disabled` 是逐次求值的，dump 只能证明"此刻的求值结果"，不能证明"跟着组合变化"。后者仍然只能在真实启动与重载中观察。

每条用例的记录字段固定为四项：**真实输入**、**可观察结果**、**与设计 §12.4 通过条件的差异**、**未覆盖项**。只有四项都填了，用例才可以改状态。

## 单元 3：角色与委派

| 用例 | 复现命令 | 未验证原因 |
|---|---|---|
| S09 `/setup-pstack` | 在一次性 profile 内运行 `/setup-pstack`，写入只含已确认模型的 `$DSH_HOME/pstack-models.md`，然后重复运行一次，再发起一次 `pstack_subagent` 调用（`role` 取 `how explorer`） | 需要真实对话与真实 delegation：确认重复执行保留用户选择、清理 retired role、下一次 delegation 读到新值，全部依赖真实工具调用 |

## 单元 4：核心工作流

以下用例都用同一个一次性仓库：一个能跑起来的应用或 CLI、一个会失败的复现步骤、一个可用的 forge fake 或本地 bare repo。

| 用例 | 复现命令 | 未验证原因 |
|---|---|---|
| B01 `investigation` | `/poteto-mode why does <X> behave this way? repro first, don't change code.` | 需要真实 how/why child 与真实证据报告 |
| B02 `bug-fix` | `/poteto-mode <defect> repros. write the failing check first, then fix.` | 需要真实红/绿证据与 git 历史先后 |
| B03 `perf-issue` | `/poteto-mode <slow path> is slow. baseline first, then fix against it.` | 需要真实 profiler 与两次 trace artifact |
| B05 `runtime-forensics` | `/poteto-mode <symptom> happens while the app runs. instrument it.` | 需要运行中进程的 CPU/heap/CDP artifact |
| B06 `trace-forensics` | `/poteto-mode here is a cpuprofile. what is slow and where in the source?` | 需要真实 artifact 与符号信息 |
| B07 `feature` | `/poteto-mode add <feature>. all four throughput items, keep n/a where it applies.` | 需要真实 `poteto-agent` 实现与 review separation |
| B08 `refactoring` | `/poteto-mode rename <api> and migrate every caller.` | 需要真实 pin 测试与等价比较 |
| B09 `prototype` | `/poteto-mode prototype two layouts for <screen> and pick one.` | 需要真实截图或行为比较 |
| B11 `authoring-a-skill` | `/poteto-mode write a skill for <workflow>` | 结构检查可静态跑，但 frontmatter/链接/结构之外的"有效"判断要用户评审 |
| B23 `opening-a-pr` | `/poteto-mode commit this, run no-comments, reread the diff, open a PR.` | 需要一次性仓库与统一 forge，且不能碰真实 PR |
| S01 `/how` | `/how how does <flow> work?` | 需要真实 explorer 并发与 explainer 汇总 |
| S02 `/why` | `/why why is <value> set to <n>?` | 需要真实 Sources Consulted 与可复核引用 |
| S03 `/arena` | `/arena two approaches to <brief>` | 需要两条真实 route 的 runner 与 judge 实际请求头 |
| S04 `/architect` | `/architect settle types for <module>` | 需要真实 `architect runners` 与两个结构不同的候选 |
| S05 `/swarm` | `/swarm audit these 6 slices` | 需要真实 slice child，且缺 SHA/方法的报告要重试一次 |
| S06 `/interrogate` | `/interrogate this diff` | 需要每条 reviewer entry 对应真实 route；同 route 只能标同模型复核 |
| S07 `/no-comments` | `/no-comments this diff` | 需要真实 `comment-sicko` child 与一次拒绝后的重跑 |
| S08 `/figure-it-out` | `/figure-it-out migrate <component> off <dep>` | 需要真实逐单元实验与 VERIFIED / NOT VERIFIED / INCONCLUSIVE 分流 |

### worktree 条件挂载的四条路径

| 路径 | 复现命令 | 未验证原因 |
|---|---|---|
| 1 未启用时自动挂载 | 在一次性 profile 内不预置 worktree 行，安装本包后读取组合行与 `worktrees` 服务 | 需要真实 profile 的组合结果；单元测试只覆盖守卫表达式的判定语义 |
| 2 已启用时不重复挂载 | 先启用官方 worktree bundle，再安装本包，确认 `service "worktrees" has been registered` 不出现 | 同上；重复挂载的失败形态是启动期报错，只能在真实启动中观察 |
| 3 禁用后重新启用 | 禁用官方 worktree 行再重载，确认本包两行接管；恢复后再确认不重复 | 需要真实配置重载，`disabled` 的逐次求值无法在单测里证明"跟着组合走" |
| 4 升级路径 | 对已装 profile 升级到新 checkout，确认行 id 与守卫不变、服务仍只提供一次 | 需要真实升级流程 |

### 跨工具主链路的实机断言

下面四条对应 2026-10-26 的 P1 修复。它们各自都有单测与静态门，但**每一条的失败形态都只在真实装配下出现**，因此必须在这里单独记录，不能用单测绿灯代替。编号用 T 前缀，不并入上面的 B/S 用例集（那 36 条按 §12.4 定义，不增不减）。

| 用例 | 复现命令 | 未验证原因 |
|---|---|---|
| T01 六行全部注册 | 一次性 profile 启动后，确认 `pstack`、`pstack-subagent`、`pstack-worktree`、`pstack-tool-worktree`、`pstack-history`、`pstack-script` 六个行都挂载 | 单测用 `ResolvingInclude` 映射模块名，真实 profile 走 pnpm 安装后的包解析；`pstack-script` 曾因缺 `export const inject` 在**任何** profile 都不注册 |
| T02 无 `sessionQuery` 时历史工具仍在 | 装一个不含 sessionQuery 服务的组合，确认 `pstack_history` **仍出现在工具表**且调用返回 `kind: "unavailable"`、`code: "service-unavailable"` | 声明为硬依赖时 Cordis 让整行 inert，工具根本不存在，模型看到的是"没有这个工具"而不是"本 profile 不可用"；只有真实组合能证伪 |
| T03 `pstack_script` 落在会话目录 | 在该工具上用相对路径跑 `id: "log"`，确认 TSV 落在**会话当前目录**（含 worktree 会话） | 省略 `cwd` 时曾继承 Host 进程目录；单测覆盖了 `resolveWorkingDirectory`，但"会话目录是什么"由宿主 `workingDirectory.ensure` 决定，只能实机观察 |
| T04 后台启动失败不谎报 | 让 `background: true` 跑一个不存在的解释器（或删掉目标产物），确认调用**抛错**而不是返回 `status: "running"` | 三次实现都错过：固定 250ms 窗口、单 microtask 都观察不到异步 ENOENT。现为 `spawn`/`error` 事件竞争，但仍需在宿主的真实 jobs 服务下确认 `jobs.start` 同步调用 `run` 这一前提成立 |

### 推理档位覆盖与自调

三条对应[动态推理档位决策](decisions/2026-10-26-dynamic-reasoning-effort.md)。共同点是**必须在真实 request header 上观察**：单测用 fake `LlmCallConfig` 断言 waterfall 返回了什么，但"这个值真的进了发给 provider 的请求头"只有真实 adapter 能证明。任一条未通过，就该把该能力从"已恢复"改回"未验证"，并在本文件写明失败形态。

| 用例 | 复现命令 | 未验证原因 |
|---|---|---|
| E01 覆盖值进第一次请求头 | 角色行写 `[xhigh]`（或部署广告的任一档位），调用 `pstack_subagent` 传 `reasoningEffort` 为**另一个**该模型广告的档位；在 child 会话里读第一次 `request/header` 事件的 `config.reasoningEffort` | 期望是被覆盖的值，不是角色行的值。单测只覆盖到 `agentOptions` 与 `startActivation` 入参，未证明宿主把它原样写进请求头 |
| E02 单个 entry 不符时整体不启动 | 配置 `arena runners` 两个 entry，第 2 个模型广告列表不含被传值；确认调用**抛错**且两个 child 都**没有**出现在 `list_agents` | 期望"整次失败，一个都不启动"。单测用 fake registry 断言 `starts` 为空，但真实 `startActivation` 之前有无其他副作用只能实机看 |
| E03 自调改下一次而非在飞行中 | 让 child 第一步做长任务，第二步调 `set_reasoning_effort` 换档；对比第一、二步 `request/header` 的 `config.reasoningEffort`，并确认第一步已发出的请求头没被改写 | 期望第二次是新值、第一次保持原值。waterfall 在 `await next()` 之后替换，语义上不改写已构造的请求，但"已构造"与"已发出"的边界需要真实时序确认 |


## 单元 5：会话历史与相关技能

| 用例 | 复现命令 | 未验证原因 |
|---|---|---|
| B12 `eval` | `/poteto-mode eval this skill change. same task for both variants, candidates stay blind.` | 需要真实候选、真实判分与"候选实际读过哪些文件"的事件证据 |
| B19 `session-pickup` | `/poteto-mode take over this branch` | 需要真实授权 session id 或分支；cloud URL 形式应被拒绝 |
| B22 `worktree-cleanup` | `/poteto-mode what's using my disk?` | 需要真实 worktree/simulator 状态与用户对 WIP 的决定 |
| S10 `/show-me-your-work` | `/show-me-your-work audit the run that started at <id>` | 需要真实事件序列与可解析的证据指针 |
| S11 `/create-verification-skill` | `/create-verification-skill` | 需要真实样例项目的 launch/doctor/drive/cleanup 与证据存活检查 |
| S12 `/eval` | `/eval <skill change>`，与 B12 同一次运行 | 与 B12 共用一次运行，但按 §12.4 单独记录：要证明候选读过要求的文件，而不只看回答 |
| S13 `/typescript-best-practices` | `/typescript-best-practices` | 只需能显式加载并读取 patterns；`paths` 自动触发标为不支持，不得写成已支持 |

## 单元 6：长任务与复杂 playbook

| 用例 | 复现命令 | 未验证原因 |
|---|---|---|
| B04 `hillclimb` | `/poteto-mode improve <metric> by 50%, at least 10 iterations.` | 需要真实冻结测量与逐轮敏感性证明 |
| B10 `visual-parity` | `/poteto-mode match <screen> pixel for pixel against <baseline>.` | 需要真实图像比较能力；缺截图能力时不得判通过 |
| B13 `babysit` | `/poteto-mode babysit this pr`，先在 `check` 模式，再在可启动 `watch-pr` 时试 `drive` | 需要真实 forge 与后台 watcher 的 settlement 唤醒 |
| B14 `shipping` | `/poteto-mode land the stack` | 需要真实 PR 栈、独立 verifier 与 patch-id 比对 |
| B15 `autonomous-run` | `/poteto-mode run until <checkable predicate> holds.` | 需要真实 goal 的 armed/disarmed 与真实 continuation |
| B16 `orchestrate` | `/poteto-mode own this migration until it lands.` | 需要 Bun、`orch` CLI、深度 2 与 inbox/ledger 全链路 |
| B17 `autopilot-full` | `/poteto-mode full autopilot on this queue` | 需要真实队列、每 owner 独立 worktree 与 hold 停止写入 |
| B18 `autopilot-stack` | `/poteto-mode stack them, don't ship` | 需要真实 base-chain 与链尾冻结 |
| B20 `pause-safely` | `/poteto-mode pause safely` | 需要真实 WIP commit、resume note 与恢复后的下一步 |
| B21 `multi-phase-plan` | `/poteto-mode plan this migration` | `check-plan` 可在受控副本跑，但模板被执行仍需真实运行 |

## 环境与工具矩阵

| 项 | 现状 | 未验证原因 |
|---|---|---|
| Node | 脚本产物与随包测试在 Node 24.22.1 上通过；产物 target 为 `node22`，与 `engines.node >=22.19` 一致 | 没有版本矩阵，只有一个版本；Node 22.19 实机未跑 |
| Bun / bash | 已不再是运行依赖：5 个随包 CLI 与 5 个随包测试包（共 10 个产物）均不引用 `bun:`、不调用 bash、不安装任何包 | 无（这是架构约束，不是待验证项） |
| Electron / Desktop | `pstack_script` 的 Electron 分支有单测覆盖（附加 `ELECTRON_RUN_AS_NODE=1`），普通 Node 分支不附加 | 未在真实 Desktop 应用内执行，仅单测与本机普通 Node 实跑 |
| 平台 | Linux 与 macOS 为主要目标 | 未在 Windows 或 macOS 实机跑过 |
| profiler | 只有正文里的工具名 | 未在本机实际采集与解析 |
| 图像比较 | 只有正文里的判定纪律 | 未实际运行 diff 工具 |

## 备注

- 执行中出现与设计文档冲突的结果时，先记录实际观察，再新写一条决策记录取代相关约定，不改文档来迁就结果。
- S12 与 B12 共用一次运行，但各自记录一条，因此用例表 36 行对应 36 个用例 ID（B01–B23 共 23 条，S01–S13 共 13 条），与设计 §12.4 的编号集合逐一相等（2026-10-26 核对：两侧差集均为空）。
- 本清单共有五张记录表，各自的计数口径不同，不要相加：**B/S 用例 36 条**（§12.4 定义的验收样例）、**worktree 路径 4 条**、**T 用例 4 条**（跨工具主链路，按修复引入，不属于 §12.4）、**E 用例 3 条**（推理档位覆盖与自调，按能力恢复引入，不属于 §12.4）、**环境矩阵 6 项**（约束与缺口，不是用例）。
- 本文件此前三处数字有误，2026-10-26 一并更正：`pnpm pack` 基线 173 → 166（实测，且拆出五部分构成）；"40 条用例" → 36 条（该数字自 `f4e8cd1` 起就与表格行数不符，一路抄了下来）；"六个脚本" → 5 个 CLI + 5 个测试包。凡再改这些数字，请附上产生它的命令。此后条目数改由 `pnpm run check:pack` 现场推导，本文不再写死基线，见[构建与校验命令决策](decisions/2026-10-26-build-and-check-commands.md)。
- 执行者第一次跑时若发现命令形式与本文不符（宿主版本演进、pnpm 参数差异等），以实际输出为准并就地更正本文，不要只在会话里口述。
