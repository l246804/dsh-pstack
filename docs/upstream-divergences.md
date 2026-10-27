# 与上游的功能差异说明清单

本文逐条列出 dsh-pstack 与上游 pstack 之间的功能差异。每次同步上游、改动 `scripts/patches.ts`、`scripts/capabilities.ts`、`src/` 或 `assets/` 中与上游对应的部分之后，都要回来更新本文。

上游 pin 在 submodule `upstream/cursor-plugins` 的 `d1453c11d1dde9714d4c313c97d3a68432265c7f`。同步方式是 `pnpm run build:assets`，它重新生成 `assets/` 并逐字节比对。

## 这份清单回答什么问题

三件事，按顺序：

1. **上游有、这里没有**的功能是什么，为什么没有。
2. **这里和上游讲法不同**的地方是什么，改的是什么，功能是否仍对等。
3. **这里多出来**的东西是什么。

判断一条差异是否可接受，只有一条标准：**功能是否对等**。措辞不同不算差异，能力丢失算。

## 为什么需要这份清单

V2 重写时发生过一次能力丢失，值得作为判例。上游 24 个文件里写着 "Pick each subagent's reasoning level and fast or standard speed"，要求调用方按任务难度选档位。重写把这些句子换成了"档位只能来自角色文件"，并且把三处相关措辞改成禁止调档。**四层文档互相自洽，所以没有任何检查发现它**：禁词检查只查"不该出现的词出现了没有"，对"能力被删掉了"完全免疫。

事后恢复时还出过一次同类偏差。恢复后的措辞是"角色行是 starting baseline"，其中 `baseline` 这个词是本仓库发明的，上游从未用过。它读起来像下限，恰好否掉了这个能力最主要的用途（把难度低的任务调低档位）。修正成上游原话 `starting level` 之后，又发现另一处：文档写着"本包不假设存在通用档位阶梯"，于是删掉了上游"升一档 / 降一档"的指令。而 DSH 的适配器**确实**按从低到高报告档位列表，`LlmModelReasoningInfo.efforts` 的注释原文是 "from least to greatest selectable reasoning effort"。也就是说"一档"是可以定义的：它就是列表里相邻的那一项。

结论写进本文的判定规则：**措辞要贴上游；上游用词不要替换成自造词；上游的定量指令（一档、两次、三条）不要删成定性指令（调高、调低、若干）。**

## 判定规则

每条差异归入以下一类：

| 类别 | 含义 | 是否允许 |
|---|---|---|
| `mapped` | 宿主有直接等价物，功能对等 | 允许，措辞可改 |
| `degraded` | 宿主只有部分等价物，必须写明丢了什么 | 允许，但必须写明 |
| `preserved` | 上游行为原样保留，只是范围变窄 | 允许 |
| `excluded` | 不移植，所有用到它的技能都已改写 | 允许，但必须有理由 |
| `deferred` | 后面的单元才交付，`Unit` 写明是哪个单元 | 允许，但必须写明单元 |
| `regression` | 宿主**能**支持，却被删掉或改写弱化了 | **不允许**，必须修 |

前五类对应 `scripts/capabilities.ts` 的 `coverage`；其中非 `mapped` 的四类各带一条 `reason`。`regression` 只存在于本清单，是专门要防的：它不该出现在最终状态里，只应出现在"本次核查发现并已修复"的记录中。

## 一、能力映射表（`mapped` 与降级）

权威来源是 `scripts/capabilities.ts`，它生成 `assets/docs/harness/dsh.md`。本文只列结论和易混淆处，不复述整表。

### 完全对等（16 条 `mapped`）

`Task` 派发、`generalPurpose`、`poteto-agent`、`run_in_background`、`resume`、`file_attachments`、`AskQuestion`、`TodoWrite`、文件工具、按名调用技能、模型与档位、角色文件路径、项目技能目录、插件资源路径、worktree 隔离、随包脚本。

三处容易被误读为"降级"、实际是对等的：

- **`resume`**。DSH 的本地 Spawn/Fork child 在被 `send_message` 时可以继续，settled 之后也能再收消息。pstack 的策略是"默认开新 child，只有状态搬迁代价高时才复用"，这条策略在新宿主里成立，所以算 `mapped`。差别在于策略更严，不在于能力缺失。
- **档位控制**。`reasoningEffort` 是自由字符串，按目标模型自己广告的列表校验，不设本包的固定档位表。这比上游用 `-fast` 后缀拼 slug 的方式更精确，不是降级。
- **随包脚本**。上游是 Bun 加 shell，这里是单文件 Node bundle，经 `pstack_script` 用宿主进程运行。接口对等（同一组命令行参数、同样的输出与退出码），换的是运行方式。见第六节。

### 降级（14 条 `degraded`）

| 上游能力 | 这里的形态 | 丢了什么 |
|---|---|---|
| `comment-sicko` 子代理 | `agent: "comment-sicko"`，brief 里写明只读 | 只读是文字约束，不是沙箱，要靠 `git status` 事后核对 |
| `readonly: true/false` | brief 里的禁写指令，字段删除 | 同上：文字不是沙箱 |
| 内置 `create-skill` | `authoring-a-skill` playbook 加本包自己的检查 | 没有起草、评测、描述优化工具 |
| `agent-transcripts/` 目录 | `pstack_history` 分页读原始事件 | 无目录可读、无任意 session id、不遍历后代；冷读无法区分存储日志与读时修补事件 |
| 跨会话检索（`recall`、`automate-me` 都要） | 官方 `session-search` bundle 提供的 `session_search` 与四个同类工具，需在 Plugins 里手动启用 | 该 bundle 官方默认关闭；`pstack_history` 不能替代它，只能读调用者自己与直接子会话。缺它时这两个技能只在当前会话内工作，跨会话那一半必须如实报为不可用 |
| `paths:` 自动挂载 | 不消费该字段，技能改为显式调用 | `typescript-best-practices` 失去按文件自动触发 |
| agent store | `.audit/`（仓库内，经 prompt context 告知每个 agent），操作者指定的目录优先 | 上游的 store 在仓库之外、跨会话存活。这里用 `SystemPrompt.context`（宿主提供的持久 user-role 快照）注册了一条必需上下文，写明 `.audit/` 放计划、决策流和编排状态，**补回了「child 不用被告知就知道路径」这一半**。仍然丢的是跨会话存活：没有任何东西会自己从 `.audit/` 续跑，resume 的 child 仍要重新拿到 standing orders |
| Custom Mode | 每个新任务显式 `/poteto-mode` | 没有持久模式，没有快捷键 |
| `/loop` | `create_goal` 承载目标，`schedule_create` 只作定时心跳 | 没有事件订阅；goal 续跑依赖 profile 挂载 round driver |
| cloud agent | 本地 child 加真实 `cwd`，用 worktree 隔离 | 无 VM、无跨设备恢复、无 dashboard、无云端存活检查 |
| `deslop` | `/no-comments` 加一次 diff 通读 | 不是改名移植，是替换 |
| `control-ui` / `control-cli` | 项目自己的验证技能或已有 driver | 没有 driver 就没有验证结论 |
| 内置 PR 工具 | 解析出的 `gh` 或实际可用的 `origin` | 必须先解析 forge，没有内置工具 |
| image generation | Mermaid、已有截图或真实渲染器 | 渲染不出就不能凭空造图，只读采集仍只读 |

另有一条 `preserved`（Bugbot 只做已存在评论的 triage）与 2 条 `excluded`（`make-bot-ui`、Cursor Automations）。

`make-bot-ui` 是唯一被整体排除的技能：它依赖 Cursor 的 Grok Bot webhook 与 Tailscale，DSH 没有等价闭环。其余 55 个技能全部移植。

**跨会话检索为什么不自动挂载。** worktree 那两行会按需自动挂载，这一条刻意不照做，两者机制不同：

- worktree 必须防重复，因为第二个 `provide("worktrees")` 会抛错。session-search 的 group 用 `isolate: { sessionQuery: true }` 拥有一个隔离 provider，挂上去不会冲突。
- 正因为隔离，挂上它**不会**改善 `pstack_history`：后者读的是宿主那个 `openAt: never` 的 provider，走 `observeSession` 与 `filterSessions`；搜索工具走隔离的另一份。
- 代价是真实的：它给每个 agent 增加五个全局工具，切换时让 live Session 缓存的请求前缀失效一次，首次搜索后常驻一份内存索引。官方默认关闭正是为此。

所以是否启用由使用者在 Plugins 里决定。本包只保证缺它时技能如实降级，不替使用者做这个取舍。

## 二、随包脚本的改写

上游 5 个 CLI 加 5 个测试包，全部重做成单文件 Node 产物，经 `pstack_script` 运行。不需要 Bun、bash、`PATH` 上的 `node`，也不需要安装依赖。

| 上游 | 这里的来源 | 说明 |
|---|---|---|
| `check-plan.mjs` | 上游原文 | 直通 |
| `orch/orch.ts` | 上游 TypeScript，打包前打 patch | 保留上游形态，便于继续跟随 |
| `watch-pr/` | 上游 TypeScript，打包前打 patch | 同上 |
| `worktree-audit.sh` | 本仓库重写 `scripts/runtime/worktree-audit.ts` | 上游是 shell，行为按脚本重新实现 |
| `skills/show-me-your-work/scripts/log.sh` | 本仓库重写 `scripts/runtime/log.ts` | 同上 |
| `bootstrap.ts`、`bun.lock`、`package.json` | 不发布 | 依赖已内联，安装引导不再需要 |

测试包从 `bun:test` 改为 `node --test` 加本包的 `tests/support.ts`。`worktree-audit` 有一个上游没有的如实降级：宿主没有公开的 pinned 状态来源，所以脚本每行打印 `PINNED unknown`，要求 agent 向用户索取 pinned 集合，而不是猜。

## 三、措辞改写清单（功能对等，措辞不同）

这些差异**不改变功能**，但会让逐字 diff 出现大量噪声。列在这里，避免下一次同步把"措辞不同"误判为"功能不同"，也避免把"功能不同"误判为"措辞不同"。

| 上游写法 | 这里的写法 | 原因 |
|---|---|---|
| `Task` / `spawn` | `pstack_subagent` / 启动 child | 宿主工具名不同 |
| `subagent_type: "x"` | `agent: "x"` | 参数名不同 |
| `model` 加 slug | `role` 加角色文件 | 这里不存在逐次传 model id 的参数 |
| `write the TodoWrite list` / `todolist` | `todo_write` | 工具名不同 |
| `AskQuestion` | `ask_user_question` | 工具名不同 |
| 粗体技能名 `**how**` | `` `how` `` 加绝对资源路径 | 这里的技能目录不在模型可见的 catalog 里，按名加载会失败 |
| `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/pstack-models.md` | 角色文件位置不同，且不是 always-applied rule |
| `.cursor/skills/` | `.dsh/skills/` | 项目技能目录不同 |

三类结构性差异值得单独说：

- **跨技能引用改成读文件。** 上游 `**how**` 这类写法假定技能在 catalog 里按名可见。这里多数技能对模型隐藏，所以改成"读该技能 `SKILL.md` 的绝对资源路径并执行"。这是加载机制的必需改动，不是措辞偏好。
- **随包正文只说读者能执行的事。** `assets/` 里的文字是给使用者的 agent 读的，而 `scripts/` 不随包发布（`package.json` 的 `files` 里没有它）。所以正文不得把本仓库的开发期脚本当作读者的验证手段：`check-assets.ts` 守的是生成树，谁写一个 `.dsh/skills/` 里的技能，那个检查根本看不到。`authoring-a-skill` 第 2 步与 `reflect` 的收尾句都曾写成"跑 `scripts/check-assets.ts`"，现已改回上游的清单，并补上宿主加载器真正会静默拒绝的一条（非法 `name` 会被跳过，只留一条 warn 日志）。这条规则的判据在 `scripts/check-assets.ts` 的 `checkScriptReferences` 注释里，那里一直写着 `.ts` 引用"不随包、读者不该跑"。
- **22 处"选档位"句改成一条共享常量。** `DELEGATION_EFFORT_SENTENCE` 由所有丢了上游句子的 patch 追加，`check-assets` 从上游 anchor 反推期望集合，双向断言。之所以收成一条，是因为 24 份手写副本就是它丢 24 次的原因。
- **`fast` 语义不恢复。** 上游的 `-fast` 是 Cursor 的 slug 约定，DSH 没有 speed 旋钮。虚构一个等价物就是本次回退的镜像错误。

## 四、推理档位：最需要盯的一处

这是 V2 出过两次偏差的地方，单独成节。

**上游语义**：`/setup-pstack` 的预算设定每个角色的**起始档位**（`starting level`）。调用方按任务难度调整：最难的工作升一档，判断类工作降一档，机械工作降两档或更多。速度另有 `fast` 开关。

**这里的语义**（三处一致：`src/effort.ts`、`src/subagent.ts` 的工具描述、`assets/skills/poteto-mode/SKILL.md`）：

- 角色行的 effort 是**起始档位**，不是上限也不是下限。
- 调用方用 `reasoningEffort` 覆盖，作用于本次调用的每个 panel entry。**升档和降档都接受，不做钳制**。`tests/routing.test.ts` 有一条用例专门断言"降到比角色行低也照原样下发"。
- child 自己在运行中可以用 `set_reasoning_effort` 改档，从下一步生效，已在飞行中的请求不受影响。
- "一档"的定义：目标模型自己广告的 `reasoning.efforts` 列表里相邻的一项。DSH 文档保证该列表从低到高有序。
- 本包**不**携带档位词表。合法值由目标模型决定；拒绝时把该模型真实支持的档位全部列出。

**与上游的差异**：没有 `fast` 语义；档位不是 slug 的一部分而是独立参数；`unlimited/large/medium/small` 四个预算档位的目标仍是 `max/xhigh/high/medium`，但落地方式从"拼 slug"改成"查该模型广告列表，取不高于目标值的最高档"。

**判定为 regression 的条件**（出现即视为缺陷）：

- 任何文档说档位只能来自角色文件，或说调用方不能选档位。
- 任何文档说本包无法定义"一档"。
- 任何代码对低于角色行的档位做钳制或拒绝。
- `set_reasoning_effort` 从工具面消失，或它的改动不生效。

`check-assets` 有一条正向检查守这一点（`checkEffortCapabilityCopy`），它从上游 anchor 反推应携带共享常量的文件集合，并断言 `poteto-mode` 同时写着升档指令与"相邻项"的定义。这条检查是正向的，因为反向的禁词检查对"能力被删掉"完全免疫。

## 五、本次核查修复的问题

| 位置 | 问题 | 修法 |
|---|---|---|
| `src/subagent.ts` 工具描述 | 写着 "starting baseline"，并用 "does not assume a ladder" 否掉了"一档"的定义 | 改为 `starting level`，补回"升一档 / 降一档 / 降两档"，并说明一档是模型自己列表里的相邻项 |
| `src/subagent.ts` 参数描述 | 同上 | 同上 |
| `src/subagent.ts` 覆盖诊断 | 说角色行是 "starting baseline" | 改为 `starting level` |
| `src/effort.ts` 模块注释 | 说 `baseline`，并把 ad-hoc 词表说成 "universal ladder" | 改为 `starting level`，补上"不做钳制"与 DSH 的有序保证 |
| `skills/poteto-mode/SKILL.md`（经 patch） | 同样两处 | 同第一行 |
| `skills/how/SKILL.md`、`skills/why/SKILL.md`（经 patch） | 写着 "predict no ladder beyond that" | 改为"一档就是该列表里相邻的一项" |
| `assets/docs/pstack-models.example.md`（经 `role-manifest.ts`） | 说本包 "assumes no ladder of its own" | 改为说明列表由模型提供且从低到高有序 |
| `scripts/capabilities.ts` 的 `model-route` 行 | 说 "no effort ladder is either" | 改为说明词表与"一档"都来自模型 |
| `scripts/check-assets.ts` | 没有断言"一档"的定义 | 新增两条正向断言：`Raise it one step` 与 `adjacent entry in the model's own effort list` |
| `skills/automate-me/SKILL.md`（经 patch） | 把 `session_search` 写成"官方工具"，读起来像一定有；该工具由可选的 session-search 插件提供，当前 profile 并未挂载 | 改为"仅当 profile 挂载该可选插件时可用；缺失时说明跨会话那一半不可用，不得当作已完成" |
| `skills/figure-it-out/SKILL.md`（经 patch） | 说"本包尚未随附历史工具"，而 `pstack_history` 已经随包发布 | 改为指向 `pstack_history`，并保留"无法归因时报告审计未完成"的诚实条款 |
| `scripts/divergence-ledger.ts`、`check-assets.ts` | 本文本身没有任何检查守着，会像能力一样静默过期 | 新增 `checkDivergenceLedger`：本文缺失、缺类别定义、或引用的能力计数与 `capabilities.ts` 不符即失败 |
| 本文第一节的降级表 | 表里有一行 `Cursor Automations`，而它在 `capabilities.ts` 里是 `excluded`；同时缺了 `image generation` 一行。因为一进一出，总数仍是 13，计数检查全绿 | 换回 `image generation` 行，把 `Cursor Automations` 留在 `excluded` 一节 |
| 本文第一节的 `mapped` 列举 | 列了 16 个名字，`capabilities.ts` 有 17 条，缺 `agent store` | 补上（随后 `agent store` 本身改判为 `degraded`，见下一行） |
| `scripts/capabilities.ts` 的 `agent-store` 行 | 判为 `mapped`，而本仓库自己的 patch 写着 "This host hands no agent store to the model"，`multi-phase-plan`、`autopilot-full`、`orchestrate` 三处都已改写。上游的 store 由宿主注入 system prompt，在仓库之外、跨会话存活、多个 agent 共享；移植后只剩"一个可写的地方" | 改判 `degraded`，写明丢的是宿主分配的位置、跨会话存活、以及每个 child 都已经知道的统一位置 |
| 同上的判定理由 | 第一次改判时写"宿主没有系统提示原语"，这一条是错的：`SystemPrompt.context` 正是该原语（宿主文档原话 "durable user-role snapshot"），只是没有注册 | 补注册一条必需 prompt context（`src/audit-context.ts`），写明 `.audit/`；`degraded` 理由改为只保留真实缺口——跨会话不续跑 |
| `skills/poteto-mode/playbooks/multi-phase-plan.md`（经 patch） | 计划默认写到 `docs/plans/`，而该路径**不在** `.gitignore` 里，会被提交；上游说 store 整体不入库，`show-me-your-work` 也写 "leave it out of git" | 改为 `.audit/plans/`，与 `autopilot-full`、`orchestrate` 的落点统一 |
| `src/host-contract.ts` | 没有 `systemPrompt` 的结构化契约，插件无法注册 prompt context | 新增 `SystemPromptHost` 与 `PromptContextContribution`，只声明 `context` 一个方法 |
| `scripts/capabilities.ts` 的 `subagent-general` 行 | 只写 "never a DSH agent preset id"，读起来像本包不支持宿主预设；实际是另一个参数 `agentPreset` 负责这件事 | 补明两个参数分工，以及 `agentPreset` 仅在该行配了 `allowedAgentPresets` 时出现 |
| 本文的类别词表 | 缺 `deferred`，且说"后四类各有 `reason`"与 `capabilities.ts` 的五类对不上 | 补齐 `deferred` 并修正这句 |
| `scripts/divergence-ledger.ts` | 只比对计数，看不出"一条换一条" | 新增成员检查：每行带 `ledgerAnchor`，本文必须逐条点名，配 `tests/divergence-ledger.test.ts` 守住 |

最后一行是这次真正的修复。前五条都是它的症状：**计数相等不等于成员相同**。历史漂移（`image generation` 被 `Cursor Automations` 顶掉，13 仍是 13）现在会让检查失败，`agent store` 被从列举里删掉也会。

根因有两条，都属于同一类"能力/事实与现实脱节"：

1. 把"本包不携带固定档位词表"（正确）推广成"档位之间没有顺序"（错误），于是上游的定量指令失去落脚点，被删成定性描述。
2. 移植时按当时的实现状态写死了"某工具还没随附"、"某工具是官方提供的"，之后再没回头核对。前者在工具落地后变成假话，后者从一开始就高估了宿主保证。

两条的共同点：**声称能力存在或不存在，都没有检查去核对**。静态门查的是"不该出现的词有没有出现"，对这两种偏差都不敏感。

这次核查还暴露了第三条，形状不同：**清单声称的数字对，但它是用错误成员凑出来的**。前述两条讲的是"某条内容错了"，这一条是"每条内容都像对的，整体却错了"——一进一出让总数守恒，于是任何只比对总数的检查都会放行。修法是让检查从"数到 13"变成"13 个分别是哪一个"。

## 六、这里多出来的东西

上游没有、这里有的部分。同步上游时不要把它们当成"上游缺了"去补：

- `pstack_subagent` 的 `reasoningEffort`、`roleIndex`、`maxDepth`、`agentPreset` 参数。`agentPreset` 与 `agent` 是两个参数，不冲突：`agent` 是 pstack 自带的三种 brief 形态之一（`poteto-agent` / `comment-sicko` / `general`），不接受 DSH 预设 id；要让 child 换一个宿主预设，用另一个参数 `agentPreset`，且只有该行配了 `allowedAgentPresets` 时它才出现在 schema 里。
- child 作用域的 `set_reasoning_effort`。
- `pstack_history`（受限只读历史）与 `pstack_script`（随包脚本运行）。
- 一条必需的 prompt context（`pstack:audit-store`，见 `src/audit-context.ts`），把 `.audit/` 这个落点告诉每个 agent。上游不需要它，因为它的宿主本来就在系统提示里给 store 路径。
- `scripts/` 整个生成链：patch 定义、资产生成、`check` 的四段（`check:assets`、`check:scripts`、`typecheck`、`test`）、运行时打包，以及第三方技能树的 `sync-skills-ext.ts`。
- `docs/decisions/` 的决策记录。
- 按需挂载的 worktree 行，以及它对该 profile 是否已有等价行的判断。
- `skills-ext/` 第三方技能树。上游 pstack 没有这个概念，它不来自 pstack submodule，见下一节。

## 六之一、第三方技能树

`skills-ext/<来源>/<技能>/` 存放移植自 pstack 之外的技能。它放在 `assets/` 之外，与 `assets/skills/` 有几点不同，同步时不要混在一起处理：

|  | `assets/skills/` | `skills-ext/` |
|---|---|---|
| 位置 | `assets/` 之内 | `assets/` 之外，作为兄弟目录 |
| 来源 | 一个 pinned submodule | 每个来源一个仓库，各自 pin |
| 生成方式 | 由 `build:assets` 从上游加 patch 生成，整棵重写 | 从上游原样复制，不经过生成器 |
| 校验方式 | `sync-upstream --check` 逐字节比对生成结果 | `sync-skills-ext.ts` 比对记录的内容哈希 |

**为什么在 `assets/` 之外。** `assets/` 的承诺是"一次全新构建能重现这些字节"，而 `writeAssets` 的做法是把新树 `rename` 盖上去，所以它**只能**放生成物。`skills-ext/` 要跨过这次重写存活，就不能待在里面。这条规则早先由 [静态资源决策](decisions/2026-10-26-static-resource-directory.md)为 `static/` 定下（`assets/` 保持纯生成树），本树是第二个案例。

在此之前它确实在 `assets/` 里，代价是 `build:assets` 会把它删掉，而且不报错。现在写入前有一道前置断言：`assets/` 里只要出现生成器不产出的文件，`build:assets` 直接失败并点名该路径，而不是静默删除。这道断言是这次事故的真正修复，位置调整是让它不可能再犯。

现有来源：

| 目录 | 仓库 | 许可证 | 固定提交 |
|---|---|---|---|
| `mattpocock-skills` | [mattpocock/skills](https://github.com/mattpocock/skills) | MIT | `5beb35b` |

首个技能是 `writing-for-agents`，逐字节复制，零适配。它给 `authoring-a-skill` playbook 提供"怎么写技能"的判据，补上 Cursor 内置 `create-skill` 缺失、且其授权无法确认的那一块。

同步：

```bash
pnpm run skills-ext:sync   # 比对固定提交的远端内容，报告上游是否已变（只读）
pnpm run skills-ext:pin    # 重新记录哈希（改动之后）
```

`skills-ext:sync` 只报告，不自动采纳。上游改进一个技能是评审决定，不是同步步骤：看过差异、决定采纳之后，改 `sources.yml` 里的 `revision` 再跑 `skills-ext:pin`。

**不许本地改 vendored 文本。** 一个字符的差异就让 `check` 失败，因为哈希对不上。技能目录里只放上游文件：来源、许可证、提交号全部只在 `sources.yml` 一处，目录里不放本包写的说明，避免同一事实两处维护。确实需要本地改动时，它必须是原生文件以外的独立文件，不能改那份拷贝；那时要给清单加一条记录，并让检查认这个例外。

**上游依赖 Cursor 内置技能的处置。** pstack 多处指令把工作交给 Cursor 应用自带的技能，这些技能不在本包内，授权也无法确认。按三类处理：能提供等价技能的就改指向（`create-skill` → `writing-for-agents`），宿主有等价机制的就改写（`loop` → `create_goal` 加谓词），产品绑定的明确排除并说明在哪一步失效。完整理由与逐条清单见 [内置技能依赖记录](decisions/2026-10-27-cursor-builtin-dependencies.md)。

**同名遮蔽。** DSH 按 rank 从小到大解析同名技能，本包是 600，项目级是 100 和 200，用户级是 400 和 500。使用者自己写的同名技能会完全盖掉本包的，且不报错。本包内部两棵树之间不允许同名：出现重复会让插件启动失败，而不是让其中一个悄悄胜出。

## 七、同步上游时怎么用这份清单

1. `git submodule update --remote upstream/cursor-plugins`，记下新 pin。
2. `pnpm run check`。它会报出锚点失配：`anchor for replace matched N time(s), expected M`。**这是设计行为**，不是脚本 bug，说明上游改了我们改过的那段文本，必须人读语义后重新决定改法。
3. 逐条对上游改动问三个问题：这条改动落在我们 patch 过的文件里吗？它动的是功能还是措辞？如果是功能，本清单哪一条需要更新？
4. 改 `scripts/patches.ts`，不要手改 `assets/`。
5. `pnpm run build:assets` 重新生成，`pnpm run check` 全绿。
6. **更新本文**：新增或删除了差异就改对应小节；能力映射变了就改 `scripts/capabilities.ts`，它是权威来源。

第 6 步是这份清单唯一可能失效的地方：没有检查能判断"本文是否仍与上游一致"。它靠第 3 步的人工判断维护。

**已验证的行为**：2026-10-26 实测，`upstream/cursor-plugins` 的远端 main 已经走到 `99b609a`，比当前 pin 新。把 pin 指过去再跑 `node scripts/sync-upstream.ts --check`，脚本以

```
assets cannot be built: skills/swarm/SKILL.md: anchor for replace matched 0 time(s), expected 1: "4. Pick the worker model from the `swarm workers` line ..."
```

退出。这正是第 2 步描述的形状：上游改了我们 patch 过的那段文本，锚点失配，同步停下等人判断。当前 pin 已回退到 `d1453c1`，本清单描述的仍是那一棵树。下一次同步需要按第 3 步处理 `swarm` 的这处改动。

## 八、仍未验证的部分

静态门覆盖不到、需要真实 profile 才能证明的行为：

- 覆盖值是否真的改到 child 的第一次请求头。
- `set_reasoning_effort` 在真实两步对话里是否改到第二次请求。
- "已在飞行中的请求不受影响"的真实时序。
- `pstack_history` 在真实 profile 下的读取。
- worktree 四条 profile 路径的真实挂载。
- `/loop` 的降级映射：goal round driver 在目标 profile 里是否真的挂载。

这些在 README 的"功能范围与已知限制"里对用户可见。发布说明不得把这些写成"已验证"。
