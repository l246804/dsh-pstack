# 决策：poteto 模式只 deny 被本插件替代的委派工具

Status: proposed
Date: 2026-11-25
Scope: src/poteto-toggle.ts, src/subagent.ts, src/dsh.md, src/dsh.zh.md, src/tests/**, docs/decisions/**
Implemented-by: -
Review: 2026-11-25

## 背景

poteto 模式打开时，`src/poteto-toggle.ts` 会 deny 一批原生委派工具，把模型导向 `pstack_subagent`。当前清单是 `subagent` 与 `subagent_fork`。

DSH 0.2.3-alpha.2 的 Web 组合还挂着一个委派工具 `workflow`，它跑模型写的 JavaScript，脚本里可以给每个 child 指定 `provider` 和 `model`，同样能绕开角色路由。这类工具该不该进 deny 清单，现在没有成文判据，每次基线升级或评审都要重开一次。`ralph` 属于同类，它是可选 bundle，不在 standard、cordis、ptc 三份预设内。

## 决策

deny 清单只收「被本插件替代的那个动作」。判据两条，缺一不可：原生工具执行的动作与 `pstack_subagent` 相同，且插件内有对应的替代路径。

按此判据，`subagent` 与 `subagent_fork` 在列。`workflow` 与 `ralph` 不在列，它们的路由确实不受角色文件约束，但插件没有等价的脚本编排替代物，deny 只会让模型少一个能力，不会把它导向插件路径。

## 替代方案

**把 `workflow` 一并 deny，理由是它也能绕开角色路由。** 被否决。判据第二条不成立；而且它属于三份预设的 delegation 装配，deny 会让开着 poteto 的 PTC 会话一起失去扇出。路由纪律靠调用方读角色文件，不靠没收工具。

**只 deny `subagent`，保留 `subagent_fork`。** 被否决。两者是同一动作的两种上下文继承形态，`pstack_subagent` 的 `agent_preset` 已经覆盖 fork 的用途，留下它等于留一条不经过插件契约的委派路径。

## 后果

- poteto 模式打开时模型仍可用 `workflow`，其 child 不受角色路由约束。这是有意的能力保留。
- 以后新增原生委派工具时按这两条判据决定是否入列，不必重开讨论。
- 相关记录：[2026-11-25-plugin-owned-delegation-authority.md](./2026-11-25-plugin-owned-delegation-authority.md) 说明为什么插件自己承担授权。
