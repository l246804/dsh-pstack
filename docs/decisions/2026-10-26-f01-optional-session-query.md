# 决定：`pstack_history` 把 `sessionQuery` 当可选服务读取

Status: accepted
Date: 2026-10-26

取代 [2026-10-25-restricted-history.md](2026-10-25-restricted-history.md) 第 1 条关于 `inject` 的判断，以及开发设计 §3.3 的注入清单（该文档已随 [V2 后收敛决策](2026-10-26-slimming-after-v2.md)删除，注入清单的权威定义现在只在 `src/history.ts` 的 `export const inject`）。

## 背景

[受限历史决策](2026-10-25-restricted-history.md)第 1 条把 bundle 行的 `inject` 定为 `tools`、`subagents`、`sessionQuery`，设计文档 §3.3 复述了同一份清单。当时把它当硬依赖是顺着"历史读取以 `sessionQuery` 为后端"推下来的，没有单独验证过 Cordis 对注入缺失的语义。

那个语义和本工具的契约直接冲突：

- Cordis 里 `inject` 声明的是**硬依赖**。注入的服务缺失时 fiber 保持 inactive，`apply()` 根本不会跑；服务被 dispose 时 fiber 也被卸载。
- 设计 §10.2 要求"如果 `sessionQuery` 或 persistence 不可用，返回明确 unsupported"。
- 两条同时成立时，§10.2 无法满足：工具压根没注册，模型看到的是"没有这个工具"，而不是"这个能力在本 profile 不可用"。

实测（真实 Cordis 装配，`0.2.1-rc.3`）：`pstack_history` 在缺 `sessionQuery` 的 profile 里不注册；`sessionQuery.dispose()` 之后工具从工具表消失，而不是返回 `unavailable`。于是 `MISSING_SESSION_QUERY` 那条分支只有手搓 `HistoryRuntime` 才走得到——`tests/history.test.ts` 当时正是那么驱动的，所以真实行为从未被验证。

## 决定

1. `src/history.ts` 的 `inject` 是 `["tools", "subagents"]`。`sessionQuery` 不在其中。
2. 每次调用用 `ctx.get("sessionQuery")` 读取——rc.3 的可选服务形式，服务缺失时返回 `undefined` 而不抛。服务在插件加载之后挂载、或被 dispose，都在下一次调用被观察到。
3. `PstackHistoryHost` 不带 `sessionQuery` 字段。留一个 `apply` 不读的类型字段，会让调用方以为可以传。
4. 工具在缺服务时**注册成功**，调用返回 `kind: "unavailable"`、`code: "service-unavailable"`。
5. 验收用真实装配，不用手搓 runtime：`tests/plugin-wiring.test.ts` 有不提供 `sessionQuery` 的场景，断言该行挂载、工具注册、调用返回 `unavailable`，且无服务冲突日志。

## 备选方案

- 保持硬依赖（原决定）。放弃：§10.2 的 unsupported 要求无法满足，缺服务的 profile 里模型完全看不到这个能力。
- 保持硬依赖，同时把 §10.2 改成"缺服务即不提供该能力"。放弃：那是改文档迁就实现，而且"没有这个工具"对模型是更差的降级——它无法区分"本 profile 没装"与"这个能力不存在"。
- 让 `sessionQuery` 进 `inject`，但在 `apply` 里捕获读取异常并注册一个降级工具。放弃：`inject` 缺失时 `apply` 不会被调用，捕获不到任何东西。
- 把 `sessionQuery` 留在 `inject`，另注册一条不依赖它的降级行。放弃：两行同时存在时谁提供 `pstack_history` 取决于加载顺序，会出现重复注册或不确定性。

## 后果

缺 `sessionQuery` 的 profile 里 `/reflect` 之类的流程现在能得到"本 profile 不可用，原因是 service-unavailable"，而不是猜工具不存在。服务的挂载与卸载都成为可观察事件，而不是让整行跟着消失。

代价有两处：

- 服务缺失不再是启动期就能发现的问题，而是第一次调用才暴露。所以必须有真实装配测试；只测纯函数会退回到"手搓 runtime，分支可达但真实行为未验证"的老状态。
- `src/history.ts` 用 `ctx.get(...)` 读服务，这个形式依赖 rc.3 的 `Context` 行为。DSH 升级时要重核 `ctx.get` 的存在与语义，与 `src/host-contract.ts` 一起当成必查项。

若将来 DSH 提供"服务缺失才降级注册"的一等机制，应新写一条记录取代本记录，而不是让两套机制并存。
