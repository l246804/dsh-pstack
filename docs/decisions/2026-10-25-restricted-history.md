# 决定：受限历史读取按 rc.3 契约重映射，授权分两段校验，来源不可判定就报未完成

Status: accepted
Date: 2026-10-25

> **部分被取代（2026-10-26）。** 下面第 1 条里「`inject` 为 `tools`、`subagents`、`sessionQuery`」这个判断是错的，已被 [F01 记录](2026-10-26-f01-optional-session-query.md) 取代：`sessionQuery` 是硬依赖时，缺该服务的 profile 里整行 inactive，工具根本不注册，第 4 条要求的 "不可用就返回 unsupported" 反而无法满足。现在改为按调用用 `ctx.get("sessionQuery")` 可选读取。
>
> 本记录其余内容继续有效，因此 Status 保持 `accepted` 而不是整份 `superseded`：第 2 至 5 条（`src/host-contract.ts` 作为唯一契约复述点、输入字段、单快照分页、两段授权、来源不可判定即报未完成）都仍是当前实现。正文保留原文不改写。

## 背景

[移植总决策](2026-10-24-upstream-generated-port.md)定下"历史读取以 `sessionQuery` 为后端，新增受限只读工具，从同一份完整逻辑快照分页返回原始事件，按调用 Agent 和直接父子关系授权"。设计文档 §10.2 进一步给了 DTO 字段：`snapshotEvents()`、`persistedThroughSeq`、逐事件 `provenance`。

用 Host Inspect 核对 DSH `0.2.1-rc.3` 的真实契约后，这些名字有一半不存在：

| 设计里的写法 | rc.3 实际契约 | 单元 5 的处理 |
|---|---|---|
| `observeSession()` 之后调 `snapshotEvents(0, seq)` | 没有这个方法。observation 自带冻结的 `events` 数组，`live` 在构造时取 `session.snapshotEvents(0, seq)` | 直接读 `observation.events`，边界取 `observation.cursor` |
| 快照边界 `throughSeq` | `cursor`（`number \| -1`） | 等价使用；`-1` 表示空日志 |
| `persistedThroughSeq` | 没有任何公开方法报告"已持久化到哪个 seq" | 恒为 `null`，并在 `provenance.note` 里说明原因 |
| 逐事件 `provenance: source-log \| read-time-repair` | observation 不区分。冷读 `events` = 持久化事件 + `interruptedTurnClosers()`，closer 续接 seq、复用真实事件类型与 reason | live 标 `source-log`；prepared 标 `undeterminable`，`audit.complete=false` |
| `revision`（prepared） | `revision?: SessionPersistenceRevision` 只在 prepared 出现 | 保留；live 一律 `null` |

`interruptedTurnClosers` 的行为决定了最后一行不能含糊：它把合成的 `tool/result`、`step/end`、`turn/end` 追加到持久化日志尾部，`seq` 从最后一条真实事件继续，`time` 复用最后一条事件的时间，且不带任何标记。设计 §10.2 已经禁止"按事件类型或 `interrupted`/`forked` reason 反推"，因为持久化日志本身也可以合法带有这些 reason。也就是说 rc.3 下冷读的来源无法判定，不是实现没做，而是契约不给依据。

## 决定

1. 新增 `src/history.ts`，注册模型工具 `pstack_history`，bundle 行 `pstack-history`（`dsh-pstack/history`），`inject` 为 `tools`、`subagents`、`sessionQuery`。
2. 类型仍写进 `src/host-contract.ts`（唯一的 rc.3 契约复述点），新增 `sessionQuery` 切片与 `SubagentCatalogHost` 切片。运行时仍零 `@deepseek-ai` import。
3. 输入：`scope`（`current` 默认 / `children`）、`sessionId`、`fromSeq`、`limit`（默认 50，上限 200，超限拒绝而不截断）、`throughSeq`。`throughSeq` 是相对 §10.2 唯一新增的模型可见字段：没有它，"后续页只能读取该边界内的事件"无法兑现，因为每次调用都会得到新快照。§10.2 的 `includeDescendants` 没有实现，因此不进入模型可见 schema；调用方若仍然传入非 `false` 值，返回专门的 `UNSUPPORTED_OPTION` 错误而不是静默忽略。
4. 分页只建立在一次 `observeSession` 的冻结快照上：按 `[fromSeq, min(throughSeq, cursor)]` 切片，`nextFromSeq` 取第一个未返回的 seq，lease 在 `finally` 里 `[Symbol.dispose]()`。不使用 `listEvents()`（只有摘要）、不逐页重取边界、不调用 `ctx.sessions.flush`。
5. 授权分两段，两段都必须过：
   - 入口段：只取 `exec.agent.id`。目标等于调用者即自身；否则必须命中 `ctx.subagents.listChildren(callerId)` 且 `mode === "continuable"`。`external`、`one-shot`、`unknown` 一律拒绝，且它们的 id 不出现在任何结果里（只报计数）。
   - 返回段：对真正要渲染的 `header` 再校验一次——`header.id` 必须等于目标、child 读的 `header.parentSession` 必须等于调用者、`header.cwd` 必须等于调用者从语料读到的 `cwd`。调用者没有 `cwd` 时只能读自己。
   - `traceSession` 不作为授权来源，也没有调用：lineage 只是命名来源，再读一次既不加权限，也不减风险。
6. 失败分层返回 `denied` / `unavailable`，带 `layer`（`authorization` / `session-query` / `persistence` / `backend`）与闭集 `code`。后端原文不回显，`classifyBackendFailure` 只从固定表取文案（`SESSION_QUERY_PERSISTENCE_FAILED` → persistence，未知码 → backend）。
7. 来源不可判定就写进结果：prepared 快照的 `audit.complete=false`，`blockers` 说明冷读可能混入读取期补全事件。技能正文据此要求把完整审计标未完成。
8. 结果里的 `relations` 给出调用者可审阅的直接子代理，以及被排除各模式的计数；`events[].data` 原样转发，不是 `deriveMessages()` 的模型表面。`readSurface` 本版未使用：它只是辅助视图，不能替代审计输入。

## 备选方案

- 照抄 §10.2 的字段名，在 DTO 里给 `persistedThroughSeq` 填 `cursor`。放弃，因为那是伪造：live 会话的 `cursor` 是内存日志边界，不是持久化边界，填上去会让审计把"未落盘"当成"已落盘"。
- 用 `readSession()` 作为主读取路径。放弃，因为它对一份 detached 副本重放校验并同样追加 closer，既拿不到来源标记，也不固定在调用时刻的边界上。
- 用 `listEvents()` 分页。放弃，契约写明它只返回摘要（`SessionEventRecord`，无 `data`），审计需要原始事件。
- 先 `flush` 再读磁盘。放弃：flush 只等待持久化监听器，不冻结日志，await 之后仍可能有追加；活跃读取本来就有 observation。
- 把 `traceSession` 当成额外的授权校验。放弃：它接受任意 id 并返回 lineage，既不证明调用关系也不证明 workspace 归属，只会多一次语料读取。
- 冷读时按事件类型猜哪些是合成 closer。放弃：设计明文禁止，且持久化日志可以合法含有相同类型与 reason。
- 在插件内自己解压 JSONL。放弃：压缩格式、目录布局和历史迁移都是宿主的私有实现，技能里也不允许出现持久化根路径。
- 直接让技能用官方 `session_search` 读当前会话。放弃：官方 `session_search` 默认排除当前会话，且只返回片段，支撑不了 `reflect`、`show-me-your-work`、`eval` 对完整事件的要求。它只作为 `recall` 的可选加速。

## 后果

`pstack_history` 的读取边界、分页、lease、授权矩阵与失败分层都有单元测试覆盖，生成资产里不再出现 transcript 目录、`subagent id` 或"直接读日志文件"的说法。四个历史相关技能与三个 playbook 改成按授权读取，`worktree-audit.sh` 改成读调用方提供的会话快照而不是扫持久化根。

代价有三处：

- 冷读（prepared）的历史**永远无法**达到"完整 transcript 审计"。这不是待修 bug，是 rc.3 契约缺一个来源标记；除非宿主将来公开逐事件 provenance 或持久化边界，否则这条限制只能如实报告。届时新写一条记录取代本记录。
- `persistedThroughSeq` 在能力表里按"不可用"处理，能力行 `transcripts` 因此是 `degraded` 而不是 `mapped`。
- `includeDescendants` 与跨 workspace 任意 id 都没实现，`pstack_history` 只覆盖当前会话与直接子代理。需要别的会话时走官方 workspace 授权搜索，技能正文已按这个边界写。

`observeSession`、`listChildren` 的签名和 `SessionObservation` 的形状都来自 Inspect 核对，DSH 升级时必须重核 `src/host-contract.ts` 的 sessionQuery 段，否则类型检查不会报错。
