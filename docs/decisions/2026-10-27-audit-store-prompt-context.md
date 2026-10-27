# 决定：用 prompt context 公布 `.audit/` 落点

Status: accepted
Date: 2026-10-27

## 背景

上游 pstack 假定每个 agent 有一个 store：宿主在系统提示里给出路径，目录在仓库之外，跨会话存活，一次运行启动的所有 agent 指向同一处。它用来放 `preferences.md`（standing orders）、`units.tsv`（工作单元表）、`ledger.tsv`（验证账）、`inbox/`、`gates.md`、`frontier.json` 和决策流。

这个宿主没有 store。三个 playbook 在移植时各自改指了仓库内路径，结果是：

- 路径不统一：`multi-phase-plan` 用 `docs/plans/`，`autopilot-full` 用 `.audit/<task-slug>/`，`orchestrate` 用 `.audit/orchestrate/`。
- `docs/plans/` 不在 `.gitignore` 里，计划会被提交；而上游说 store 整体不入库，`show-me-your-work` 也写 "leave it out of git"。
- 子代理不知道路径，得由调用方在 brief 里逐个交代；resume 之后要再交待一遍。

第三点是真正贵的那一条。上游的 `orchestrate` 明写 `Local spawns may reference the standing-orders file by store path`，这个便利完全来自"宿主已经把路径告诉了每个 agent"。

## 决定

注册一条必需的 prompt context（`src/audit-context.ts`，注册名 `pstack:audit-store`），写明非交付类工作文件默认放 `.audit/`，并同时说明两件事：操作者指定的目录优先；`.audit/` 不会自己续跑。

`capabilities.ts` 的 `agent-store` 行保持 `degraded`，但理由改为只保留真实缺口——跨会话不续跑。原先"宿主没有系统提示原语"的说法是错的，已删除。

`multi-phase-plan` 的落点从 `docs/plans/` 改为 `.audit/plans/`。

## 备选方案

- **维持现状，不做 prompt context。** 放弃：这样"路径不统一"和"子代理不知道路径"两条会一直存在，而它们正是上游 store 最省事的那一半。何况宿主确实有这个原语，说不做等于把能力缺失归因给宿主。
- **把 `.audit/` 写成 `PromptSection` 而不是 `PromptContext`。** 放弃：section 是系统提示的一部分，改了会让每个 Session 缓存的请求前缀失效一次，代价与收益不成比例；context 是 user-role 快照，同样持久但不改系统提示。上游也只是"系统提示里有个路径"，不需要独占一节。
- **`required: false`。** 放弃：可选运行时上下文被关掉时这条会消失，而写着 `.audit/` 的 playbook 会立刻指向一个没人告诉过它的位置。一句话的固定文本，值得常驻。
- **在 context 里声称目录跨会话存活。** 放弃：文件确实留在磁盘上，但没有任何东西会从它续跑。写成就等于重犯本仓库已经记录过的错误——用措辞把缺失的能力说成存在。
- **由 `pstack_subagent` 在每次 brief 里注入路径。** 放弃：那只覆盖子代理，覆盖不到主会话自己按 playbook 写文件的情况，而且把同一句话重复进每个 brief。
- **把 `systemPrompt` 加进 `inject`。** 放弃：加进去之后，没有 prompt 服务的组合会让整行失活，55 个技能一起消失。服务是可选的，就必须用 `ctx.get("systemPrompt")` 可选访问，而不是声明硬依赖。

## 后果

子代理和主会话都知道 `.audit/` 是默认落点，不必逐个交代，resume 后的"路径不知道"也一并解决。落点统一，且默认不入版本控制。

代价三条。第一，每个 Session 多一行 user-role 快照，多一次 token 成本（很小，但是常驻的）。第二，`required: true` 意味着操作者无法通过关闭可选上下文来去掉它。第三，它只公布落点，不提供任何持久化或恢复能力——跨会话不续跑这条缺口仍在，清单里照实写着。

补充一条实施中发现的问题，记在这里是因为它属于同一个决定的直接后果。第一版把 `host.systemPrompt` 当属性读，而 Cordis 按 `inject` 门控属性访问，那一行只 `inject ["skills"]`，所以每次激活都抛 `cannot get property "systemPrompt" without inject`——功能在真实组合里根本没生效。漏掉的原因是测试用的 fake host 提供了属性，而宿主并不允许那样读。修法是改用 `ctx.get`，并让 fake 按宿主的访问规则塑造。同一轮还发现 `plugin-wiring.test.ts` 的 `skills` stub 方法名写错（`register` 而非 `registerProvider`），导致 55 个技能从未注册而 7 条断言全绿。两处的共同点是**断言"没报错"而不断言结果**，现已都改为断言结果（provider 数量、注册的 context 名）。

重新考虑的条件：如果 DSH 将来提供真正的 per-agent 持久目录（宿主分配、跨会话存活），这条 context 应改为公布那个路径，`agent-store` 行才有资格从 `degraded` 升为 `mapped`。
