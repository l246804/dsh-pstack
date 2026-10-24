# dsh-pstack

<img src="icon.svg" alt="pstack logo" width="96" height="96">

pstack 的 DeepSeek Harness 移植。它把 Cursor pstack 的技能、playbook、原则和角色化子代理工作流带到 DSH，让严格工程流程可以在 DSH 的 profile、技能和子代理体系里运行。

当前状态：设计阶段。插件实现、构建、安装验证、真实模型调用和 GUI 渲染尚未完成。本文描述发布目标，未完成的能力在“功能范围与已知限制”中标明。

## 目录

- [简介](#简介)
- [支持的 DSH 版本](#支持的-dsh-版本)
- [实现原理](#实现原理)
- [必要依赖](#必要依赖)
- [与 Agent Team 的兼容性](#与-agent-team-的兼容性)
- [安装](#安装)
- [快速开始](#快速开始)
- [角色配置](#角色配置)
- [功能范围与已知限制](#功能范围与已知限制)
- [更新与卸载](#更新与卸载)
- [平台与运行要求](#平台与运行要求)
- [安全与数据](#安全与数据)
- [故障排查与支持](#故障排查与支持)
- [许可证与上游归属](#许可证与上游归属)

## 简介

pstack 是一套以严格工程流程为核心的代理工作流。它用技能、playbook、原则和角色化子代理约束代理的行为，重点是写出更少但更可靠的代码，并且每个结论都能追溯到证据。

dsh-pstack 把这些工作流移植到 DSH。安装后可以用 `/poteto-mode` 启动一次严谨任务，用 `/setup-pstack` 配置不同角色使用的模型和推理预算，用 `/poteto-help` 选择技能或排查用法。

## 支持的 DSH 版本

| DSH 版本 | 状态 |
|---|---|
| `0.2.1-rc.3` | 设计基线，发布前完成实机验证 |
| `0.2.x` | 目标兼容范围，最终以发布包的 `engines.dsh` 为准 |
| `0.3.x` 及以上 | 未验证，不承诺兼容 |

发布包会在 `engines.dsh` 中声明实际支持范围。DSH 升级到范围外版本时，先查看发布说明，不要直接覆盖安装。

## 实现原理

上游 pstack 对 Claude Code 的适配不是逐篇改写技能。它保留技能原文，生成独立的宿主资产，再用一份宿主适配说明处理工具、路径、模型和不可用能力的差异。

dsh-pstack 沿用这个思路。上游技能是内容源，DSH 专用资产单独生成，宿主差异集中说明。这样上游更新可以持续同步，DSH 特有的行为不会散落在每个技能里。具体实现和目录结构留在设计文档，不写进 README。

## 必要依赖

- **worktree 插件。** 并行写入和隔离工作目录需要它。dsh-pstack 在 worktree 未启用时自动启用它，已经启用时不会重复启用。
- **DSH 的 skills 和 subagents 能力。** 由支持的 DSH 版本提供。
- **Node.js `>=22.19`。**
- **Git。** worktree 功能需要 Git 仓库。

worktree 只隔离工作目录和分支，不提供 VM、网络、凭据或端口隔离。需要独立机器或云端执行时，worktree 不是替代品。

## 与 Agent Team 的兼容性

> **兼容性警告**
>
> 当前版本禁止与 Agent Team 同时启用。Agent Team 会用同名工具遮蔽 `send_message`、`interrupt_agent` 和 `list_agents`，pstack 无法再用它们 steer、列出或中断自己的子代理。两者还共享子代理激活容量。`pstack_subagent` 的角色路由和 reasoning effort 计算本身不受影响，但同一 profile 中的 Team 工具会改变可见工具面。
>
> 需要同时使用时，请使用两个独立 profile。

决策记录见 [docs/decisions/2026-10-24-no-agent-team-coexistence.md](docs/decisions/2026-10-24-no-agent-team-coexistence.md)。

## 安装

插件计划以 npm 包 `dsh-pstack` 发布。发布后安装命令如下，`<profile>` 换成目标 profile，例如 `web`。

```bash
dsh plugin --profile <profile> add dsh-pstack
```

安装会启用 bundle。如果 DSH 提示需要重启，按提示操作。包名、版本和命令以正式发布为准。

## 快速开始

1. 安装插件并进入目标 profile。
2. 运行 `/setup-pstack`，选择推理预算和每个角色的模型。
3. 用 `/poteto-mode` 加任务开始一次严谨工作流。
4. 不确定用哪个技能时，运行 `/poteto-help`。

`/poteto-mode` 会匹配 playbook，把步骤写进 todo，并按需要读取其他技能。它不是每个任务都必须使用，小改动可以直接做。

## 角色配置

`/setup-pstack` 写入 `~/.dsh/pstack-models.md`。文件里一行一个角色，值可以是 `inherit-parent` 或具体的 `provider/model` 加推理档位。

- `inherit-parent` 表示该角色使用父会话的模型和推理档位。
- panel 角色是列表，列表里每一项会启动一个子代理。
- 删除某个角色的行，该角色回落到父路由。
- 重新运行 `/setup-pstack` 可以更新配置，重复执行不会叠加旧值。

模型是否可用以当前 DSH 的 provider 和模型列表为准。不要写没有确认过的模型。

## 功能范围与已知限制

- 首版包含 55 个技能、23 个 playbook、24 个原则和两个子代理人格。
- `make-bot-ui` 不在首版。它依赖 Cursor 的 webhook routine 和 secret request，DSH 没有等价闭环。
- Cursor 专属能力没有等价物，包括 Automations、cloud agents、Custom Modes、`/loop` 和 Bugbot 配置。遇到这些步骤时，技能会说明不支持，不会伪造替代。
- `typescript-best-practices` 的 `paths` 自动触发不支持。需要时显式调用 `/typescript-best-practices`。
- worktree 只隔离工作目录，不是 VM。schedule 是定时提醒，不是事件订阅。
- 多模型评审需要配置真实不同的 route。只有同一 route 时，评审会如实标为同模型复核。
- 子代理和 panel 会增加 token 消耗。只对需要严谨流程的任务使用 `/poteto-mode`。
- 当前没有上游 pstack 之外的额外技能。

## 更新与卸载

升级到最新版本：

```bash
dsh plugin --profile <profile> add dsh-pstack@latest
```

卸载：

```bash
dsh plugin --profile <profile> remove dsh-pstack
```

角色文件在用户目录，卸载插件不会自动处理它。如果不再使用，可以自行删除 `~/.dsh/pstack-models.md`。升级或卸载后按 DSH 提示重启会话。

## 平台与运行要求

- Linux 和 macOS 是主要验证目标。
- Windows 的 shell 和脚本支持尚未验证。
- Node.js 要求 `>=22.19`。
- worktree 需要 Git 仓库和可用的 Git 命令。
- DSH 版本要求在“支持的 DSH 版本”表中列出。

## 安全与数据

- 代理会在 DSH 的权限模型下读写文件、执行命令。子代理继承调用方的策略和权限边界。
- 需要审批的操作会按 DSH 的配置请求确认。不要在无人值守任务中放宽你不理解的权限。
- 不要把 API key、token 或密码写进角色文件、prompt 或仓库。
- 会话记录保存在 DSH 的会话存储中，pstack 不另建云端记录。
- 上游技能可能要求访问网络或代码托管平台。是否允许由 DSH 的审批和沙箱配置决定。

## 故障排查与支持

遇到问题时按这个顺序检查。

1. 确认 DSH 版本在支持范围内。
2. 确认 worktree 插件可用。必要时先手动启用一次，再重试需要隔离目录的任务。
3. 确认当前 profile 没有同时启用 Agent Team。
4. 运行 `/setup-pstack` 检查角色配置，确认没有写错模型或推理档位。
5. 如果问题仍然存在，在 [GitHub Issues](https://github.com/l246804/dsh-pstack/issues) 提交，附上 DSH 版本、profile 名、复现步骤和错误信息。不要贴密钥或完整的私有会话内容。

## 许可证与上游归属

本包使用 MIT 许可证，见 [LICENSE](LICENSE)。

上游 pstack 版权归 Lauren Tan，使用 MIT 许可证。技能、playbook 和代理文本来自 [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)。
