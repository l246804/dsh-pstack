<div align="center">
  <img src="./assets/logo.png" width="144" alt="dsh-pstack logo" />

  <h1>dsh-pstack</h1>

  <p>
    <strong>把 pstack 的严格代理工作流带进 DeepSeek Harness</strong>
  </p>

  <p><a href="./README.md">English</a> · 中文</p>

  <p>
    <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/v/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm version" /></a>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-%3E%3D0.2.3--alpha.2-1f6feb?style=flat-square" alt="dsh >=0.2.3-alpha.2" /></a>
    <a href="https://github.com/cursor/plugins/tree/main/pstack"><img src="https://img.shields.io/badge/pstack-0.15.43-d97706?style=flat-square" alt="pstack 0.15.43" /></a>
    <a href="https://github.com/l246804/dsh-pstack/blob/main/LICENSE"><img src="https://img.shields.io/github/license/l246804/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="license" /></a>
    <a href="https://dshopen.org/plugins/dsh-pstack/"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fdshopen.org%2Fbadge%2Fdsh-pstack.json%3Flang%3Dzh&style=flat-square" alt="开放插件市场" /></a>
    <a href="https://awesome-dsh-plugin.com"><img src="https://awesome-dsh-plugin.com/badge.svg" alt="Awesome DSH Plugin" /></a>
  </p>

  <table>
    <tr>
      <td align="center"><strong>59</strong><br /><sub>pstack 技能</sub></td>
      <td align="center"><strong>22</strong><br /><sub>playbook</sub></td>
      <td align="center"><strong>4</strong><br /><sub>插件工具</sub></td>
      <td align="center"><strong>3</strong><br /><sub>子代理预设</sub></td>
    </tr>
  </table>

  <p>
    <a href="#quick-start">🚀 快速开始</a> ·
    <a href="#commands">⌨️ 常用命令</a> ·
    <a href="#configuration">🎛️ 配置</a> ·
    <a href="#capabilities">🧩 能力</a> ·
    <a href="#limitations">⚠️ 能力限制</a> ·
    <a href="#compatibility">📦 兼容性</a>
  </p>
</div>

---

`dsh-pstack` 将 [pstack](https://github.com/cursor/plugins/tree/main/pstack) 的规划、实现、审查与验证工作流带到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH），随包提供上游技能、playbook 与参考文档。

- **从任务开始。** 用 `/poteto-mode` 启动完整工作流，或选择技能处理具体任务。
- **按角色选择模型。** 为角色设置提供方、模型和推理强度，也可以继承父会话的路由。
- **协调子代理。** 委派实现、只读研究与审查任务，按需启用智能体团队协作来跟踪共享工作。

真实 DSH Web 会话的验证结果见[移植如何验证](#-移植如何验证)，Cursor 能力到 DSH 的对应关系见[运行时映射](./src/dsh.zh.md)。

<a id="quick-start"></a>

## 🚀 快速开始

> [!IMPORTANT]
> 要求 DSH `>=0.2.3-alpha.2`、Node.js `>=24.22.3`。各发布版本支持的 DSH 范围见[兼容性](#compatibility)。

1. **安装插件。**

   ```sh
   dsh plugin --profile web add dsh-pstack
   ```

   也可以在 Web 或 Desktop 的「插件」页面安装。

2. **重启对应的 profile，或新开一个会话。**

3. **开始一个任务。** 调用 `/poteto-mode`，描述想实现的功能或要修复的问题。用 `/poteto-help` 查看工作流帮助。

可以先沿用父会话的模型。需要按角色分配模型，或让工作流在每轮持续生效时，参见[配置](#configuration)。

<a id="commands"></a>

## ⌨️ 常用命令

| 工作流 | 命令 |
|---|---|
| 帮助 | `/poteto-help` |
| 配置角色模型 | `/setup-pstack` |
| 明确需求 | `/reframe`、`/sharpen` |
| 规划与实现 | `/poteto-mode`、`/architect`、`/arena`、`/swarm` |
| 理解与调查 | `/how`、`/why`、`/teach` |
| 验证 | `/create-verification-skill`、`/statechart` |
| 审查与维护 | `/show-me-your-work`、`/retro`、`/docs-drift` |

<a id="configuration"></a>

## 🎛️ 配置

打开 **插件 → 已安装插件 → pstack 工作流 → 配置**。

<details>
<summary>查看配置入口</summary>

![配置入口](./assets/plugin-configure.png)

</details>

### 工作流开关

| 开关 | 作用 |
|---|---|
| **Poteto 工作流** | 每轮把 `poteto-mode` 规则保留在系统提示里，在除内置极简预设外的任何预设下可用。 |
| **启用智能体团队协作** | 让 `pstack_subagent` 启动团队成员，可在团队任务板上跟踪共享工作。 |

两个开关相互独立，可以同时开启。在模型与推理等级菜单里设置**当前会话**的开关；在配置弹窗的 **通用** 标签页设置**新会话**的默认值。

<details>
<summary>查看开关位置与快捷键设置</summary>

**当前会话**

![会话工作流开关](./assets/session-workflow-switches.png)

**新会话默认值**

在 **通用** 标签页设置 **新会话默认开启** 和 **新会话默认开启智能体团队协作**。

![通用设置](./assets/plugin-general.png)

**快捷键**

在 **设置 → 通用设置 → 快捷键** 中为 **切换 Poteto 工作流** 分配快捷键，即可用键盘切换当前会话的 Poteto 开关。

![切换 Poteto 工作流快捷键](./assets/shortcut-toggle-poteto.png)

</details>

### 角色模型

在 **角色模型** 中为每个角色选择提供方、模型和推理强度，然后保存该行或点击 **全部保存**。也可以通过 **调整预算** 预演并批量应用推理档位。

也可以在会话中运行 `/setup-pstack`，发现可用模型并配置角色。两种方式都保存到 `$DSH_HOME/pstack/models.json`；未配置的角色继承父级路由。

<details>
<summary>查看角色模型设置</summary>

![角色模型](./assets/plugin-roles.png)

</details>

<a id="capabilities"></a>

## 🧩 能力

### 🛠️ 插件工具

以下工具由智能体在工作流中调用；日常使用从[上方命令](#commands)开始即可。

| 工具 | 作用 |
|---|---|
| `pstack_subagent` | 每次调用启动一个子代理，可通过 `agent_preset` 选择预设，或通过 `provider`、`model` 和 `reasoning_effort` 覆盖模型路由。 |
| `pstack_interrupt` | 按 `list_agents` 的名称或会话 id 中断一个 pstack 子代理当前回合。内置预设禁用了原生 `interrupt_agent`，所以这是中断通道。 |
| `pstack_models` | 列出本部署实际提供的提供方、模型和推理档位。 |
| `pstack_roles` | 报告每个角色已配置的路由，以及各路由的可用推理档位和默认值。 |

### 🎭 智能体预设

随包提供三个委派子代理预设。调用 pstack 技能时，无需切换父会话的预设。

| 预设 | 用途 |
|---|---|
| `poteto-agent` | 实现型子代理，注入 pstack 人格和 `poteto-mode` 指令。 |
| `comment-sicko` | 只读评论评审子代理，报告删除目标和 `MUST KILL` 符号。 |
| `readonly` | 带只读沙箱的研究子代理，用于检查和取证。 |

### 📚 额外技能

这些技能为 pstack 补充文档编写、项目维护和证据采集工作流。

| 技能 | 来源 | 使用场景 |
|---|---|---|
| `writing-for-agents` | `vendored` | 编写或评审技能、`AGENTS.md`、`CLAUDE.md` 等智能体文档，覆盖 `create-skill` 的使用场景。 |
| `retro` | `vendored` | 复盘编码会话的智能体环境，改进导航、自动化检查、编码约定、工具效率和信息获取。 |
| `deslop` | `vendored` | 在不改变行为的前提下，清理 diff 中多余的注释、防御性代码、类型断言和嵌套。 |
| `control-ui` | `vendored` | 操作本地 Web、IDE 或 Electron 界面，采集视觉或可访问性证据。 |
| `control-cli` | `vendored` | 操作交互式 CLI 或 TUI，采集终端操作记录或性能证据。 |
| `decision-write` | `authored` | 以可追踪的生命周期记录设计取舍、理由和实现证据。 |
| `decision-audit` | `authored` | 在设计历史累积后，检查记录状态、范围、实现锚点和取代关系。 |
| `setup-project-docs` | `authored` | 为项目建立架构、术语、决策约定和文档指针。 |
| `docs-drift` | `authored` | 巡检持续维护的文档，修复获批的漂移、冗余和无依据表述。 |

vendored 技能的来源与哈希记录在 [`skills/skills-lock.json`](./skills/skills-lock.json)。

## 🔌 可选 DSH 插件

以下插件均为可选项。在配置弹窗的 **推荐插件** 标签页中，**全部启用** 只启用 **推荐** 组（工作树与 PR、历史会话）；其余能力按需单独启用。

<details>
<summary>查看推荐插件设置</summary>

![推荐插件](./assets/plugin-recommended.png)

</details>

| 使用场景 | 插件 | 提供的能力与边界 |
|---|---|---|
| 工作树与 GitHub PR | `@deepseek-ai/dsh-experimental-forge-bundle` | 提供本地工作树和 GitHub PR 工作流。GitHub 状态需要已登录的 `gh`。没有此插件时，通过 `bash` 使用 `gh` 与 `git worktree add`。 |
| 历史会话 | `@deepseek-ai/dsh-experimental-session-search` | 只读检索历史会话与事件，按 `cwd` 完全匹配。是否包含子代理会话记录尚未确认。 |
| 桌面验证 | `@deepseek-ai/dsh-cua-bundle` | 在 macOS PTC 桌面控制会话中控制桌面。Windows 支持尚不完整。 |
| 持久终端 | `@deepseek-ai/dsh-experimental-terminal-bundle` | 为 CLI 和 TUI 验证提供持久终端与 REPL 会话。 |
| 自主循环 | `@deepseek-ai/dsh-experimental-ralph-bundle` | 每轮启动新子代理的前台循环，不是同一会话的常驻循环或事件监听器。 |

也可以通过 **插件 → 添加插件** 启用对应包，必要时重启 profile。以上插件均随 DSH 作为可选插件提供，`@deepseek-ai/dsh-cua-bundle` 仅在 macOS 上运行。额外运行时要求见相应插件或技能的帮助信息。

依赖未启用插件的步骤会标记为已跳过或已阻止，不会标记为通过。安装与回退说明见 [DSH 适配文档](./src/dsh.zh.md)。

## 🧪 移植如何验证

[验证结果](./playground/results/README.md)按场景记录最近实测行为、处理决定和截图，区分原生 DSH 基准与插件适配结果。机械断言与实际行为分别核对，完整运行记录保留在本地。

验证使用真实 DSH Web 会话。行为或判据变化时复核受影响场景，版本变化本身不代表已全量复测。复现步骤见[运行指南](./playground/docs/run.md)，缺口覆盖与回归规则见[场景契约](./playground/docs/scenarios.md)。

<a id="limitations"></a>

## ⚠️ 仍存在的缺口

即使启用所有能与 pstack 共存的可选插件，以下限制仍然存在。

| 领域 | 限制 |
|---|---|
| Cursor 平台服务 | 不支持 Automations、Cursor webhook、`SendToUser`、云代理和持久云端 Projects。 |
| Bugbot | 无法启动、配置或等待 Bugbot。已有的 Bugbot 评论仍可作为 PR 评审处理。 |
| PR 编排 | 没有模型侧变更请求工具，也没有共享的 PR 跟踪面板与记录。`watch-pr` 仍提供 PR 栈判定。 |
| 事件驱动循环 | 不订阅 forge 事件。本地目标、定时任务和事件监听器并非等价替代。 |
| 图表渲染 | 不提供内置渲染器。图表以 Mermaid 文本返回。需要图片时自行用外部工具渲染。 |
| 视频证据 | 没有内置视频渲染、录屏与逐帧验证。项目自带的渲染器只要产出可核对的文件即可使用。否则借助外部录屏或 FFmpeg。 |
| 桌面覆盖 | 桌面操作仅支持 macOS PTC 桌面控制会话，Windows 支持尚不完整。 |
| MCP 发现 | 不会自动发现证据类别，需要显式配置并识别 MCP 工具。 |

## ❓ 常见问题

<details>
<summary><strong>预设名称显示为英文</strong></summary>

在 **设置 → 通用 → 语言** 中把语言切换为中文，然后重启 DSH。语言行可能已经显示中文，因为它跟随浏览器。重新选择一次中文，会写入预设名称在宿主启动时读取的语言偏好。

</details>

<details>
<summary><strong>部分渲染需要插件</strong></summary>

原生 DSH 能内联显示图片和 SVG。Mermaid 图以文本返回，音频或视频只显示文件卡片。可选渲染插件可以扩展这些能力，已验证的行为见[视频内嵌播放验证](./playground/results/inline-video-playback/result.md)。

</details>

<details>
<summary><strong>模型偶尔选错工具或读错路径</strong></summary>

模型选择有概率性。适配文档的措辞和工具边界能降低发生率和恢复成本，但无法消除。重试通常就能恢复。反复出现时，用模型行为报告提交，附上重试结果和出现频率。

</details>

<details>
<summary><strong>升级后旧会话无法加载</strong></summary>

如果错误提到 `poteto/mode` 事件，打开 **配置 → 修复 → 扫描并修复**。扫描会话、选择受影响项并确认加入修复队列，然后重启 DSH 完成修复。

![修复栏](./assets/plugin-repair.png)

</details>

## 📦 兼容性

<a id="compatibility"></a>

下表按支持的 DSH 范围分组，列出各 dsh-pstack 发布版本及其打包的 pstack 版本。

**DSH `>=0.2.2-rc.2`**

| dsh-pstack 发布版本 | pstack 版本 |
|---|---|
| `0.5.2` | `0.15.43` |

**DSH `>=0.2.2-rc.1`**

| dsh-pstack 发布版本 | pstack 版本 |
|---|---|
| `0.4.1` | `0.15.36` |
| `0.3.1` | `0.15.36` |

**DSH `>=0.2.1-rc.5`**

| dsh-pstack 发布版本 | pstack 版本 |
|---|---|
| `0.2.2` | `0.15.36` |

更早的 DSH 基线移到[兼容历史](./docs/compatibility-history.zh.md)。

## 🔗 友情链接

- [LinuxDo - 新的理想型社区](https://linux.do/)

## 🤝 参与贡献

环境、PR 检查、提交与本地化规则、合并要求见 [CONTRIBUTING.zh.md](./CONTRIBUTING.zh.md)。报告问题时请附 DSH 版本、dsh-pstack 版本，以及出问题的命令或会话。

## 💛 鸣谢

- [pstack](https://github.com/cursor/plugins/tree/main/pstack)，由 Lauren Tan 与 Cursor 团队设计并开源，是本项目的工作流基础。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，由 DeepSeek 团队开发，是本插件的运行平台。
- [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit)，是 vendored `deslop`、`control-ui` 与 `control-cli` 技能的来源。
- [mattpocock/skills](https://github.com/mattpocock/skills)，是 vendored `writing-for-agents` 与 `retro` 技能的来源。

本项目是社区移植，不是 Cursor 或 DeepSeek 官方发行。

## ☕ 赞助

如果这个项目为你节省了时间，欢迎请我喝杯咖啡。

<details>
<summary>赞助码</summary>

| 微信 | 支付宝 |
| :---: | :---: |
| <a href="./assets/sponsor-wechat.png"><img src="./assets/sponsor-wechat.png" width="150" alt="微信赞赏码" /></a> | <a href="./assets/sponsor-alipay.png"><img src="./assets/sponsor-alipay.png" width="150" alt="支付宝收款码" /></a> |

</details>

## 📄 许可证

本仓原创代码与文档采用 [MIT License](./LICENSE) © [leiwang](https://github.com/l246804)。上游项目及 vendored 技能按各自的许可证使用。详见[鸣谢](#-鸣谢)。
