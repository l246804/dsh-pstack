# dsh-pstack

[English](README.md) | [简体中文](README.zh.md)

pstack 的 DeepSeek Harness 移植版。它移植了
[`cursor/plugins/pstack`](https://github.com/cursor/plugins/tree/main/pstack)
的技能，并提供原生委派工具。

## 插件做什么

- 注册 55 个 pstack 技能，包括 `/poteto-mode` 和 24 个 `principle-*` 规则。
- 用 `/poteto-mode` 把任务路由到上游 playbook：调查、设计、实现、验证、审查和交付。
- 提供 `pstack_subagent`。它从 `~/.dsh/pstack-models.md` 解析角色路由，附上 pstack agent 指令，并通过 `ctx.subagents` 启动后台子会话。
- 把 `arena runners`、`architect runners` 和 `interrogate reviewers` 展开为每个条目一个子会话。
- 依赖 DSH worktree 插件，并在官方 bundle 不存在时自动挂载它。

## 安装

```bash
dsh plugin --profile web add dsh-pstack
```

从本地 checkout 安装：

```bash
pnpm install
pnpm run build
dsh plugin --profile web add .
```

安装后重启 `dsh web`。

### bundle 行

bundle patch 声明四行：

| 行                     | 作用                                           |
| ---------------------- | ---------------------------------------------- |
| `pstack`               | 注册技能 provider 和 55 个技能。               |
| `pstack-worktree`      | 官方 bundle 不存在时，挂载 DSH worktree 服务。 |
| `pstack-tool-worktree` | 官方 bundle 不存在时，挂载 `create_worktree`。 |
| `pstack-subagent`      | 注册 `pstack_subagent`，带 `maxDepth: 2` cap。 |

当 `@deepseek-ai/dsh-experimental-tool-worktree` 已经启用时，pstack 的两行 worktree 配置保持 disabled，复用官方行。worktree 插件是本包的 peer dependency。

不启动会话，只验证配置：

```bash
dsh --profile web --dump-config | grep -A2 'pstack'
```

## 快速开始

描述目标和检查条件：

```text
/poteto-mode add a --json flag to this command. text output stays byte-identical. verify both.
```

`/poteto-mode` 会选择一个 playbook，并打开 todo 列表，前几项就是该 playbook 的步骤。技能也可以直接调用：`/how`、`/why`、`/architect`、`/arena`、`/swarm`、`/interrogate`、`/tdd`、`/no-comments`、`/unslop`、`/technical-writing`、`/sharpen`、`/teach`，以及 24 个 `principle-*` 规则。

## worktree 依赖

pstack 需要 DSH worktree 插件。官方 `@deepseek-ai/dsh-experimental-tool-worktree` bundle 不在 profile 中时，本 bundle 会挂载 `pstack-worktree` 和 `pstack-tool-worktree`；已经在时，pstack 直接复用官方行。

`create_worktree` 会创建本地 Git worktree，切换调用会话的工作目录，并返回 checkout 路径和分支。它不会 fetch、merge 或 cleanup。worktree 只隔离 checkout，不隔离机器或运行时。pstack 假设这个插件已启用；如果无法启用，并行写手的 playbook 不受支持。pstack 不提供手写 `git worktree` 的 fallback。

## 委派

`pstack_subagent` 是唯一的委派入口：

```text
pstack_subagent(
  description: "port the retry helper",
  prompt: "Port src/retry.ts ... prove it with pnpm test retry",
  agent: "poteto-agent",
  role: "feature, refactoring",
)
```

| 参数                    | 含义                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `description`、`prompt` | 短标签和自包含任务。子会话不共享当前对话。                                              |
| `agent`                 | `poteto-agent`（默认）、`general` 或 `comment-sicko`。这是提示词前导，不是 DSH preset。 |
| `role`、`roleIndex`     | `~/.dsh/pstack-models.md` 中的一行，或从多值角色中选择一个零基条目。                    |
| `cwd`                   | 子会话的初始工作目录。                                                                  |
| `agentPreset`           | 只有 `pstack-subagent` 行配置了 `allowedAgentPresets` 时才出现。                        |
| `maxDepth`              | 请求的委派深度，会被钳制到 `pstack-subagent` 的 cap。                                   |

`pstack-subagent` 行还接受 `allowedModels` 和 `allowedAgentPresets`。`allowedModels` 是精确的 `provider/model` 路由列表，角色路由不在列表里会被拒绝。`allowedAgentPresets` 控制模型能否选择 preset。两者都不是工具参数。

调用会立即返回子会话 id，最终答案稍后以完成通知送达。adapter 不提供 child-steering 或 listing 工具。profile 挂载 `@deepseek-ai/dsh-tool-subagent-control` 时，可以使用它的 `send_message` 和 `list_agents` 操作 pstack 子会话；同名的其他工具可能管理的是另一种协作面。

## 角色

`/setup-pstack` 会写入 `~/.dsh/pstack-models.md`。每行一个角色：

```text
# pstack model configuration. One line per role.
# Value: inherit-parent | <provider>/<model> [effort]
feature, refactoring: deepseek-official/deepseek-reasoner high
judgment and prose: inherit-parent
```

没有写出的行继承父会话路由。文件在每次委派时读取，修改后不需要重启。panel 角色会按条目展开为一个子会话；`roleIndex` 可以从另一个多值角色中选择一个条目。

## 与 Cursor 的差异

| Cursor                                           | DSH                                          |
| ------------------------------------------------ | -------------------------------------------- |
| `Task` 工具                                      | `pstack_subagent`                            |
| `subagent_type`                                  | `agent`                                      |
| 模型 slug                                        | `~/.dsh/pstack-models.md` 中的 `role`        |
| `readonly` / `run_in_background` / `environment` | 默认后台运行；在 prompt 里写“不要编辑文件”。 |
| `~/.cursor/rules` / `.cursor/skills/`            | `~/.dsh/pstack-models.md` / `.dsh/skills/`   |

Automations、Bugbot、cloud VM、Custom Modes、`/loop` 和 `cursor-team-kit` 有 DSH 等价物时重映射，否则跳过。`skills/make-bot-ui` 没有移植，因为它依赖 Cursor Automations。

## 文档

- [pstack 指南](assets/docs/guide/README.md)
- [DSH adapter 参考](assets/docs/harness/dsh.md)
- [工作决策](docs/porting/decisions.md)
- [移植策略](docs/porting/README.md)

## 开发

要求：Node 22.19+、pnpm，以及用于内置 watcher 和编排脚本的 Bun。Vite+ 提供构建、测试、lint 和格式化工具链。

```bash
vp install          # 安装依赖
git submodule update --init --depth 1
vp run sync         # 从上游 pstack 重新生成 assets/
vp check            # 格式、lint、类型检查
vp test             # 单元测试
vp pack             # 构建 dist/
```

### 仓库结构

源码在 `src/`，改写规则在 `scripts/adapt.ts`，生成器在 `scripts/sync-upstream.ts`，生成产物在 `assets/`，测试在 `tests/`。

`assets/` 是生成产物，不要手改。修改 `scripts/adapt.ts` 或上游源文件后运行 `vp run sync`。`docs/porting/` 记录了移植策略和工作决策。

## 许可证

MIT。移植技能为 MIT，版权归 Lauren Tan。见 [LICENSE](LICENSE)。
