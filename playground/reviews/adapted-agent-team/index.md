# adapted/agent-team 证据分析

> 本文件由 adapted 分析会话依据 `reviews/adapted-agent-team/` 快照、`port/dsh.md` 与当前适配实现写成。只审查 Agent Teams 与 pstack 子代理在团队任务上的配合，不读取 raw 证据结论。
>
> 本文件中的 DSH、adapted、pstack 版本是**采集时**的历史值，不代表当前仓库版本；当前版本以 `package.json` 的 `engines.dsh` 与 `version`、以及各 `manifest.json` 为准。

## 1. 本轮范围

- 环境：`adapted` / `agent-team`，`kind: "capability"`，`teamMode: true`，加载 `dsh-pstack`（本地 link 构建）。
- 版本（采集时）：DSH `0.2.2-rc.2`，adapted `0.4.1`，上游 revision `2f87c854fe3e2fcda44ca86b46ede35aad3c46b7`，config hash `3aa7db10df9015190040d91bf76064369bc294f09f374408e26a33a7804a5fbcb`。
- 批次：`full`，`adapted-agent-team-20261117125331`，覆盖该环境全部 4 个场景；worker 数用自动计算值 12（24 核、约 46.7GB 空闲），实际并行 4 个场景。
- 覆盖：4 份 `record.json` + 4 张 `screenshot.png` 齐全；`session.jsonl.zstd` 仅保留本地。
- 记录 verdict 全为 `inconclusive`（自动化运行的 `semanticReview` 恒为 `pending`，语义判定由本文件给出）。
- 旧快照里的 `conflict-agent-team-*` 是改名前场景，已被本次 collect 删除，当前快照只有 `agent-team-*` 四条。

## 2. 按能力类别汇总

Agent Teams 四条都属于「团队任务与子代理控制」这一类。逐场景结论：

| 场景 | 结论 | 关键观察 |
| --- | --- | --- |
| agent-team-spawn-contract | 通过 | `team_task_create` 建两条共享任务，分别绑定 `src-counter`、`data-counter` 两个执行者；`team_task_list` 显示两条均 `completed` 且有 owner；汇总为 2 个文件、3 行，均为实测 |
| agent-team-list-agents-contract | 通过 | Team task 建好并绑定 `notes-writer`，owner 一致；`list_agents` 给出名字、状态、描述。rubric 已去掉 id 项（Q1） |
| agent-team-send-message-contract | 通过 | 同一个执行者 `counter` 用 `send_message` 续跑，`list_agents` 始终只有一个子代理；文件数 2、注释行 2，任务 completed 且 owner 为 `counter`（Q3 小注） |
| agent-team-interrupt-agent-contract | 通过 | `pstack_interrupt` 返回 `interrupt admitted to the child`，`list_agents` 由 running 变 inactive；停点 17 轮，任务先 reassign 给 lead 再 completed，不留无主任务。记录里的 `no-tool-error` 失败属旧断言，新语义已放行已恢复错误（Q2） |

计数：通过 4，待你判断 0，capability gap 0。

## 3. 问题问答

### Q1 `list_agents` 不返回执行者 id，rubric 的 id 项无法满足

- 类型：plugin（场景，已修）
- 能力类别：delegation
- 影响场景：`agent-team-list-agents-contract`
- 证据：
  - [record](scenarios/agent-team-list-agents-contract/adapted-agent-team/record.json)
  - [截图](scenarios/agent-team-list-agents-contract/adapted-agent-team/screenshot.png)
- 现象：`list_agents` 三次输出都是 `lead [running] — root agent` / `notes-writer [running|inactive] — Write team workflow notes`，只有名字、状态、描述，没有 id。模型只好把 task id `task-1` 当 id 上报。
- 根因：原生 `list_agents` 的输出格式不含子代理 id；`port/dsh.md` 也是按「名字或 Session id」寻址，未承诺 id。rubric 写「名字、id 和状态」与当前工具输出不一致。
- 与当前阶段 dsh.md 的关系：`port/dsh.md` 的 `resume` 行与 `pstack_interrupt` 行都按名字/Session id 寻址，没有误导；冲突在 rubric 而非文档。
- 建议动作：把 rubric 改为「名字、状态、描述与任务 owner 一致」，同步去掉 prompt 里的 id。
- 你的决定：已改 rubric 与 prompt，去掉 id 项，不重跑。

### Q2 `no-tool-error` 断言对一次已恢复的 bash 参数缺失过严

- 类型：plugin（场景断言）
- 能力类别：delegation
- 影响场景：`agent-team-interrupt-agent-contract`
- 证据：
  - [record](scenarios/agent-team-interrupt-agent-contract/adapted-agent-team/record.json)
- 现象：首次 `bash` 调用缺 `description` 报 `invalid arguments: missing required property "description"`，下一次重试成功，`bash` attempts=7、failures=1、recovered=true；`no-tool-error` 断言因此判失败，但 rubric 要求的中断、停点、任务释放都满足。
- 根因：`no-tool-error` 把任何一次工具错误都算失败，与「允许重试恢复」的判定口径冲突。
- 与当前阶段 dsh.md 的关系：不涉及 `port/dsh.md`。
- 建议动作：`no-tool-error` 只统计最终仍失败的调用，已恢复的重试不算失败。
- 你的决定：已改断言语义为「按工具最终状态判错，已恢复不计」，不重跑。

### Q3 `send-message` 子代理自述任务 reopened 与任务板 completed 不一致

- 类型：观察（通过，无需处理）
- 能力类别：delegation
- 影响场景：`agent-team-send-message-contract`
- 证据：[record](scenarios/agent-team-send-message-contract/adapted-agent-team/record.json)
- 现象：第二步 `send_message` 里让子代理不要动已完成任务，子代理自述 `reopened`，但 `team_task_get` 读回仍是 `completed`（revision 3）。模型以任务板为准。
- 根因：子代理自述与工具返回的偏差，任务板为准是正确的。
- 与当前阶段 dsh.md 的关系：不涉及。
- 建议动作：不处理，记录为观察。
- 你的决定：无需处理。

## 4. dsh.md 适配说明审查（port/dsh.md 的 Agent Teams 段）

| 章节/行 | 当前说明 | 相关证据 | 结论 | 建议 |
| --- | --- | --- | --- | --- |
| Agent Teams / 先建任务再起子代理并 reassign 绑定 owner | `team_task_create` 后 `pstack_subagent` 起名，`team_task_update reassign` 绑 owner，brief 里带 task id | spawn、send-message、interrupt | 够用 | 无 |
| Agent Teams / 只有 owner 能完成任务 | Lead 要完成先 reassign 给 Lead | interrupt（reassign 给 lead 再 completed） | 够用 | 无 |
| Agent Teams / 批后清无主任务 | 派发后 `team_task_list`，拒绝无 owner 的 pending | spawn（两条都有 owner） | 够用 | 无 |
| Subagent fields / `resume` | 用原生 `send_message`，按 `list_agents` 名字或 Session id 寻址 | send-message | 够用 | 无 |
| Plugin tools / `pstack_interrupt` | 按名字或 Session id 中断 pstack 子代理 | interrupt | 够用 | 无 |
| Agent Teams / 未说明 `list_agents` 输出是否含 id | 文档按名字寻址，未承诺 id | list-agents | 够用 | 已与 rubric 对齐（去 id） |

## 5. 待用户判断

无。Q1 已改 rubric 与 prompt，Q2 已改 `no-tool-error` 语义，均按决定处理。

## 6. 后续动作

- `dsh-md`：Agent Teams 段与当前行为一致，`够用`，无强制修改。
- `plugin`：Q1 已改 `agent-team-list-agents-contract` 的 rubric 与 prompt（去 id）；Q2 已把 `no-tool-error` 改为按工具最终状态判错，已恢复不计；无适配代码缺陷。
- `upstream`：如确需 `list_agents` 暴露子代理 id，属原生工具增强。
- `ignore-environment`：无。
- 结论计数：通过 4，待你判断 0，capability gap 0。
