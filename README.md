# dsh-pstack

pstack 的 DeepSeek Harness 移植。当前处于设计阶段，插件实现尚未开始。设计与实施顺序见 [docs/pstack-dsh-port-development-design.md](docs/pstack-dsh-port-development-design.md)。

## 兼容性

> **兼容性警告**
>
> 当前版本禁止与 Agent Team 同时启用。Agent Team 会用同名工具遮蔽 `send_message`、`interrupt_agent` 和 `list_agents`，pstack 无法再用它们 steer、列出或中断自己的子代理。两者还共享子代理激活容量。`pstack_subagent` 的角色路由和 reasoning effort 计算本身不受影响，但同一 profile 中的 Team 工具会改变可见工具面。
>
> 需要同时使用时，请使用两个独立 profile。

决策记录见 [docs/decisions/2026-10-24-no-agent-team-coexistence.md](docs/decisions/2026-10-24-no-agent-team-coexistence.md)。

## 状态

- 目前只有设计文档、决策记录和上游核对脚本。
- 插件实现、构建、安装、真实模型调用和 GUI 渲染尚未完成。
- `make-bot-ui` 不在首版范围内，原因见设计文档 §6.15。
- 上游固定版本和核对方法见设计文档 §1.1。

## 开发

```bash
node scripts/check-upstream-tree.mjs
```

脚本比较 `upstream/cursor-plugins/pstack/skills` 与 Claude Code 镜像，预期 134 个原始文件和 134 个镜像文件、111 个逐字节相同、23 个仅加适配导读、0 个其他变化。
