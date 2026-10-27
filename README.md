# dsh-pstack

<img src="static/icon.png" alt="pstack logo" width="96" height="96">

pstack 的 DeepSeek Harness 移植。它把 Cursor pstack 的技能、playbook、原则和角色化子代理工作流带到 DSH。

安装后，`/poteto-mode` 启动一次严谨任务，`/setup-pstack` 配置各角色使用的模型和推理预算，`/poteto-help` 帮助选择技能或排查用法。

## 支持的 DSH 版本

支持 `0.2.1-rc.3`。安装包在 `engines.dsh` 声明支持的 DSH 版本，其他版本未经验证。新版本验证通过后补充到本节。

## 实现原理

上游 pstack 对 Claude Code 的适配保留技能原文，生成独立的宿主资产，再用一份宿主适配说明处理工具、路径、模型和能力差异。

dsh-pstack 沿用这个思路。上游技能是内容源，DSH 专用资产单独生成，宿主差异集中说明。上游更新可以持续同步，DSH 特有的行为不会散落在每个技能里。

## 必要依赖

- worktree 插件。并行写入和隔离工作目录需要它。未启用时插件自动启用，已启用时不会重复启用。
- DSH 的 skills 和 subagents 能力，由支持的 DSH 版本提供。
- Node.js `>=22.19`。仅 npm CLI 部署需要它出现在 `PATH` 上；Desktop（Electron）部署走 Host 自己的运行时。
- Git。worktree 需要 Git 仓库。

随包的编排、PR watcher、计划检查、worktree 审计和决策日志脚本已构建为单文件 Node 产物，依赖全部内联。运行时通过 `pstack_script` 工具以宿主进程启动它们，因此**不需要 Bun，也不需要 bash，更不需要安装任何依赖**。Desktop 用户不在 `PATH` 上放 `node` 也能用：工具用 Electron 自带的 Node 运行时执行，并在需要时自动附加 `ELECTRON_RUN_AS_NODE`。脚本从**会话目录**启动，所以参数里的相对路径落在当前工作区或 worktree 内。

`pstack_script` 直接 `spawn` 子进程，因此**不经过命令审批，也不受 DSH 的 sandbox policy 约束**：它只能执行本包随附、由封闭 `id` 枚举选中的脚本，但脚本实际读了什么、写了哪里，Host 不会拦。这是为了在没有 `PATH` `node` 的部署里仍能运行为此付出的代价。需要审批与沙箱约束的命令请用 DSH 自己的 bash 工具。

worktree 只隔离工作目录和分支，不提供 VM、网络、凭据或端口隔离。需要独立机器或云端执行时，worktree 不是替代品。

Linux 和 macOS 是主要验证目标，Windows 未在实机验证。脚本本身已不含 shell 依赖，但 Windows 上的真实行为仍未验收。

## 与 Agent Team 的兼容性

> **兼容性警告**
>
> 当前版本禁止与 Agent Team 同时启用。Agent Team 会用同名工具遮蔽 `send_message`、`interrupt_agent` 和 `list_agents`，pstack 无法再用它们 steer、列出或中断自己的子代理。两者还共享子代理激活容量。`pstack_subagent` 的角色路由和 reasoning effort 计算本身不受影响，但同一 profile 中的 Team 工具会改变可见工具面。
>
> 需要同时使用时，请使用两个独立 profile。

决策记录见 [docs/decisions/2026-10-24-no-agent-team-coexistence.md](https://github.com/l246804/dsh-pstack/blob/main/docs/decisions/2026-10-24-no-agent-team-coexistence.md)：`docs/` 不在发布包的文件清单里，所以这里用绝对 URL，避免 npm 页面上的相对链接指向不存在的路径。

## 安装

通过 npm 包 `dsh-pstack` 安装。`<profile>` 换成目标 profile，例如 `web`。

```bash
dsh plugin --profile <profile> add dsh-pstack
```

安装会启用 bundle。DSH 提示重启时按提示操作。

## 快速开始

1. 安装插件，进入目标 profile。
2. 运行 `/setup-pstack`，选择推理预算和每个角色的模型。
3. 用 `/poteto-mode` 加任务开始一次严谨工作流。
4. 不确定用哪个技能时，运行 `/poteto-help`。

`/poteto-mode` 会匹配 playbook，把步骤写进 todo，并按需读取其他技能。小改动可以直接做，不必使用它。

## 角色配置

`/setup-pstack` 写入 `$DSH_HOME/pstack-models.md`，一行一个角色。`$DSH_HOME` 是 DSH 的用户目录。值可以是 `inherit-parent`，也可以是 `provider/model` 加推理档位。

- `inherit-parent` 使用父会话的模型和推理档位。
- panel 角色的值是列表，每一项启动一个子代理。
- 删除某个角色的行，该角色回落到父路由。
- 重新运行 `/setup-pstack` 会更新配置，不会叠加旧值。

模型必须出现在当前 DSH 的 provider 和模型列表中。

### 推理档位

角色行里的档位是那个角色**起步**用的档位。实际档位随任务难度双向浮动：

- 调用 `pstack_subagent` 时传 `reasoningEffort`，覆盖本次派发中每个 panel 项的档位。难任务调高，机械活调低。
- 子代理自己可以调 `set_reasoning_effort`，从下一步生效，已在飞行中的请求不受影响。

合法档位由目标模型自己广告。本包不假设通用阶梯，所以参数是自由字符串而不是枚举。值不被支持时，调用在启动任何子代理**之前**失败，并在错误里列出该模型真实支持的档位。panel 中任一项不支持时整次失败，不会只启动一半。


## 功能范围与已知限制

包含 55 个 pstack 技能、23 个 playbook、24 个原则和两个子代理人格，另加 `assets/skills-ext/` 下按来源分目录存放的第三方技能。

### 第三方技能与同名冲突

`assets/skills-ext/<来源>/<技能>/` 存放移植自外部仓库的技能，每个来源在 `scripts/skills-ext/sources.yml` 里记录仓库地址、许可证和固定提交号。

**同名技能以你那一侧为准，本包的会被遮蔽。** DSH 按 rank 从小到大取第一个同名技能。本包提供的 rank 是 600，项目内技能是 100（`.dsh/skills/`）和 200（`AGENTS.md`），用户级是 400 和 500。所以你在项目里放一个同名技能，它会盖掉本包的那个，本包版本不会被调用，也不会报错。同理，你自己写的 `writing-for-agents` 会盖掉本包随附的那份。

这个顺序是有意的：项目里的决定应当压过包里的默认值。副作用是冲突很安静，所以升级后行为变了，先查技能目录里有没有同名项。要让本包版本生效，删掉或重命名你那一份。

本包内部的两个树不允许同名：`assets/skills/` 与 `assets/skills-ext/` 出现同一个名字会让插件启动失败，而不是让其中一个悄悄胜出。

- `make-bot-ui` 不在支持范围。它依赖 Cursor 的 webhook routine 和 secret request，DSH 没有等价闭环。
- Cursor 专属能力没有等价物，包括 Automations、cloud agents、Custom Modes 和 Bugbot 配置。相关技能会在需要它们的步骤说明不支持，不伪造替代。
- `/loop` 没有同名命令，也没有事件订阅，属于降级映射。能覆盖的是目标与定时输入：`create_goal` 记录目标和相位，`schedule_create` 只能作定时心跳，它把一条消息投回创建它的会话，不能盯着 PR 或 CI，子代理也无法自己布置。不能覆盖的是事件唤醒和云端存活：goal 不会自己感知外部事件，自动续跑还取决于 profile 是否挂载 goal round driver，未挂载时长时间任务只是同一个会话里被监督的运行。
- `typescript-best-practices` 的 `paths` 自动触发不支持，需要时显式调用 `/typescript-best-practices`。
- 跨会话检索需要手动启用官方的 Session search bundle。`recall` 和 `automate-me` 都要跨多个既往会话工作，而 `pstack_history` 只能读调用者自己与直接子会话。未启用时这两个技能仍在当前会话范围内工作，并应把跨会话那一半报为不可用。本包不代你启用它，因为它会给每个 agent 增加五个全局工具，并让已存在会话缓存的请求前缀失效一次。
- worktree 只隔离工作目录，不是 VM。schedule 是定时提醒，不是事件订阅。
- 多模型评审需要配置真实不同的 route。只有同一 route 时，评审会标为同模型复核。
- 子代理和 panel 会增加 token 消耗，只在需要严谨流程的任务上使用 `/poteto-mode`。

## 更新与卸载

升级：

```bash
dsh plugin --profile <profile> add dsh-pstack@latest
```

卸载：

```bash
dsh plugin --profile <profile> remove dsh-pstack
```

角色文件在 DSH 用户目录，卸载不会删除它。不再使用时自行删除 `$DSH_HOME/pstack-models.md`。升级或卸载后按 DSH 提示重启会话。

## 安全与数据

- 代理在 DSH 权限模型下读写文件、执行命令，子代理继承调用方的策略和权限边界。
- 需要审批的操作按 DSH 配置请求确认。不要在无人值守任务中放宽不理解的权限。
- 不要把 API key、token 或密码写进角色文件、prompt 或仓库。
- 会话记录保存在 DSH 的会话存储中，pstack 不另建云端记录。
- 上游技能可能要求访问网络或代码托管平台。是否允许由 DSH 的审批和沙箱配置决定。

## 故障排查

按顺序检查。

1. 确认 DSH 版本在支持范围内。
2. 确认 worktree 插件可用，必要时先手动启用一次。
3. 确认当前 profile 没有同时启用 Agent Team。
4. 运行 `/setup-pstack` 检查角色配置。
5. 仍有问题时在 [GitHub Issues](https://github.com/l246804/dsh-pstack/issues) 提交，附 DSH 版本、profile 名、复现步骤和错误信息。不要贴密钥或私有会话内容。

## 许可证与上游归属

MIT，见 [LICENSE](LICENSE)。

上游 pstack 版权归 Lauren Tan，使用 MIT 许可证。技能、playbook 和代理文本来自 [cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)。
