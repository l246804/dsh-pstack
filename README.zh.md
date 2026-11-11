<div align="center">
  <img src="./assets/logo.png" width="144" alt="dsh-pstack logo" />

  <h1>dsh-pstack</h1>

  <p>
    <strong>把 pstack 的严格代理工作流带进 DeepSeek Harness</strong>
  </p>

  <p><a href="./README.md">English</a> · 中文</p>

  <p>
    <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/v/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm version" /></a>
    <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-%3E%3D0.2.2--rc.1-1f6feb?style=flat-square" alt="dsh >=0.2.2-rc.1" /></a>
    <a href="https://github.com/cursor/plugins/tree/main/pstack"><img src="https://img.shields.io/badge/pstack-0.15.36-d97706?style=flat-square" alt="pstack 0.15.36" /></a>
    <a href="https://github.com/l246804/dsh-pstack/blob/main/LICENSE"><img src="https://img.shields.io/github/license/l246804/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="license" /></a>
    <a href="https://www.jsdocs.io/package/dsh-pstack"><img src="https://img.shields.io/badge/jsdocs-reference-080f12?style=flat-square&colorA=080f12&colorB=1fa669" alt="JSDoc reference" /></a>
  </p>

  <table>
    <tr>
      <td align="center"><strong>58</strong><br /><sub>pstack 技能</sub></td>
      <td align="center"><strong>23</strong><br /><sub>playbook</sub></td>
      <td align="center"><strong>4</strong><br /><sub>原生工具</sub></td>
      <td align="center"><strong>5</strong><br /><sub>agent preset</sub></td>
      <td align="center"><strong>5</strong><br /><sub>随包脚本</sub></td>
    </tr>
  </table>

  <p>
    <a href="#quick-start">🚀 快速开始</a> ·
    <a href="#️-常用命令">⌨️ 常用命令</a> ·
    <a href="#-能力">🧩 能力</a> ·
    <a href="#-可选-dsh-插件">🔌 可选插件</a> ·
    <a href="#-移植如何验证">🧪 移植如何验证</a> ·
    <a href="#️-仍存在的缺口">⚠️ 仍存在的缺口</a> ·
    <a href="#-常见问题">❓ 常见问题</a> ·
    <a href="#-兼容性">📦 兼容性</a>
  </p>
</div>

---

`dsh-pstack` 将 [pstack](https://github.com/cursor/plugins/tree/main/pstack) 移植到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH），保留其技能、playbook 与参考文档，并提供原生技能路由、按角色配置模型和按角色路由的子代理。

每项 Cursor 能力到 DeepSeek Harness 的映射见[运行时映射](./port/dsh.zh.md)。移植以真实 DSH Web 会话为准进行核对，具体做法见[移植如何验证](#-移植如何验证)一节。

> [!IMPORTANT]
> 要求 DSH `>=0.2.2-rc.1`、Node.js `>=24.21.1`。部分随包工作流需要额外运行时，见[脚本登记](./port/AGENTS.md#脚本登记)。

<a id="quick-start"></a>

## 🚀 快速开始

1. **安装插件。**

   ```sh
   dsh plugin --profile web add dsh-pstack
   ```

   也可以在 Web 或 Desktop 的「插件」页面安装。

2. **重启对应的 profile，或新开一个 Session。**

## 🧭 使用步骤

选择一种方式，点击展开查看完整步骤。

<details>
<summary><strong>🖥️ 可视化使用步骤</strong></summary>

需要配置相关插件或角色路由时，使用插件界面。

1. 打开 **插件 → 已安装插件**，选择 **pstack 工作流**，然后点击 **配置**。

   ![配置入口](./assets/plugin-configure.png)

2. 在 **推荐插件** 中查看 **推荐**、**可选**、**冲突** 三组。**全部启用** 只会启用 **推荐** 组中的插件。

   ![推荐插件](./assets/plugin-recommended.png)

3. 打开 **角色模型**，为每个角色设置提供方、模型和推理强度，然后保存该行或点击 **全部保存**。

   ![角色模型](./assets/plugin-roles.png)

4. 打开 **设置 → Agent 预设**，选择 **Poteto 模式** 或 **Poteto 创造模式**，点击 **默认预设**。

   ![Agent 预设](./assets/agent-presets.png)

5. 新建会话时保留默认预设，或手动选择 **Poteto 模式**。

   ![会话预设](./assets/session-preset.png)

</details>

<details>
<summary><strong>🧠 技能使用步骤</strong></summary>

需要从会话直接启动 pstack 工作流时，使用技能命令。

1. **初始化角色路由。** 运行一次 `/setup-pstack`。命令会把检测到的路由写入 `$DSH_HOME/pstack-models.mdc`。缺少此文件时，角色继承父级模型。
2. **通过技能启动。** 直接输入 `/poteto-mode`。不需要先切换预设。
3. **使用针对性命令。** 从[常用命令](#️-常用命令)中选择。

</details>

## ⌨️ 常用命令

| 工作流 | 命令 |
|---|---|
| 帮助 | `/poteto-help` |
| 规划与实现 | `/poteto-mode`、`/architect`、`/arena`、`/swarm` |
| 理解与调查 | `/how`、`/why`、`/teach` |
| 验证 | `/create-verification-skill`、`/statechart` |
| 审查与维护 | `/show-me-your-work`、`/retro`、`/docs-drift` |

## 🧩 能力

### 🛠️ 原生工具

| 工具 | 作用 |
|---|---|
| `pstack_skill` | 按名称加载隐藏的 pstack 技能，以及技能目录内相对路径的资源。 |
| `pstack_models` | 列出可用的 provider、model 和 reasoning effort。 |
| `pstack_roles` | 展示每个角色的类型及是否为自动面板，确保委派时使用正确的参数。 |
| `pstack_subagent` | 应用角色路由与 agent preset，支持并行子代理。 |

### 🎭 Agent preset

随包提供两个根 preset 和三个子代理 preset。

| 预设 | 范围 | 用途 |
|---|---|---|
| `poteto-mode` | 根 | 基于标准模式，能力与标准模式一致，额外常驻 `poteto-mode` 工作流。 |
| `poteto-mode-creator` | 根 | 基于创造模式，能力与创造模式一致，额外常驻 `poteto-mode` 工作流。 |
| `poteto-agent` | 子代理 | 实现型子代理，注入 pstack 人格和 `poteto-mode` 指令。 |
| `comment-sicko` | 子代理 | 只读评论评审子代理，报告删除目标和 `MUST KILL` 符号。 |
| `readonly` | 子代理 | 带只读沙箱策略的研究子代理，用于检查和取证。 |

在 **设置 → Agent 预设** 中可以点击 **默认预设**，让新建会话自动使用该预设。

### 📚 额外技能

这些技能为 pstack 补充文档编写、项目维护和证据采集工作流。

| 技能 | 来源 | 使用场景 |
|---|---|---|
| `writing-for-agents` | `vendored` | 编写或评审技能、`AGENTS.md`、`CLAUDE.md` 等 agent 文档，覆盖 `create-skill` 的使用场景。 |
| `retro` | `vendored` | 复盘编码会话的 agent 环境，改进导航、自动化检查、编码约定、工具效率和信息获取。 |
| `deslop` | `vendored` | 在不改变行为的前提下，清理 diff 中多余的注释、防御性代码、类型断言和嵌套。 |
| `control-ui` | `vendored` | 操作本地 Web、IDE 或 Electron 界面，采集视觉或可访问性证据。 |
| `control-cli` | `vendored` | 操作交互式 CLI 或 TUI，采集终端操作记录或性能证据。 |
| `decision-write` | `authored` | 以可追踪的生命周期记录设计取舍、理由和实现证据。 |
| `decision-audit` | `authored` | 在设计历史累积后，检查记录状态、范围、实现锚点和取代关系。 |
| `setup-project-docs` | `authored` | 为项目建立架构、术语、决策约定和文档指针。 |
| `docs-drift` | `authored` | 巡检持续维护的文档，修复获批的漂移、冗余和无依据表述。 |

vendored 技能的来源与哈希记录在 [`skills/skills-lock.json`](./skills/skills-lock.json)。

## 🔌 可选 DSH 插件

安装 dsh-pstack 时无需一并安装这些插件，按需启用即可。

| 使用场景 | 插件 | 提供的能力与边界 |
|---|---|---|
| worktree 与 GitHub PR | `@deepseek-ai/dsh-experimental-forge-bundle` | 提供本地工作树和 GitHub PR 工作流。GitHub 状态需要已登录的 `gh`；没有此插件时通过 `bash` 使用 `gh` 与 `git worktree add`。 |
| 历史会话 | `@deepseek-ai/dsh-experimental-session-search` | 只读检索历史会话与事件，按 `cwd` 完全匹配；是否包含子代理会话记录尚未确认。 |
| 浏览器验证 | `@deepseek-ai/dsh-browser-use` 与下方任一 provider 搭配 | 浏览器导航、输入和截图。每个 Session 使用一个 provider，截图需要支持图像的模型。 |
| 桌面验证 | `@deepseek-ai/dsh-cua-bundle` | 在 macOS PTC 桌面控制会话中控制桌面；Windows 支持尚不完整。 |
| 持久终端 | `@deepseek-ai/dsh-experimental-terminal-bundle` | 为 CLI 和 TUI 验证提供持久 shell 与 REPL 会话。 |
| MCP 集成 | `@deepseek-ai/dsh-mcp-client` | 使用显式配置的 MCP server 工具；默认不配置 server。 |
| 自主循环 | `@deepseek-ai/dsh-experimental-ralph-bundle` | 每轮启动新子代理的前台循环，不是同一 Session 的常驻循环或事件 watcher。 |
| Agent Teams（不兼容） | `@deepseek-ai/dsh-experimental-agent-team-profile` | 提供 lead/teammate 角色与共享任务板。不要在提供 pstack 根预设的 profile 中启用。两者都承担委派与协调，Agent Teams 服务存在时 pstack 根预设会因 `AGENT_TEAMS_CONFLICT` 加载失败。Web 仍能启动，`poteto-mode` 与 `poteto-mode-creator` 卡片在「设置 → Agent 预设」中显示「加载失败」。 |

浏览器验证从以下 provider 中选择一个：

- `@deepseek-ai/dsh-experimental-browser-use-stagehand-native`：还需要 Chromium 和受支持的非 DeepSeek 模型。
- `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`
- `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp`

通过 **插件 → 添加插件** 启用对应包，必要时重启 profile。多数包随 DSH 提供，`@deepseek-ai/dsh-cua-bundle` 按需安装。除 MCP client 外，以上插件均为实验性插件。

> [!WARNING]
> **Agent Teams 与 pstack 根预设冲突。** Agent Teams 与 `pstack_subagent` 只能二选一。Agent Teams 服务存在时，pstack 根预设会因 `AGENT_TEAMS_CONFLICT` 加载失败。Web 仍能启动，`poteto-mode` 与 `poteto-mode-creator` 卡片在「设置 → Agent 预设」中显示「加载失败」。

依赖未启用插件的步骤会标记为 skipped 或 blocked，不会标记为通过。安装与回退说明见 [DSH 适配文档](./port/dsh.zh.md#可选插件)。

## 🧪 移植如何验证

移植以真实 DeepSeek Harness Web 会话为准进行核对，不靠与上游文本比对。完整流程见 [playground/README.md](./playground/README.md)。

- **raw 基准。** 生成器把上游 pstack 复制到 `playground/raw/generated`，不装其他插件。`playground/raw/dsh.md` 把每项上游能力写成三种情况之一：base DSH 原生、仅官方可选插件提供、没有此能力。生成器只复制该文档并替换引用链接，上游文案保持原样。
- **场景驱动。** 57 个行为场景用自然语言 turns 先跑 raw 基准，再跑适配后的插件。两项能力因强依赖 Cursor 云 routine、Bot 或 Automations 声明为排除。上游技能既无场景也无排除时，覆盖守卫测试会失败。
- **语义审核。** 技能能加载只证明它可被触达。每个场景单独记录 `supported`、`gap` 或 `inconclusive` 结论，并附审核者与理由；adapted 运行记录 `verified`、`not-verified` 或 `inconclusive`。
- **adapted 复验。** 审核结论驱动 [port/dsh.zh.md](./port/dsh.zh.md)。适配包用 `vp run build` 重建后，重跑同一批场景确认映射后的行为。
- **插件矩阵。** adapted 运行覆盖官方插件环境 `base`、`session-search`、`browser-use`、`terminal`、`forge` 与 `agent-team-conflict`。插件 UI 场景与 Agent Teams 冲突回归有各自的运行入口。

## ⚠️ 仍存在的缺口

即使启用所有可与 pstack 共存的可选插件，以下限制仍然存在。

| 领域 | 限制 |
|---|---|
| Cursor 平台服务 | 不支持 Automations、Cursor webhook、`SendToUser`、云代理和持久云端 Projects。 |
| Bugbot | 无法启动、配置或等待 Bugbot；已有 Bugbot 评论仍可作为 PR review 处理。 |
| PR 编排 | 没有模型侧变更请求工具，也没有 Agent Teams 式的 PR 跟踪面板与共享记录；`watch-pr` 仍提供 stack verdict。 |
| 模式切换 | 没有 Option+Enter 开关或会话中切换模式的入口。新建会话时选择 `poteto-mode` 或 `poteto-mode-creator`；其它 preset 每个任务调用 `/poteto-mode`。 |
| 事件驱动循环 | 不订阅 forge 事件；本地 goal、定时任务和 watcher 并非等价替代。 |
| 图表渲染 | 不提供内置渲染器。图表以 Mermaid 文本返回，需要图片时自行用外部工具渲染。 |
| 视频证据 | 没有内置视频渲染、录屏与逐帧验证。项目自带的渲染器只要产出可核对的文件即可使用；否则借助外部录屏或 FFmpeg。 |
| 桌面覆盖 | computer use 仅支持 macOS PTC 桌面控制会话，Windows 支持尚不完整。 |
| MCP 发现 | 不会自动发现证据类别，需要显式配置并识别 MCP 工具。 |

## ❓ 常见问题

<details>
<summary><strong>展开查看问题与解答</strong></summary>

1. **预设名称显示为英文**

   在「设置 → 通用 → 语言」中把语言切换为中文，然后重启 DSH。语言行可能已经显示中文，因为它跟随浏览器；重新选择一次中文会写入 preset 在 Host 启动时读取的语言偏好。

</details>

## 📦 兼容性

按发布版本声明的 DSH 范围选择。同一兼容范围内，每个 x.y 只保留最新版本。pstack 列记录当前移植基线，不逐一追溯旧插件版本。

<!-- compatibility-keys: ["dsh-0.2.2-rc.1+port-v1","dsh-0.2.1-rc.5+legacy-v1","dsh-0.2.0-0.3.0+legacy-v1"] -->
| DSH 版本 | dsh-pstack 发布版本 | 包含的 pstack 版本 |
|---|---|---|
| `>=0.2.2-rc.1` | `0.3.1` | `0.15.36` |
| `>=0.2.1-rc.5` | `0.2.2` | `0.15.36` |
| `>=0.2.0 < 0.3.0` | `0.1.0` | `0.15.29` |

新增兼容范围时增加一行，其他发布自动更新所属行；规则见[移植与维护](./port/AGENTS.md#破坏性变更)。

## 🔗 友情链接

- [LinuxDo - 新的理想型社区](https://linux.do/)

## 💛 鸣谢

- [pstack](https://github.com/cursor/plugins/tree/main/pstack)：由 Lauren Tan 与 Cursor 团队设计并开源，是本项目的工作流基础。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：由 DeepSeek 团队开发，是本插件的运行平台。
- [cursor-team-kit](https://github.com/cursor/plugins/tree/main/cursor-team-kit)：vendored `deslop`、`control-ui` 与 `control-cli` 技能的来源。
- [mattpocock/skills](https://github.com/mattpocock/skills)：vendored `writing-for-agents` 与 `retro` 技能的来源。

本项目是社区移植，不是 Cursor 或 DeepSeek 官方发行。

## 📄 License

本仓原创代码与文档采用 [MIT License](./LICENSE) © [leiwang](https://github.com/l246804)。上游项目及 vendored 技能按各自的许可证使用，详见[鸣谢](#-鸣谢)。
