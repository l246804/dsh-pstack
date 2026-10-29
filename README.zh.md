<p align="center">
  <img src="./assets/logo.png" width="144" alt="dsh-pstack logo" />
</p>

<h1 align="center">dsh-pstack</h1>

<p align="center">
  <strong>把 pstack 的严格代理工作流带进 DeepSeek Harness</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> · 中文
</p>

<p align="center">
  <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/v/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm version" /></a>
  <a href="https://npmx.dev/package/dsh-pstack"><img src="https://img.shields.io/npm/dm/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="npm downloads" /></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/dsh-0.2.2--alpha.2-1f6feb?style=flat-square" alt="dsh 0.2.2-alpha.2" /></a>
  <a href="https://github.com/cursor/plugins/tree/main/pstack"><img src="https://img.shields.io/badge/pstack-0.15.36-d97706?style=flat-square" alt="pstack 0.15.36" /></a>
</p>

<p align="center">
  <a href="https://github.com/l246804/dsh-pstack/blob/main/LICENSE"><img src="https://img.shields.io/github/license/l246804/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669" alt="license" /></a>
  <a href="https://bundlephobia.com/result?p=dsh-pstack"><img src="https://img.shields.io/bundlephobia/minzip/dsh-pstack?style=flat-square&colorA=080f12&colorB=1fa669&label=minzip" alt="minzip size" /></a>
  <a href="https://www.jsdocs.io/package/dsh-pstack"><img src="https://img.shields.io/badge/jsdocs-reference-080f12?style=flat-square&colorA=080f12&colorB=1fa669" alt="JSDocs" /></a>
</p>

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>58</strong><br /><sub>pstack 技能</sub></td>
      <td align="center"><strong>23</strong><br /><sub>playbook</sub></td>
      <td align="center"><strong>4</strong><br /><sub>原生工具</sub></td>
      <td align="center"><strong>2</strong><br /><sub>agent preset</sub></td>
      <td align="center"><strong>5</strong><br /><sub>随包脚本</sub></td>
    </tr>
  </table>
</div>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#能力">能力</a> ·
  <a href="#skills-目录">skills 目录</a> ·
  <a href="#可选-dsh-插件">可选 DSH 插件</a> ·
  <a href="#兼容性">兼容性</a>
</p>

`dsh-pstack` 是 [pstack](https://github.com/cursor/plugins/tree/main/pstack) 的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）移植。它保留上游 pstack 的技能、playbook 与参考文档，把 Cursor 的工具名、子代理字段、模型 slug 和路径映射到 DSH，再用 4 个原生工具补齐 DSH 缺少的接口。

上游 pstack 的技能大多声明 `disable-model-invocation: true`。`poteto-mode` 需要按名称路由到这些隐藏技能，而 DSH 的 `skill` 工具只暴露模型可见目录。Cursor 的模型 slug、`subagent_type`、`readonly` 和 Bun 脚本在 DSH 也没有对等物。dsh-pstack 把这些差异收在插件层，安装后可以直接从 `/poteto-mode` 等入口开始工作。

完整能力映射、缺口和验收状态见 [`pstack/README.md`](./pstack/README.md)。

## 快速开始

```sh
dsh plugin --profile web add dsh-pstack
```

在 Web 或 Desktop 的 Plugins 页面也能安装。安装后重启对应的 profile，或新开一个 Session。

第一次使用先运行：

```text
/setup-pstack
```

它会读取当前部署真实提供的 provider、model 与 reasoning effort，写入 `$DSH_HOME/poteto-models.mdc`。缺少这个文件时，所有角色继承父级路由。

### 常用入口

| 命令 | 用途 |
|---|---|
| `/poteto-mode` | 主工作流入口，按任务匹配 playbook，维护 todo 与证据 |
| `/setup-pstack` | 配置角色模型，初始化 pstack 使用环境 |
| `/how`、`/why`、`/teach` | 架构走查、证据调查、渐进式讲解 |
| `/architect`、`/arena`、`/swarm` | 多方案设计、并行候选、切片并行实现 |
| `/create-verification-skill` | 为真实项目生成验证技能 |
| `/statechart` | 用 TLA+ 与 TLC 检查状态模型，输出 Mermaid 状态图 |
| `/show-me-your-work` | 维护 TSV 决策日志，审计当前工作 |
| `/retro` | 对一次编码会话做环境复盘 |

## 能力

### 原生工具

| 工具 | 作用 |
|---|---|
| `pstack_skill` | 按名称加载本插件注册的隐藏技能，也能读取技能目录内的相对资源。 |
| `pstack_models` | 只读列出 DSH 实际提供的 provider、model 和 effort，供 `/setup-pstack` 使用。 |
| `pstack_subagent` | 按角色读取 `$DSH_HOME/poteto-models.mdc`，解析 `provider/model [effort]`，按 `agent` 选择 preset，一次可启动多个子代理。 |
| `pstack_script` | 用固定 id 运行随包 Node 脚本，不依赖 Bun 或 shell 脚本。 |

`poteto-agent` 和 `comment-sicko` 两个 preset 分别负责实现型委派与只读评论审查。`pstack_script` 可以运行 `check-plan`、`watch-pr`、`worktree-audit`、`log`、`statechart` 五个随包脚本，脚本 id 是封闭枚举，不能拼任意路径。

## skills 目录

`skills/` 不是 pstack 上游目录。它只收 pstack 没提供、真实项目开发中又需要的技能。源目录是 `skills/authored/` 和 `skills/.agents/skills/`，构建后分别发布到 `dist/skills/authored/` 和 `dist/skills/vendored/`。`vendored` 逐字保留开源上游，`authored` 由本仓维护。pstack 技能对它们的引用只是使用关系，不改变收录标准。

| 来源 | 技能 | 作用 | 补充的工程能力 |
|---|---|---|---|
| `vendored` | `writing-for-agents` | 写技能、`AGENTS.md`、`CLAUDE.md` 与被指针引用的文档，覆盖 context pointer、信息层级和渐进披露。 | 让 agent 文档的触发词、加载顺序和上下文成本可预测，也补上 Cursor `create-skill` 的写作路径。 |
| `vendored` | `retro` | 对一次编码会话做环境复盘，检查导航、自动化检查、编码规范、工具经济与信息获取。 | 补上 pstack `/reflect`、`/correct` 没覆盖的环境体检，只出报告，不改仓库。 |
| `authored` | `decision-write` | 决策记录的写入、落地和取代，Draft 与 Land 两种模式，`Status` 与 `Implemented-by` 必须成对。 | 补上真实项目常缺的决策生命周期。 |
| `authored` | `decision-audit` | 只读审计决策记录的路由、状态、Scope、锚点与取代关系。 | 让决策记录持续可检索、可复核。 |
| `authored` | `setup-project-docs` | 搭建 architecture、glossary、decisions 与根 `AGENTS.md` 指针，可重复补齐。 | 给新项目一套可持续的项目文档入口。 |

`vendored` 技能来自 `mattpocock/skills@59db609eb1e18aaf59b63284d0e52255aff0c63c`，来源、路径和哈希记录在 [`skills/skills-lock.json`](./skills/skills-lock.json)。两棵技能树都随包发布，但和 pstack 上游版本没有对应关系。

## 可选 DSH 插件

以下插件都随 DSH 提供，默认关闭，不是 dsh-pstack 的安装依赖。它们决定部分 pstack 流程能不能完整执行。启用方式：在 Plugins 页面用 **Add plugin** 输入包名，或运行 `dsh plugin --profile <profile> add <package>`，然后重启 profile。

### 会话与隔离

| 插件 | 打开后的能力 | 边界与冲突 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-session-search` | 5 个只读工具：`session_search`、`session_event_search`、`session_trace`、`session_event_trace`、`session_event_read`，搜索和追踪历史会话，服务 `/recall`、`/reflect`、`/show-me-your-work`。 | 只匹配同一 `cwd` 的会话；当前会话用 `session_event_search`；没有 Cursor 的 `.jsonl` 转写路径。 |
| `@deepseek-ai/dsh-experimental-worktree`<br />`@deepseek-ai/dsh-experimental-tool-worktree` | `create_worktree` 建本地分支和工作树，切换当前 Session 目录，用于 `/arena`、`/swarm`、`/architect` 的并行候选隔离。 | `from` 只读本地 ref，不 fetch；无云 VM；连续建树会改 `cwd`；不会自动给每个子代理分树。 |
| `@deepseek-ai/dsh-experimental-forge-bundle` | PR 面板、checks、review、mark ready、merge、Session 绑定，也能从 composer 用新 worktree 启动 Session，服务 `/babysit`、`/shipping`、`/autopilot-*`。 | 仅 GitHub，需 `gh` 登录；模型侧没有 take 工具；没有 stack verdict；可与 worktree bundle 共存。 |

### 验证与证据

浏览器 provider 三选一：`@deepseek-ai/dsh-experimental-browser-use-stagehand-native`、`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`、`@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp`。

| 插件 | 打开后的能力 | 边界与冲突 |
|---|---|---|
| `@deepseek-ai/dsh-browser-use` + 一个 provider | 导航、点击、输入、截图和 ARIA snapshot；Stagehand 另有 act、find、extract，用于验证技能和 UI 复现。 | 基础包没有 provider 时不生效；每个 Session 一个 provider；截图要图像模型；无视频；Stagehand 需要 Chromium 和非 DeepSeek 模型。 |
| `@deepseek-ai/dsh-cua-bundle` | macOS 应用点击、输入、截图和权限页，用于桌面应用验证。 | 仅 macOS PTC；Windows 未完成；无视频。 |
| `@deepseek-ai/dsh-experimental-terminal-bundle` | 6 个全局终端工具，跨调用保持 shell / REPL，支持后台 send，用于 CLI / TUI 验证。 | 只覆盖终端；会加到所有 Agent；持久状态要清理；切换会失效 KV cache。 |
| `@deepseek-ai/dsh-mcp-client` | 挂载 MCP server，工具以 `mcp__<server>__<tool>` 出现，`mcp-resources` 列出带资源的 server，服务 `/why`、`/teach` 的证据调查。 | 无默认 server；需逐项配置；无自动类别发现。 |

### 多代理

| 插件 | 打开后的能力 | 边界与冲突 |
|---|---|---|
| `@deepseek-ai/dsh-experimental-agent-team-profile` | Lead / teammate、共享任务板、9 个团队工具和 Web roster，服务 `/orchestrate`、`/autopilot-*`。 | 硬冲突：禁用 `subagent` / `subagent_fork`；与 `pstack_subagent` 形成两套入口，同一 profile 只留一套。 |
| `@deepseek-ai/dsh-experimental-ralph-bundle` | 全局 `ralph`，每轮 fresh child 的 foreground 循环，服务 `/autonomous-run`。 | 不是同一 Session 常驻循环；无事件 watcher；不替代 goal、心跳和 decision log。 |

## 兼容性

| 项目 | 版本 | 说明 |
|---|---|---|
| DSH | `0.2.2-alpha.2` | `engines.dsh` 精确匹配 |
| pstack | `0.15.36` | 上游基线提交 `1ba91fc` |
| Node.js | `>=24.21.1` | 运行时要求 |
| Cordis | `~4.0.6-alpha.1` | peer dependency |

`engines.dsh` 只接受这个 DSH 版本。升级 DSH 后，实验性插件的包名、工具名和配置可能变化，先在测试 profile 验证。升级 pstack 上游则需要重新生成树并复核适配表。

`pstack_script` 用 Host 的 Node 运行，不经过 bash 审批和文件系统沙箱，按受信入口处理。worktree 会话的 `cwd` 与原会话不同，session-search 只匹配精确 `cwd`，旧会话要在原目录搜索。

未启用可选插件时，pstack 技能仍可加载。需要插件的步骤会输出 `Skipped in DeepSeek Harness: <step>. <reason>.` 后继续。没有 `gh`、Java/TLC 或视频工具时，对应步骤报告 blocked 或降级为截图，不把未运行写成通过。

## 实现方式

pstack 上游用 `docs/harness/claude-code.md` 给 Claude Code 做适配。技能正文不被改写，另写一份宿主适配表，把 `Task`、`AskQuestion`、todo、模型 slug 和路径逐项映射到目标宿主。生成器只在需要映射 Cursor 名字的技能开头插入一行 DSH 适配提示，平台不支持的能力用 `Skipped in Claude Code: <step>. <reason>.` 跳过。

dsh-pstack 沿用这套做法。主适配文档换成 [`pstack/harness/docs/harness/dsh.md`](./pstack/harness/docs/harness/dsh.md)，覆盖 Tools、Subagent fields、Models、setup-pstack、Paths 和 Cursor-only features 六个域。DSH 没有的字段由 `pstack_*` 工具、agent preset 和 Node 脚本补齐。构建时把上游 pstack 与本地适配树渲染成 `pstack/pstack/`，再和 `src/*.ts`、`skills/` 一起打包到 `dist/`。

## 鸣谢

- [pstack](https://github.com/cursor/plugins/tree/main/pstack) 由 Lauren Tan 与 Cursor 团队设计并开源。`poteto-mode`、23 个 playbook 和 24 条 principle 都来自上游。
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 由 DeepSeek 团队提供。DSH 的插件、bundle、agent preset、subagent 和工具宿主接口让这次移植能以原生工具落地。
- [mattpocock/skills](https://github.com/mattpocock/skills) 提供 vendored 的 `writing-for-agents` 与 `retro`。

本项目是社区移植，不是 Cursor 或 DeepSeek 官方发行。上游 pstack 与 DSH 均为 MIT License。

## License

[MIT](./LICENSE) License © [leiwang](https://github.com/l246804)
