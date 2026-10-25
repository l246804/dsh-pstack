# 发布验收清单：未验证的实机与行为级用例

本文件是发布说明素材，不是支持声明。README 的"功能范围与已知限制"写能力边界，这里写验证进度。两者不互相替代。

为什么分成两步，见 [发布验收分期](decisions/2026-10-25-release-verification-staging.md)。静态检查、`check:assets` 和单元测试通过，都不构成本文件任何一行用例的证据。

单元 1 至 6 交付时的状态：静态门全绿，8 个测试文件 238 个用例通过，打包清单 173 条目，受控副本上的上游脚本测试通过。下列 40 条用例一条都没有执行，原因分三类：

- **需要真实模型调用。** 任何要求 route、effort、child 实际请求头或 panel 结果的用例。
- **需要真实宿主进程。** goal 的 armed/disarmed 边沿、reminder 投递、后台 job 的 settlement 通知、宿主重启后的状态。
- **需要真实外部状态。** PR、CI、forge 读取、真实 trace、真实图像比较。

## 前置：一次性 profile 与本地构建

复现命令的安装步骤一律是**本地构建 + 工作区目录链接安装到一次性 profile**，从 registry 安装线上版本的写法不适用：线上版本不可修改，而待验证的是当前 checkout。链接安装的解析行为与 [自包含技能 provider 决策](decisions/2026-10-25-self-contained-skill-provider.md)记录的开发安装一致。

```bash
# 1. 在 checkout 内构建，确认生成树不漂移
pnpm install
pnpm sync:check && pnpm check:assets
pnpm build
pnpm pack --dry-run          # 记录条目数，当前基线 173

# 2. 建一次性 profile，并把工作区目录链接安装进去
dsh plugin --profile pstack-verify add <absolute path to this checkout>

# 3. 记录环境
node --version && bun --version
```

注意三点。第一，第 2 步的"本地目录作为安装规格"这一形式来自开发期链接安装的既有做法，本单元没有启动任何 profile 复核它的确切写法；执行者第一次跑时以 `dsh plugin add --help` 的实际输出为准，并把这处差异记在本清单的备注里。第二，`assets/skills/poteto-mode/scripts/bootstrap.ts` 会把依赖装进 `scripts/node_modules`，该目录在生成树里没有上游来源，`check:assets` 会判成未声明文件；脚本冒烟只能在受控副本里跑，跑完删干净，不要在待发布的生产树里跑。第三，单元 7 实测到 Bun 的默认临时目录与 `~/.bun` 在受限环境里是只读的，`bun install` 会以 `EROFS accessing temporary directory` 失败；把受控副本、`BUN_INSTALL` 与 `BUN_TMPDIR` 一起指向一个可写目录即可，命令形态见下。

```bash
# 受控副本（不要在生产树里装依赖）
mkdir -p .tmp/unit7-scripts .tmp/unit7-bun
cp -R assets/skills/poteto-mode/scripts/. .tmp/unit7-scripts/
cd .tmp/unit7-scripts
BUN_INSTALL=<repo>/.tmp/unit7-bun BUN_TMPDIR=<repo>/.tmp/unit7-bun/tmp bun install --frozen-lockfile
BUN_INSTALL=<repo>/.tmp/unit7-bun BUN_TMPDIR=<repo>/.tmp/unit7-bun/tmp bun test orch watch-pr check-plan.test.ts
BUN_INSTALL=<repo>/.tmp/unit7-bun BUN_TMPDIR=<repo>/.tmp/unit7-bun/tmp bun run typecheck
```

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
| Bun / Node | 脚本测试在 Bun 1.4.0、Node 24.22.1 上通过 | 没有版本矩阵，只有一个组合 |
| 平台 | Linux 与 macOS 为主要目标，Windows 的 shell 与脚本支持未验证 | 未在 Windows 上跑过 |
| profiler | 只有正文里的工具名 | 未在本机实际采集与解析 |
| 图像比较 | 只有正文里的判定纪律 | 未实际运行 diff 工具 |

## 备注

- 执行中出现与设计文档冲突的结果时，先记录实际观察，再新写一条决策记录取代相关约定，不改文档来迁就结果。
- S12 与 B12 共用一次运行，但各自记录一条，因此表中 40 行对应 40 个用例 ID。
