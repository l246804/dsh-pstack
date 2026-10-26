# 决定：推理档位可以在派发时覆盖，child 也能自调

Status: accepted
Date: 2026-10-26

## 背景

`pstack_subagent` 现在只能静态使用角色行里写死的 `[effort]`：调用方无法为单次派发换档，child 也无法在运行中改变自己的档位。而 pstack 原设计里，角色行的 effort 只是**起始值**，实际档位按任务难度双向浮动（上游："Raise it one step… Lower it one step for judgment and two or more steps for routine work"）。

这项能力曾经实现过，在 `89825c6`（2026-10-23）里：`pstack_subagent` 接受 `reasoningEffort` 参数并按 panel entry 逐个校验，child 作用域注册 `set_reasoning_effort` 工具，`agent/request` waterfall 改写下一次请求。`docs/porting/decisions.md` 当时也有 "## Reasoning effort" 一节。

它没有并入重写基线，原因是父提交取错了：`89825c6` 在 `adapt-audit-2026-10-23` 分支线上，`refactor/plugin-v2` 从 `3416f56` 起分支重写，两条线互不为祖先。该分支没有远端，删除即永久丢失。

更糟的是第二层：`e4a14da`（unit 6）把 22 处上游的 "Pick each subagent's reasoning level and fast or standard speed" 整句换成了相反的措辞，patch 的 `reason` 字段断言 "An effort can only come from the role file"，正文跟着变成 `poteto-mode/SKILL.md:95` 的"改不了就报给操作者"、`how`/`why` 的 "Never invent a model id or an effort"。于是能力不仅缺失，还被写成"本就不该有"。

第三层：设计文档 `f627847` 写作时就已假定没有这功能，§9.1 参数表没有 `reasoningEffort`，§9.2 无"校验覆盖值"一步，`host-contract.ts` 把 `Agent` 简化成 `{ id }`（用不到 `agent.options`、`session.requestHeader()`、`agent/request` hook、`ctx.agents`）。四层契约互相自洽，所以没人发现。

第四层：`docs/decisions/` 现有 20 条无一条提及这次回退；旧记录随 `659acce` 一起消失，也没有新记录声明取代它。`2026-10-24-no-agent-team-coexistence.md:14` 至今假设 `reasoningEffort` 存在，而该假设在当前 v2 里不成立。

平台侧没有阻碍：`dsh-agent/lib/types/runtime-types.d.ts:327` 的 `agent/request` waterfall 存在且 scope-filtered，`dsh-agent/lib/types/index.d.ts:343` 的 `agents.get(id)` 存在，所以 `89825c6` 的实现路径在 rc.3 上仍然有效。

## 决定

恢复两层能力，并**改变参数形状**：`reasoningEffort` 是自由 token（`type: "string"`，不带 `enum`），合法值由目标模型的 `llm.resolveModelInfo(...).reasoning.efforts` 决定。

- **派发时覆盖**：`pstack_subagent` 接受 `reasoningEffort`，作用于本次调用的每个 panel entry。启动前对每个 entry 逐解析它真正会请求的 route（显式 route > `session.requestHeader()` > `Agent.options`）并校验；任一 entry 不符则整次调用失败，一个 child 都不启动。继承 parent 的 entry 用父会话实际 route 校验。
- **child 自调**：启动后用 `ctx.agents.get(childId)` 取句柄，在该 child 自身作用域注册 `agent/request` waterfall 与 `set_reasoning_effort`。改动作用于下一次请求，已在飞行中的请求不变。注册随 child 销毁解除，兄弟 child 互不可见。
- **取不到 child 句柄不算启动失败**：child 保持下发档位，结果诊断里说明它无法自调。`agents` 因此不进 `inject`，按 `ctx.get("agents")` 每次读取，避免重演 `sessionQuery` 那次"硬依赖让整行 inert"。
- **角色行语义改写**：从 "pins an adapter-owned reasoning effort" 改成上游的 `starting level`，即"该角色起步的档位"。
- **正文恢复**：22 处上游句子以一条共享常量 `DELEGATION_EFFORT_SENTENCE` 补回；`how`/`why`/`poteto-mode` 三处禁止性措辞改写为真实能力。`fast` 不恢复，因为 speed 不是本包的旋钮。
- **`inject` 不变**（`["tools", "subagents", "llm"]`），`agents` 走可选服务读取。

## 备选方案

- **A：照抄 `89825c6`，7 个 token 写进 schema `enum`**（`max`/`xhigh`/`high`/`medium`/`low`/`minimal`/`off`）。放弃：等于承认存在通用档位阶梯，而设计 §4.1 与 `setup-pstack/SKILL.md:20`（"Do not infer an effort ladder from a model id"）明确否认这一点；部署广告的档位名可能完全不在其中（真实 adapter 可能写 `deep`/`normal`，见 `tests/routing.test.ts` 里刻意使用非标准词表），枚举会把合法值挡在门外。**本决定选 B**。
- **B：自由 token + preflight 校验**。已选。模型看不到穷举列表，但每次拒绝都返回该模型真实列表，信息量比枚举更大且永远准确。
- **把覆盖做成新参数 `effortOverride` 以区别于角色行**。放弃：上游句子的语义就是"选档位"，多一个名字只会让调用方多猜一次；`reasoningEffort` 与 `AgentOptions.reasoningEffort`、`LlmCallConfig.reasoningEffort` 同名，映射一目了然。
- **把 `agents` 写进 `inject`**。放弃：`history` 已经因为把 `sessionQuery` 列入 `inject` 让整行在缺服务的 profile 里 inert，工具根本不存在。`agents` 只用于 child 自调的增强，不该成为派发的前提。
- **覆盖值只校验第一个 panel entry，其余运行时降级**。放弃：那会留下"override 已应用"的假象——1 个 child 按新档位跑、其余按旧档位跑，而结果只报一个 `reasoningEffort`。旧实现选的"整次失败，一个都不启动"是对的。
- **只在 child 侧提供自调，不做派发覆盖**。放弃：第一次请求的档位必须在启动时就定下来，自调工具从第二步才可见；没有覆盖，角色行就成了硬上限，而这正是要移除的限制。
- **恢复 `fast` 语义**。放弃：DSH 没有 speed 旋钮，虚构一个等价物就是这次回退的镜像错误。

## 后果

角色行的 effort 从"配置事实"变成"默认值"，读角色文件的人必须知道覆盖是允许的。诊断因此显式说明覆盖发生（"overrides the effort this call's role line names"），结果记录里 `route` 与 `effort` 两个字段都反映实际值，避免模型把自己的覆盖读成"角色行赢了"。

`host-contract.ts` 的 `Agent` 不再是最小切片：它现在带 `options`、`session.requestHeader()`、`ctx`（含 `agent/request` 与 `tools`）。代价是每个测试都要构造更完整的 fake，因此新增 `tests/fake-agent.ts` 作为唯一形状来源；收益是能力有地方落地。这是该文件从"最小契约"转向"够用的契约"的一次性取舍。

多了一个可观察面：`agent/request` waterfall 每步都会被调用一次。空闲时 `next()` 只是回放已冻结的配置，开销可忽略，但它确实让 child 的每一步都经过本包的代码，所以任何在这里抛出的错误都会变成该 child 的请求失败。因此 listener 只做纯值替换，不做 I/O，也不重新校验——校验只发生在 `set_reasoning_effort` 被调用时。

`check-assets` 新增了一条**正向**检查（`checkEffortCapabilityCopy`）：此前所有检查都是"某个 token 不得出现"，这种形状对"能力被悄悄删掉"完全免疫——删除只会让违规文本消失。新检查从上游 anchor 反推期望集合（24 个文件，不是写死的数字），要求每个丢了该句的文件都携带共享常量、`poteto-mode` 必须写明 `reasoningEffort`／`set_reasoning_effort`／基线断言、生成的角色文件示例必须产出同一句基线断言、且回退措辞不得再出现。

### 更正：措辞绕了两圈，回到上游的 `starting level`

这段文字的三次修订值得记下来，因为每一次的动机都成立、结果都不是最优：

1. **初版** `a baseline and a floor`。`floor` 是本仓库发明的概念：`agentOptionsFor` 用覆盖值直接替换角色行，`set_reasoning_effort` 也不做比较，所以更低的档位完全有效。"下限"会让读者以为低值会被拒绝或抬回，恰好否掉了这个能力最主要的用途（routine work 下调）。
2. **第二版** `neither a ceiling nor a floor`。修正了错误，但变成了防御式表述：用两个上游从未出现的词去否认两件不会发生的事。第二次提交还为了"消除不一致"把这个错误措辞对齐到了示例文件——把一致性看得比正确性重。
3. **现在** `starting level`。这正是上游 `poteto-mode` 的原话："The `/setup-pstack` budget sets each role's **starting level**, xhigh by default." 上游把它与 "Lower it one step for judgment and two or more steps for routine work" 并列，所以"可以下调"本来就已经说过了，不需要再用否定句补一次。

**教训不是"措辞要贴上游"，而是这个能力本来就该照上游写。** 上游用 `starting level`，是因为它只陈述起点；`floor` 和 `ceiling` 都是在替读者推断边界，而两次推断都出了偏差。当初误加 `floor` 的直接原因，是漏读了紧随其后的 `Lower it one step` 那半句。

守卫的局限也由此确认：`STARTING_LEVEL` 是"唯一拼法"，能防两份文档漂移，但不能判断这个拼法对不对——第二版它忠实地保护了一个防御式的句子达一个提交。守卫保护一致性，不保护正确性；正确性靠阅读、靠对照上游、靠这条记录。

真要实现"某些角色不得低于某档位"，那是新能力（行级配置或 policy seam），不属于 `reasoningEffort` 的语义，见设计文档 §9.1。

**取代关系**：本记录取代 `docs/porting/decisions.md` 的 "## Reasoning effort" 一节（该文件随 `659acce` 删失）。它与 `docs/decisions/2026-10-24-no-agent-team-coexistence.md` 的关系是**修复**而非取代：那条记录假设 `reasoningEffort` 存在，本记录是让该假设重新成立。

仍未验证：真实 profile 下的覆盖值是否真的改到 child 第一次请求头、`set_reasoning_effort` 在真实两步对话里是否改到第二次请求、以及"在飞行中的请求不受影响"的真实时序。这些都只有真实模型调用能证，见 `docs/release-verification-checklist.md` 的 E01–E03。
