# 决策：子代理路由授权由插件自己的委派工具承担

Status: accepted
Date: 2026-11-25
Scope: src/subagent.ts, src/surface.json, src/dsh.md, src/dsh.zh.md, src/tests/**, docs/decisions/**
Implemented-by: commit:66e7cd2a7bac47e09a36ad3216631c987530be54
Review: 2026-11-25

## 背景

DSH 从 0.2.2-rc.3 起给子代理的显式模型选择加了 Host 授权门。设置 `subagent-model-selection` 默认关闭，关闭时模型只能把子代理委派到父级当前路由，开启后也只允许 `allowedModels` 列出的路由。这个门属于宿主，模型侧没有开关入口，用户要在设置界面手动开一次。

pstack 的工作流要求按角色给出不同模型路由，评审、竞赛与多厂商评判依赖同一个会话里同时存在多个路由。把这件事交给 Host 门，意味着用户得先改一个与 pstack 无关的全局设置，才能用上插件宣称的能力。

## 决策

`pstack_subagent` 自己承担路由授权，不继承 Host 的 `subagent-model-selection` 门：它把 `provider`、`model`、`reasoning_effort` 直接写进激活请求的 `agentOptions`，而 `ctx.subagents.startActivation` 的服务层不校验允许列表。

## 替代方案

**遵守 Host 允许列表，设置开启时把 `provider`/`model` 限制到 `allowedRoutes()`。** 被否决。门默认关闭，遵守它等于在默认配置下交不出跨路由委派，与插件存在理由冲突；Host 设置是全局的，PTC 等与 pstack 无关的用例会被同一个开关挡住。

**直接复用 `@deepseek-ai/dsh-tool-subagent` 并打开 `modelSelection`。** 被否决。该包只导出 `name`、`inject`、`Config` 和 `apply`，工具定义在 `apply` 内部现造，没有可包装的工厂；而且它的路由选择仍走 Host 门，差距不解。

## 后果

- 跨路由委派在默认配置下就能用，不需要先改 Host 设置。
- 部署方无法用 Host 的 `subagent-model-selection` 统一限制本插件的委派，要限制只能靠角色文件或卸掉插件。这是有意的取舍。
- `pstack_subagent` 的工具契约由本仓维护，上游 `subagent` 的参数与行为变化不会自动传导过来，检查方式见 [../../src/docs/dsh-tool-adapters.md](../../src/docs/dsh-tool-adapters.md)。
- 评审再问「为什么不遵守 Host 授权门」，以本条为准。
- 相关记录：[2026-11-25-poteto-fences-only-replaced-tools.md](./2026-11-25-poteto-fences-only-replaced-tools.md) 定 deny 清单的入列判据；[2026-11-16-structured-role-routes.md](./2026-11-16-structured-role-routes.md) 管路由的存储形状；[2026-11-07-official-contract-types.md](./2026-11-07-official-contract-types.md) 把委派计划与结果、工具 schema 列为本仓自有结构。
