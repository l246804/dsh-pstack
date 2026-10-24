# 决定：当前版本禁止与 Agent Team 同时启用

Status: accepted
Date: 2026-10-24

## 背景

Agent Team bundle 会禁用顶层的 `tool-subagent`、`tool-subagent-fork`、`tool-subagent-control` 和 `tool-subagent-list-agents`，再插入 Team 服务、Team 工具和 Web UI。证据在 `@deepseek-ai/dsh-experimental-agent-team-profile/cordis.patch.yml:4-14,16-32`。

standard preset 自己在 `preset-standard` 的插件列表里又挂了一套委派工具，见 `@deepseek-ai/dsh-web-app/presets/standard.patch.yml:89-109`。所以 `subagent` 和 `subagent_fork` 在标准会话里仍然可见。Team 的 `send_message`、`interrupt_agent`、`list_agents` 注册在队友作用域，同名时遮蔽旧控制工具，见 `@deepseek-ai/dsh-experimental-tool-agent-team/lib/index.js:538-545`。根会话是默认 Lead，因此这三个名字在标准会话里也指向 Team 成员，而不是任意子代理。

这会带来三个实际问题。Lead 不能用这三个工具 steer、列出或中断普通的 pstack 子代理。Team 队友和 pstack 子代理共享 `maxActiveSubagents` 池，队友占满后 pstack 派发会因容量失败。Team 的策略鼓励 `spawn_teammate`，pstack 技能要求 `pstack_subagent`，两者在提示词层面竞争派发入口。

`pstack_subagent` 的角色路由和 reasoning effort 计算本身不受影响。它每次调用读取角色文件，把 `provider`、`model`、`reasoningEffort` 放进 `agentOptions` 传给 `ctx.subagents.startActivation`。Team 不替换这个工具，也不改写这条调用。证据在已安装的 `dsh-pstack/dist/subagent.mjs:96-113,313-319,396-411`。但工具面和容量的冲突仍然让这个组合不可支持。

## 决定

当前版本禁止 `dsh-pstack` 与 Agent Team 在同一个 profile 中同时启用。需要的用户应使用两个独立 profile。

这是一条操作和文档约束，不加运行时检测，也不改包、patch 或工具实现。插件继续在未启用 Agent Team 的 profile 中正常工作。不得因为本决定增加启动检查、拒绝安装或自动禁用其他插件。

最终 README 必须保留下面的警告，直到本记录被新的决策取代。中文和英文各一份，README 按其正文语言选用，另一种可以并列保留。

```markdown
> **兼容性警告**
>
> 当前版本禁止与 Agent Team 同时启用。Agent Team 会用同名工具遮蔽 `send_message`、`interrupt_agent` 和 `list_agents`，pstack 无法再用它们 steer、列出或中断自己的子代理。两者还共享子代理激活容量。`pstack_subagent` 的角色路由和 reasoning effort 计算本身不受影响，但同一 profile 中的 Team 工具会改变可见工具面。
>
> 需要同时使用时，请使用两个独立 profile。
```

```markdown
> **Compatibility warning**
>
> This version must not be enabled together with Agent Team. Agent Team shadows `send_message`, `interrupt_agent`, and `list_agents` with Team-scoped tools, so pstack can no longer use them to steer, list, or interrupt its own subagents. Both also share the subagent activation capacity. `pstack_subagent` role routing and reasoning-effort resolution are unaffected, but the Team tools change the visible tool surface in the same profile.
>
> Use separate profiles if you need both.
```

## 备选方案

- 在运行时检测 Agent Team 并拒绝启动。放弃，因为这次明确不要求影响实现，而且 preset 作用域和加载顺序会让检测变得脆弱。
- 由 pstack 自动禁用 Team 的同名工具。放弃，因为那些工具不属于 pstack，跨插件改写会制造新的加载顺序问题。
- 给 pstack 的控制能力换一组新名字，继续支持同启。留到后续版本。它需要 pstack 自己实现 steer、list、interrupt，并为 Team 共存增加真实调用测试。
- 不做任何限制，只在文档里写注意事项。放弃，因为用户会在不知情时遇到控制工具失效和容量争用。

## 后果

用户不能在同一 profile 中同时使用 pstack 和 Agent Team。需要两者的人要维护两个 profile，切换成本明确但可预期。

`pstack_subagent` 的派发和角色 effort 解析在技术上仍可工作，但本决定不承诺这个组合可用。即使两者同时启用后部分流程能跑，控制工具、容量和提示词竞争仍会让结果不稳定。

最终 README 的警告是本决定的一部分。实现 README 时不能删除或弱化它。等 Agent Team 提供兼容 seam，或者 pstack 拥有自己的子代理控制工具并通过共存测试后，新写一条决策记录取代本记录，再移除警告。
