# 决定：长任务映射到 goal、reminder 与本地 watcher，三条边界写进正文

Status: accepted
Date: 2026-10-25

## 背景

设计 §7 与上游 playbook 的唤醒机制建立在两个 Cursor 能力上：`/loop` 命令（"内建唤醒机制"）和 cloud agent（每个 worker 一台机器）。[移植总决策](2026-10-24-upstream-generated-port.md)要求这两项按真实宿主能力重映射，[worktree 决策](2026-10-25-worktree-conditional-mount.md)已经把隔离边界限定为工作目录与分支。

用 Host Inspect 核对 DSH `0.2.1-rc.3` 后，设计文本里有一半的名字不存在或语义不同：

| 设计里的写法 | rc.3 实际契约 | 本单元的处理 |
|---|---|---|
| `/loop` 命令 | 没有这个命令，也没有任何模型可用的"定时重跑"入口 | `create_goal` + `update_goal` 状态机 |
| "watcher subagent 在事件发生时叫醒你" | 没有面向模型的 event subscription。`ctx.webhookRuntime` 是 Host 服务，需要插件注册规则和已验证 ingress | 阻塞到条件变化再退出的后台进程，或调用方自己跑的轮询 |
| "长时间的基于时间 heartbeat 作为 fallback" | `schedule_create` 把 followup 写回**原 Session 的 inbox**；Host 必须运行；receipt 只证明 inbox 投递，不证明模型执行 | 只作为 heartbeat，且只能由顶层 agent 布置 |
| "cloud agent" / 每 worker 一台 VM | 没有云环境。child 是本进程内的 Session，进程结束即消失 | 本机 child + `create_worktree` |
| "cloud agent 在 Cursor dashboard 的状态" | 没有 dashboard | `list_agents` + 各自产物 |
| "Cursor restart 后本地 agent 死了、云端还在" | 宿主重启后没有任何东西存活 | 按分支与 PR 重建，不按 child id |
| "nesting works to depth 3" | 本包 `pstack-subagent` 行的 `maxDepth` 是 2，child 只能再降不能升 | depth 2 |
| "agent store（路径在 system prompt 里）" | 宿主不给模型任何 store 路径 | 由操作方指定目录，否则 `.audit/<slug>/` |

`update_goal` 的权限和状态机也不是"模型随时可改"：`create`/`edit`/`pause`/`resume` 需要顶层 agent 当前轮里的直接人类消息；`complete` 与 `blocked` 也接受 goal round；`blocked` 在 `dsh-tool-goal` 的 `blockedAfterConsecutiveRounds`（默认 3）之前被机械拒绝；模型侧 `resume` 拒绝 durable `paused` 状态，那属于 `/goal resume` 或 Web 的用户路径。自动续跑本身是独立包 `dsh-goal-round-driver`，未挂载时 goal 只保存状态、什么都不会自动发生。

## 决定

1. `/loop until X` 映射为 `create_goal` 加真实的 `update_goal` 状态机。正文要求 predicate 可证伪，达到 predicate 才 `complete`，`blocked` 只在同一具体条件跨过部署阈值时报告并写明 `blocked_reason`，并明确暂停与恢复属于操作方的直接请求、宿主重启后 active goal 回到 disarmed。Ralph 一类重复提示驱动只在操作方点名时使用，不替代 predicate。
2. `schedule_create` 只作为 heartbeat。它是定时输入，不是事件订阅：投递目标是创建它的那个 Session，不能由 child 创建，服务层和工具层都对 delegation depth > 0 的调用方返回 `subagent_session`，也没有 pause。正文不再出现"用 reminder 盯 PR"的写法。
3. 事件唤醒只有两种真实形态：(i) 一个阻塞到条件变化再退出的进程，作为后台任务运行，settlement 以会话内通知抵达；(ii) 调用方自己跑的轮询，读它的输出。`watch-pr` 是 (i) 的脚本实现，它自己轮询 forge 并在终局退出，因此进程是 watcher、settlement 是唤醒，而不是"订阅"。没有第三种形态，也没有 webhook。
4. 云能力整体删除。每个 owner、verifier、live lane 都是本机 `pstack_subagent` child，隔离用 `create_worktree`：只隔离工作目录与分支，端口、缓存、凭据和外部服务共享，进程结束即全部结束。隔离范围的权威表述在 [worktree 条件挂载决策](2026-10-25-worktree-conditional-mount.md)，本条只说明云能力为什么被删。凡"关掉笔记本还在跑""跨设备恢复""云端存活"的句子全部删除，不留同类替身。
5. 轮询就写轮询。watchdog、queue、存活检测只要实际是周期性检查，正文写 poll 与检查间隔，不写 watch；把轮询说成 watcher 与把 reminder 说成 webhook 是同一个错误。
6. 三条硬边界写在每个用到它的 playbook 的那一步里，不集中在附录：`autonomous-run` 与 `babysit` 写 heartbeat 与 watcher 的区别，`shipping`/`autopilot-full`/`autopilot-stack`/`orchestrate`/`multi-phase-plan` 写 worktree 的隔离范围与"没有 VM"，`pause-safely` 写"暂停 goal 不等于保存工作现场"、宿主重启不会替你继续。

## 备选方案

- 保留 `/loop` 作为"Cursor 命令、但语义换成 goal"的映射。放弃，因为读者会真的去敲这个命令，而宿主没有它。
- 用 `schedule_create` 伪装事件订阅，例如每五分钟检查一次 PR 并声称这是 watcher。放弃，因为那正是设计 §14 风险表里"把 reminder 当 webhook"那一条，且 receipt 不证明模型真的执行过。
- 用 `workflow` 工具替代 `pstack_subagent` 做编排。放弃，因为它的原语是 `agent()`/`pipeline()`，没有 role、cwd、agent kind 和 panel 语义，与 §15 的既定选择冲突；大型独立矩阵任务仍可选它，但那不是本单元的主工作流。
- 在插件里注册 `ctx.webhookRuntime` 规则来实现真订阅。放弃，因为需要 ingress、认证、凭据和唤醒生命周期，与排除 `make-bot-ui` 是同一个理由。
- 用 goal 直接承担 babysit 的 watcher。放弃，因为 goal 不调度、不感知外部事件，只能靠轮次推进；它保存的是目标与相位，不是 PR 状态。
- 在正文里写死 blocked 的轮次阈值。放弃，因为阈值属于 `dsh-tool-goal` 的配置，正文重复一份会让策略分裂；正文只写"部署阈值，默认三"。
- 让 worker 自己 `schedule_create` 定时叫醒。放弃，因为契约直接拒绝这样的调用方，正文必须写成由顶层 agent 布置。

## 后果

长任务文本现在只承诺本机真实存在的东西：目标与相位持久化、round 计数、reminder 作为定时输入、后台进程 settlement 作为唤醒、worktree 作为唯一隔离手段。代价是四处能力下降，都写进了能力表与正文：

- 自动续跑取决于 profile 是否挂载 goal round driver。未挂载时 goal 只记目标，所以正文要求用 `get_goal` 读出差异并如实报告；能力表 `loop` 行因此是 `degraded` 而不是 `mapped`。
- reminder 无法由 child 创建，"worker 定时叫醒自己"这类写法全部改成顶层 agent 布置，`autopilot-full` 与 `multi-phase-plan` 的 tick 都受影响。
- 没有云端存活，"假定 VM 会死"改成"假定本机与本 Session 会死"，恢复边界收缩为已推送的分支加决策日志。
- `check-plan.mjs` 的 `PROGRAM_MARKERS` 与 `multi-phase-plan.md` 的模板是一份协议的两个副本，改一处必须同改另一处。主仓测试用受控副本跑一遍模板（通过样例与缺项样例），上游的 `check-plan.test.ts` 另跑一遍；两者都在 Node 与 Bun 上分别验证过，但这只证明协议一致，不证明计划真的被执行过。
- `orch` 与 `watch-pr` 的运行前提是 Bun、`scripts/package.json` 里锁定的 `commander@14.0.0`，以及一个可写的临时目录（`BUN_TMPDIR`）。`bootstrap.ts` 会把依赖装进 `scripts/node_modules`，而那个目录在生成资产树里没有上游来源，`check:assets` 会把它当成未声明文件，因此脚本测试只能在受控副本上跑，不能在生产树里跑完再提交。

行为级验收（B04、B10、B13 至 B18、B20、B21）全部未执行：本阶段只有静态检查与单元测试，没有真实模型调用、真实 child、真实 watcher、真实 PR。真实 goal 的 armed/disarmed 边沿、reminder 的实际投递、后台 job 的 settlement 通知都需要在隔离 profile 里另行验证，届时若结果与本文不符，应新写一条记录取代本记录，而不是修改本文。
