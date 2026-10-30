# pstack 移植审查记录

本文记录 `upstream/cursor-plugins/pstack` 到 DeepSeek Harness（下称 DSH）的移植审查。审查回答三个问题：上游要求什么、DSH 现在能做什么、剩余缺口由谁补。安装与使用说明见根 `README.md`，宿主适配见 `pstack/harness/docs/harness/dsh.md`。

## 1. 审查基线

### 1.1 目的与范围

- 审查对象是 `upstream/cursor-plugins/pstack` 在固定提交下的完整可移植需求，不是本仓现有实现的功能清单。现有生成树、旧 README、测试和构建产物只证明各自直接表达的事实，不作为产品能力依据。
- 审查采用「先排除、再分层」：先读上游 `docs/harness/claude-code.md` 的 `Cursor-only features`，舍弃依赖 Cursor 平台的完整能力；剩余需求拆成原子能力，每项只归入映射、标准模式、可选插件中的一层。
- 本文的「插件」一律指本仓 `dsh-pstack`；「可选插件」一律指 DSH 官方提供、默认未启用的插件或 bundle。
- 「当前提交未证实」表示在固定提交与本次调查范围内找不到足够源码证据，不表示该能力在别的 DSH 版本也不存在。
- 本轮是 `baseline` 轮次，没有 core Issue 或 EXT 输入。`docs/port-prepare.md` 确认 pstack 子树在 `1ba91fc..4dd1d05` 间没有文件变化（树哈希同为 `4719e1c`），因此沿用上一轮冻结的 135 项原子能力；DSH 侧按 `ce7073d` 重新取证，不沿用旧提交的 README 行号。差异影响见 1.8。

### 1.2 上游提交与版本

| 上游 | 检出路径 | 提交 | 版本 |
|---|---|---|---|
| pstack | `upstream/cursor-plugins/pstack` | `4dd1d05818d19792e7cd6e818f1667f95f7e1dbe` | `0.15.36`（`plugin.json`） |
| DSH | `upstream/deepseek-harness` | `ce7073d51254c26cd63b22a60835b8f948deb447` | `0.2.2-alpha.2`（根 `package.json`） |

证据：[pstack plugin.json](../upstream/cursor-plugins/pstack/plugin.json#L1-L21) · [DSH package.json](../upstream/deepseek-harness/package.json#L1-L12)。

### 1.3 清点范围与计数

清点覆盖 `<pstack>` 下全部 `*.md`、文档形式的 agent 与 automation 模板、配置模板，以及从调用点追踪到的脚本。`assets/`、脚本、锁文件属于实现资产，按能力证据单独引用，不当作独立需求文档。

| 类别 | 数量 | 说明 |
|---|---:|---|
| Markdown 文档（不含 statechart 测试语料） | 136 | 共 7908 行；根 README 1、guide 11、harness 1、agents 2、benny 11、58 个 `SKILL.md`、23 个 playbook、29 个技能 reference |
| statechart 测试语料 `report.md` | 33 | `skills/statechart/scripts/test/corpus/**` 的验收夹具，不产生独立需求 |
| Markdown 文档总数 | 169 | 136 个需求或说明文档加 33 个测试夹具 |
| `SKILL.md` | 58 | 34 个普通技能（含 `setup-pstack`）加 24 个 principle 技能 |
| Playbook | 23 | `skills/poteto-mode/playbooks/*.md` |
| 子代理定义 | 2 | `poteto-agent`、`comment-sicko` |
| benny automation 文档 | 11 | README、FOR_AGENTS、3 个 `SKILL.md`、4 个 reference、2 个 prompt 模板 |
| 文档形式配置模板 | 2 | benny `configuration.example.yaml`、show-me-your-work `decision-log-template.tsv` |
| 可执行脚本入口 | 5 | check-plan、watch-pr、worktree-audit、log、statechart |
| 脚本辅助资产 | 1 组 | `bootstrap.ts` 与 watch-pr 的 `package.json`、`bun.lock`、测试；不单独成项 |
| 原子能力 | 135 | 见第 2 至 4 节的 135 个编号 |

能力编号前缀说明：`TOOL` 模板工具，`SUB` 子代理字段，`AGT` 代理定义，`MOD` 模型选择，`SET` setup-pstack，`PATH` 路径约定，`SCR` 脚本与运行时前提，`SKL` 技能正文，`PB` playbook，`PRIN` principle，`AUT` benny automation，`EXCL` 平台排除。编号在审查、实现和验收之间保持不变。

### 1.4 独立保留范围

`docs/extensions.md` 中 `proposed` 与 `active` 的条目是 DSH 版本地扩展，不是上游 pstack 能力，不混入本表的原子能力编号。本轮没有登记的扩展，也没有需要保留的 EXT 条目。

### 1.5 分类口径

| 分类 | 判定标准 | 本文写法 |
|---|---|---|
| 映射-完整 | 只需转换名称、字段、路径或调用方式，目标行为、生命周期和关键语义都能保留 | `映射 · 完整` |
| 映射-部分 | 转换后能保留主路径，但有明确语义差异 | `映射 · 部分` |
| 标准模式-完整 | 不启用本仓插件和其他可选插件，DSH 标准能力即可完整覆盖 | `标准 · 完整` |
| 标准模式-部分 | 标准模式只覆盖一部分，剩余缺口有明确场景 | `标准 · 部分` |
| 可选插件-完整 | 启用指定 DSH 可选插件后完整覆盖 | `可选 · 完整` |
| 可选插件-部分 | 启用指定 DSH 可选插件后只覆盖一部分 | `可选 · 部分` |
| 平台排除 | 按上游 `Cursor-only features` 基线舍弃完整能力 | `平台排除` |

只有 `标准 · 部分` 和 `可选 · 部分` 中仍无法由配置、映射或已有可选插件解决的行为，才进入第 5 节的插件内实现集合。

### 1.6 模板覆盖域与平台排除基线

`docs/harness/claude-code.md` 是上游自带的宿主适配先例。本审查沿用它的覆盖域、表格粒度和行为规则，并把它作为 DSH 适配文档的组织参照。

| 模板域 | 行 | 覆盖条目 | 本审查处理 |
|---|---|---|---|
| Tools | [L7-L13](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L7-L13) | `Task`、`AskQuestion`、todo、运行另一个 pstack 技能、`Grep`/`Glob` | 逐项进入 `TOOL-01` 至 `TOOL-05`，其中 `TOOL-04a` 与 `TOOL-04b` 分开 |
| Subagent fields | [L17-L28](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L17-L28) | `subagent_type`、`readonly`、`environment`、`cloud_base_branch`、`run_in_background`、`resume`、`file_attachments` | 逐项进入 `SUB-01` 至 `SUB-10`、`AGT-01`、`AGT-02` |
| Models | [L32-L38](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L32-L38) | 模型 slug、非 Claude slug、`auto` 与 `inherit-parent`、`pstack-models.mdc`、`<model> <effort>` | 逐项进入 `MOD-01` 至 `MOD-06` |
| setup-pstack | [L42-L46](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L42-L46) | 检测模型、默认值映射、写规则文件 | 逐项进入 `SET-01` 至 `SET-08` |
| Paths | [L50-L56](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L50-L56) | 技能目录、插件目录、规则文件、GitHub 链接、转写目录 | 逐项进入 `PATH-01` 至 `PATH-06` |
| Cursor-only features | [L58-L67](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L58-L67) | Automations、Bugbot、云代理、内置 PR 工具 | `EXCL-01` 至 `EXCL-06`；内置 PR 工具不是排除项，改用 forge 命令 |

模板行为规则：字段没有对应行就丢弃并说明；绝不传工具 schema 拒绝的字段或取值；平台排除项用一行 `Skipped in DeepSeek Harness: <step>. <reason>.` 说明后继续后续步骤，不停止、不询问、不重试；后续步骤需要被跳过步骤的产物时留占位符。DSH 适配沿用同样的跳过并继续语义。

### 1.7 证据索引

下表是后文反复引用的 DSH 证据。每条结论仍会在所在行给出具体链接；索引只用于压缩重复路径。

| 代号 | 主题 | DSH 证据 |
|---|---|---|
| E01 | 技能根目录与格式 | [docs/subsystems/skills.md#L64-L89](../upstream/deepseek-harness/docs/subsystems/skills.md#L64-L89) · [packages/skill/skill-filesystem/README.md#L36-L56](../upstream/deepseek-harness/packages/skill/skill-filesystem/README.md#L36-L56) |
| E02 | 技能目录与会话加载 | [docs/subsystems/skills.md#L227-L233](../upstream/deepseek-harness/docs/subsystems/skills.md#L227-L233) · [docs/tool-catalog.md#L1733-L1758](../upstream/deepseek-harness/docs/tool-catalog.md#L1733-L1758) |
| E03 | 用户 `/name` 调用与隐藏技能边界 | [packages/skill/tool-skill/README.md#L54-L56](../upstream/deepseek-harness/packages/skill/tool-skill/README.md#L54-L56) · [packages/skill/tool-skill/README.md#L89](../upstream/deepseek-harness/packages/skill/tool-skill/README.md#L89) |
| E04 | `subagent` 工具 schema | [docs/tool-catalog.md#L2062-L2092](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| E05 | 子代理服务、预设与恢复 | [docs/subsystems/subagent.md#L70-L130](../upstream/deepseek-harness/docs/subsystems/subagent.md#L70-L130) · [packages/subagent/subagent/README.md#L28-L65](../upstream/deepseek-harness/packages/subagent/subagent/README.md#L28-L65) |
| E06 | 子代理模型选择策略 | [packages/subagent/tool-subagent/README.md#L45-L79](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L45-L79) |
| E07 | `ask_user_question` | [docs/tool-catalog.md#L546-L616](../upstream/deepseek-harness/docs/tool-catalog.md#L546-L616) · [docs/subsystems/user-questions.md#L280-L293](../upstream/deepseek-harness/docs/subsystems/user-questions.md#L280-L293) |
| E08 | `todo_write` | [docs/tool-catalog.md#L2534-L2580](../upstream/deepseek-harness/docs/tool-catalog.md#L2534-L2580) |
| E09 | `workflow` | [docs/tool-catalog.md#L2636-L2729](../upstream/deepseek-harness/docs/tool-catalog.md#L2636-L2729) |
| E10 | `schedule_*` | [docs/tool-catalog.md#L1503-L1653](../upstream/deepseek-harness/docs/tool-catalog.md#L1503-L1653) |
| E11 | `create_goal` 与 `update_goal` | [docs/tool-catalog.md#L1407-L1497](../upstream/deepseek-harness/docs/tool-catalog.md#L1407-L1497) |
| E12 | `bash` 与后台 job | [docs/tool-catalog.md#L695-L735](../upstream/deepseek-harness/docs/tool-catalog.md#L695-L735) · [docs/subsystems/jobs.md#L1-L31](../upstream/deepseek-harness/docs/subsystems/jobs.md#L1-L31) |
| E13 | `create_worktree` | [docs/tool-catalog.md#L2608-L2634](../upstream/deepseek-harness/docs/tool-catalog.md#L2608-L2634) · [docs/subsystems/worktrees.md#L5-L18](../upstream/deepseek-harness/docs/subsystems/worktrees.md#L5-L18) |
| E14 | forge 变更请求 | [docs/subsystems/forge.md#L5-L18](../upstream/deepseek-harness/docs/subsystems/forge.md#L5-L18) · [docs/subsystems/forge.md#L226-L283](../upstream/deepseek-harness/docs/subsystems/forge.md#L226-L283) |
| E15 | 浏览器控制 | [docs/subsystems/browser-use.md#L9-L15](../upstream/deepseek-harness/docs/subsystems/browser-use.md#L9-L15) |
| E16 | 计算机控制 | [docs/subsystems/computer-use.md#L9-L27](../upstream/deepseek-harness/docs/subsystems/computer-use.md#L9-L27) |
| E17 | 持久终端 | [packages/experimental/tool-terminal/README.md#L10-L30](../upstream/deepseek-harness/packages/experimental/tool-terminal/README.md#L10-L30) |
| E18 | 会话历史搜索 | [packages/experimental/session-search/README.md#L8-L20](../upstream/deepseek-harness/packages/experimental/session-search/README.md#L8-L20) · [packages/experimental/tool-session-query/README.md#L8-L20](../upstream/deepseek-harness/packages/experimental/tool-session-query/README.md#L8-L20) |
| E19 | MCP client | [packages/mcp/mcp-client/README.md#L10-L24](../upstream/deepseek-harness/packages/mcp/mcp-client/README.md#L10-L24) |
| E20 | 指令文件加载 | [packages/context/agent-instructions/README.md#L30-L40](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L30-L40) · [packages/context/agent-instructions/README.md#L219-L223](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L219-L223) |
| E21 | 标准预设组成 | [packages/bundle/web-app/presets/standard.patch.yml#L4-L130](../upstream/deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml#L4-L130) |
| E22 | Agent 预设与 persona | [packages/preset/agent-preset/README.md#L28-L48](../upstream/deepseek-harness/packages/preset/agent-preset/README.md#L28-L48) · [packages/preset/persona/README.md#L28-L40](../upstream/deepseek-harness/packages/preset/persona/README.md#L28-L40) |
| E23 | 子代理深度与并发 | [packages/subagent/subagent/README.md#L49-L55](../upstream/deepseek-harness/packages/subagent/subagent/README.md#L49-L55) |
| E24 | LLM 模型目录 | [packages/llm/llm/README.md#L28-L28](../upstream/deepseek-harness/packages/llm/llm/README.md#L28-L28) · [packages/llm/llm/README.md#L89-L89](../upstream/deepseek-harness/packages/llm/llm/README.md#L89-L89) |
| E25 | 技能调用策略 | [docs/subsystems/skills.md#L128-L128](../upstream/deepseek-harness/docs/subsystems/skills.md#L128-L128) |
| E26 | Agent Teams | [packages/experimental/tool-agent-team/README.md#L10-L32](../upstream/deepseek-harness/packages/experimental/tool-agent-team/README.md#L10-L32) |
| E27 | 技能目录格式 | [packages/skill/skill-filesystem/README.md#L36-L38](../upstream/deepseek-harness/packages/skill/skill-filesystem/README.md#L36-L38) |

### 1.8 本轮输入与差异影响

本轮没有 core `required_behavior`。输入是 `docs/port-prepare.md` 的结构基线与两个固定提交；差异只来自 DSH 参考实现，pstack 上游需求不变。

| 事实 | 观察 | 对本轮影响 |
|---|---|---|
| pstack 子树 | `git diff --stat 1ba91fc..4dd1d05 -- pstack` 为空，树哈希同为 `4719e1c4b4c43bac85d4206a8b41dd2899769c1c` | 135 项能力、上游证据和编号沿用上一轮，没有新增或删除能力行 |
| DSH 提交 | `f3803c9..ce7073d` 有 351 个提交，包版本仍为 `0.2.2-alpha.2` | 全部 DSH 证据按 `ce7073d` 重新定位，不能沿用旧行号 |
| DSH 调度工具 | `schedule_create`、`schedule_edit`、`schedule_list`、`schedule_view` 取代旧的 reminder API，支持 RFC 5545 重复规则和 `this_session`、`new_once`、`new` 目标 | `PB-15` 与 G-10 的支持描述更新；DSH 仍无 CI、merge 或 ref 事件订阅 |
| DSH forge 服务 | forge provider 增加 `submitReview` 与 `fetchChecks`，forge bundle 的 GUI 可发布 review；bundle README 明确模型侧仍无变更请求工具 | `OPT-02` 补足 GUI review 与完整检查详情；G-07 的模型侧缺口不变 |
| DSH CUA 分发 | `@deepseek-ai/dsh-cua-bundle` 从可选 bundle 列表移到 on-demand catalog，仍默认关闭、仅 macOS | `OPT-04` 的启用路径改为按需安装后启用，覆盖结论不变 |

## 2. 完整能力表

本节按模板覆盖域列出上游需求与 DSH 对应项。每行给出能力编号、上游期待、DSH 实际、审查结论和证据。只有 `标准 · 部分` 和 `可选 · 部分` 的剩余缺口进入第 3.4 节。

### 2.1 工具

| 编号 | 上游期待 | DSH 对应项或缺失 | 审查结论 | 证据 |
|---|---|---|---|---|
| TOOL-01 | `Task` 启动子代理，按 `subagent_type` 选择代理 | `subagent` 启动受管子代理并立即返回 child id，完成通知回传结果；`subagent_fork` 提供继承对话的变体 | 映射 · 完整。名称从 `Task` 换成 `subagent`，异步启动、后台完成和结果回传语义一致 | [claude-code L9](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L9) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) · [E05](../upstream/deepseek-harness/docs/subsystems/subagent.md#L70-L130) |
| TOOL-02 | `AskQuestion` 向用户提问；`-p` 模式没有该工具时改用纯文本 | `ask_user_question` 支持单问题、多问题、选项、`multi_select` 和自由输入；只有 live root 能获得人类回答 | 映射 · 完整。主会话行为一致；被委派子代理没有人可回答，见 `SUB-01` | [claude-code L10](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L10) · [E07](../upstream/deepseek-harness/docs/tool-catalog.md#L546-L616) |
| TOOL-03 | 打开 todo list；跳过的步骤留在列表里并带 `skip: <reason>` | `todo_write` 整表替换，只有 `pending`、`in_progress`、`completed` 三种状态，没有独立的 `skip` 状态 | 映射 · 部分（G-11）。可以用 `content: "skip: <reason> - <step>"` 加 `completed` 保留可见性，但状态语义与上游不同 | [claude-code L11](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L11) · [E08](../upstream/deepseek-harness/docs/tool-catalog.md#L2534-L2580) |
| TOOL-04a | 用户输入 `/name` 或说「the **name** skill」运行另一个 pstack 技能 | `/name` token 会注入对应 user-invocable 技能的完整内容；这是 `disable-model-invocation` 技能唯一的用户入口 | 映射 · 完整（用户显式调用路径）。前缀差异不影响语义 | [claude-code L12](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L12) · [E03](../upstream/deepseek-harness/packages/skill/tool-skill/README.md#L54-L56) · [E25](../upstream/deepseek-harness/docs/subsystems/skills.md#L128-L128) |
| TOOL-04b | pstack 技能内部路由到另一个技能，例如 `/how`、`/why`、`/architect` | `skill` 工具只加载 model-invocable 技能；pstack 的大部分技能声明 `disable-model-invocation: true`，模型无法通过 `skill` 工具自动加载 | 标准 · 部分（G-02）。需要技能加载器或改写 frontmatter，进入 `PI-01` | [claude-code L12](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L12) · [E02](../upstream/deepseek-harness/docs/subsystems/skills.md#L227-L233) · [E25](../upstream/deepseek-harness/docs/subsystems/skills.md#L128-L128) |
| TOOL-05 | `Grep`/`Glob` 搜索内容与文件 | `grep`/`glob` 工具，ripgrep 实现，支持路径、include 过滤和超限落盘 | 映射 · 完整 | [claude-code L13](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L13) · [docs/tool-catalog.md#L1184-L1240](../upstream/deepseek-harness/docs/tool-catalog.md#L1184-L1240) |

### 2.2 子代理字段与代理定义

| 编号 | 上游期待 | DSH 对应项或缺失 | 审查结论 | 证据 |
|---|---|---|---|---|
| SUB-01 | `subagent_type: generalPurpose` 使用通用子代理 | `subagent` 的 `spawn` 后端默认创建独立本地子代理，继承父级 preset 和工具 | 映射 · 完整（名称改为普通 `subagent`） | [claude-code L19](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L19) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| SUB-02 | `subagent_type: poteto-agent`、`comment-sicko` 使用 pstack 自带命名代理 | DSH 没有 `subagent_type` 字段；`subagent` 只有可选的 `agent_preset`，且需要 `allowedAgentPresets` 或默认 preset 配置 | 标准 · 部分（G-12）。Agent 预设能表达 persona 和工具限制，但标准预设不带这两个 id；进入 `PI-08` | [claude-code L20](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L20) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) · [E22](../upstream/deepseek-harness/packages/preset/agent-preset/README.md#L28-L48) |
| SUB-03 | `readonly: true` 使用只读代理；保留 Bash，但要求不编辑文件并在事后检查 `git status` | DSH 没有 per-call `readonly` 字段；可以用 agent preset 去掉 `write`/`edit` 工具，保留 `bash`，再加提示和 `git status` 检查 | 标准 · 部分（G-12）。工具限制是组合级配置，不是单次调用字段；进入 `PI-08` | [claude-code L21](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L21) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) · [E22](../upstream/deepseek-harness/packages/preset/agent-preset/README.md#L28-L48) |
| SUB-04 | `readonly: false` 使用普通代理并保留会话的 MCP 服务器 | 本地子代理加入父级当前 preset，继承工具注册与 MCP 工具 | 映射 · 完整 | [claude-code L22](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L22) · [E05](../upstream/deepseek-harness/docs/subsystems/subagent.md#L70-L130) |
| SUB-05 | `environment: "cloud"` 使用隔离的工作树或云代理，并指定分支或提交 | DSH 没有云代理；可选 Git worktree bundle 能创建本地分支和检出目录，但不会自动给每个子代理分配独立 VM | 可选 · 部分（G-05）。云能力按 `EXCL-03` 排除；本地替代见 `OPT-01` | [claude-code L23](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L23) · [E13](../upstream/deepseek-harness/docs/tool-catalog.md#L2608-L2634) |
| SUB-06 | `environment: "local"` 省略隔离参数 | `subagent` 省略 `cwd` 时继承父级当前目录 | 映射 · 完整 | [claude-code L24](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L24) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| SUB-07 | `cloud_base_branch: <b>` 要求 worker 先检出 `<b>` | `create_worktree({ from })` 从本地分支创建新工作树；子代理用 `cwd` 指向该路径 | 可选 · 部分（G-05）。`from` 只解析本地 ref，不 fetch；不会自动把多个子代理隔离到不同工作树 | [claude-code L25](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L25) · [E13](../upstream/deepseek-harness/docs/tool-catalog.md#L2608-L2634) · [packages/experimental/tool-worktree/README.md#L26-L34](../upstream/deepseek-harness/packages/experimental/tool-worktree/README.md#L26-L34) |
| SUB-08 | `run_in_background: true` 省略，因为子代理默认后台运行 | `subagent` 启动后立即返回，完成通知另行到达 | 映射 · 完整 | [claude-code L26](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L26) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| SUB-09 | `resume` 恢复先前子代理 | `send_message` 向空闲的 continuable child 发消息会冷恢复；运行中的 child 在下一步边界接收 steer | 映射 · 完整，且恢复路径比新建并粘贴更直接 | [claude-code L27](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L27) · [docs/tool-catalog.md#L2141-L2162](../upstream/deepseek-harness/docs/tool-catalog.md#L2141-L2162) · [E05](../upstream/deepseek-harness/docs/subsystems/subagent.md#L130-L180) |
| SUB-10 | `file_attachments` 在任务说明里列出文件路径 | `subagent` 的 `prompt` 是字符串，文件以路径形式写入任务说明；与上游 Claude Code 适配的降级一致 | 映射 · 完整（附件的模型级块不传递，路径仍可读） | [claude-code L28](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L28) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| AGT-01 | `poteto-agent` 在开始任何工作前完整读取 `poteto-mode` 的 `SKILL.md`，包括 inline principles index | Agent preset 可以用 `persona` 放入同样要求；父级提示可以传绝对路径，DSH 子代理用 `read` 读取 | 标准 · 部分（G-12）。没有自动读取技能文件的代理类型，只有 persona 提示；进入 `PI-08` | [agents/poteto-agent.md#L1-L9](../upstream/cursor-plugins/pstack/agents/poteto-agent.md#L1-L9) · [E22](../upstream/deepseek-harness/packages/preset/persona/README.md#L28-L40) |
| AGT-02 | `comment-sicko` 是只读的评论审查者；保留许可证、公共 API doc comment、外部依赖约束等少量例外 | Agent preset 可以只挂只读工具并写 persona；`comment-sicko` 的完整规则可作为 preset 的 persona | 标准 · 部分（G-12）。只读可做到，但没有 `subagent_type` 直选；进入 `PI-08` | [agents/comment-sicko.md#L1-L32](../upstream/cursor-plugins/pstack/agents/comment-sicko.md#L1-L32) · [E22](../upstream/deepseek-harness/packages/preset/persona/README.md#L28-L40) |

### 2.3 模型选择

| 编号 | 上游期待 | DSH 对应项或缺失 | 审查结论 | 证据 |
|---|---|---|---|---|
| MOD-01 | `claude-<family>-<version>-<effort>[-fast]` 解析为模型 slug 加 effort | DSH 用 `provider`、`model`、`reasoning_effort` 三段，effort 的可用值由模型目录决定；没有 family 前缀解析和 `-fast` 后缀 | 映射 · 部分（G-01）。技能文本必须按 DSH 的 provider 与 model 重写，不能沿用 Cursor slug | [claude-code L34](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L34) · [E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L45-L79) · [E24](../upstream/deepseek-harness/packages/llm/llm/README.md#L28-L28) |
| MOD-02 | 非 Claude 的 `grok-*`、`gpt-*` 等 slug 省略 `model`，使用会话模型 | DSH 省略 `provider` 和 `model` 时子代理继承父级路由 | 映射 · 完整 | [claude-code L35](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L35) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| MOD-03 | `auto` 或 `inherit-parent` 省略 `model` | DSH 省略 `provider` 和 `model` 即继承父级当前路由；`reasoning_effort` 也按 route 继承规则处理 | 映射 · 完整 | [claude-code L36](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L36) · [E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L77-L79) |
| MOD-04 | `pstack-models.mdc` 规则文件为每个角色提供模型；角色行如 `feature, refactoring: grok-4.7-xhigh-fast` | DSH 没有等价的角色到模型规则文件；`AGENTS.md` 只加载为指令，不解析角色行；`subagentModelSelection` 是会话级 allowlist，不是角色表 | 标准 · 部分（G-01）。进入 `PI-02` | [claude-code L37](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L37) · [E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L45-L79) · [E20](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L219-L223) |
| MOD-05 | 角色值 `<model> <effort>` 解析为模型和 effort | DSH 的 `model` 与 `reasoning_effort` 是两个独立字段，技能文本可以拆分 | 映射 · 完整 | [claude-code L38](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L38) · [E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L45-L79) |
| MOD-06 | 17 条角色默认：feature 与 refactoring、bug-fix、perf-issue、hillclimb、judgment and prose、hardest tasks、how explorer 与 explainer、why investigators 与 synthesizer、reflect tooling 与 judgment 与 divergent 与 synthesizer、arena runners 与 cross-judge、swarm workers、architect runners、interrogate reviewers | DSH 没有内建角色表；只能通过每次 `subagent` 调用的 `provider`、`model`、`reasoning_effort` 字段或工具实例的 `agentOptions` 表达。标准 preset 的 `subagent` 开了 `modelSelection`，但没有 Session policy 时只能选父级路由 | 标准 · 部分（G-01）。角色表本身进入 `PI-02`；其余角色由技能文本按 DSH 模型目录重写 | [setup-pstack L49-L65](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L49-L65) · [poteto-mode L95-L101](../upstream/cursor-plugins/pstack/skills/poteto-mode/SKILL.md#L95-L101) · [E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L77-L79) |

### 2.4 setup-pstack

| 编号 | 上游期待 | DSH 对应项或缺失 | 审查结论 | 证据 |
|---|---|---|---|---|
| SET-01 | 枚举当前会话 `Task` 子代理可用的模型 slug | `list_subagent_models` 只有在 `modelDiscovery` 开启时存在；没有 Session policy 时只返回当前父级路由，不能枚举全部可用模型 | 标准 · 部分（G-01）。插件需要调用 `ctx.llm.listProviders()` 与 `listModels()`；进入 `PI-02` | [setup-pstack L12-L15](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L12-L15) · [E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L77-L79) · [E24](../upstream/deepseek-harness/packages/llm/llm/README.md#L89-L89) |
| SET-02 | 读取已有 `pstack-models.mdc`，保留用户改过的角色，丢弃已退役角色 | DSH 没有该文件或等价角色配置；`AGENTS.md` 不提供结构化角色解析 | 标准 · 部分（G-01）。进入 `PI-02` | [setup-pstack L16-L19](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L16-L19) · [E20](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L219-L223) |
| SET-03 | 用 `AskQuestion` 询问 `unlimited`、`large`、`medium`、`small` 四档预算 | `ask_user_question` 支持带描述的选项和单选；技能文本可以照搬四档标签 | 映射 · 完整 | [setup-pstack L20-L28](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L20-L28) · [E07](../upstream/deepseek-harness/docs/tool-catalog.md#L546-L616) |
| SET-04 | 按预算改写每个真实 slug 的 effort token，处理 `max`、`xhigh`、`high`、`medium`、`low` 阶梯和 `-fast` 后缀 | DSH 没有内建预算换算；`reasoning_effort` 的允许值由模型目录决定，非法值会被 adapter 拒绝 | 标准 · 部分（G-01）。预算映射逻辑进入 `PI-02`，并按 `ctx.llm.resolveModelInfo` 校验 | [setup-pstack L29-L31](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L29-L31) · [E24](../upstream/deepseek-harness/packages/llm/llm/README.md#L89-L89) |
| SET-05 | 展示每个角色和模型，标出不可用项，询问是否修改 | `ask_user_question` 可以逐项确认；展示表格由技能文本负责 | 映射 · 完整 | [setup-pstack L31-L31](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L31) · [E07](../upstream/deepseek-harness/docs/tool-catalog.md#L546-L616) |
| SET-06 | 把结果写入 `~/.cursor/rules/pstack-models.mdc`，覆盖整个文件，保持幂等，删除退役角色 | DSH 没有 `.cursor/rules`；可以写 `$DSH_HOME/pstack-models.mdc`（Issue #1 已验收，与上游同名），但没有任何 DSH 机制自动读取并应用 | 标准 · 部分（G-01）。写入格式和位置进入 `PI-02` | [setup-pstack L37-L66](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L37-L66) · [E20](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L30-L40) |
| SET-07 | 面板角色的列表长度决定子代理数量；`swarm workers` 是默认 worker 模型 | 技能文本可以对每个列表项发一次 `subagent` 调用；`swarm workers` 需要按角色表解析 | 映射 · 完整（面板扇出部分） | [setup-pstack L31-L31](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L31) · [E04](../upstream/deepseek-harness/docs/tool-catalog.md#L2062-L2092) |
| SET-08 | 首次检测项目是否已有验证技能和形式验证技能，必要时各询问一次 | `create-verification-skill` 与 `create-formal-verification-skill` 文本可移植；技能创建结果写项目技能目录 | 映射 · 完整 | [setup-pstack L72-L78](../upstream/cursor-plugins/pstack/skills/setup-pstack/SKILL.md#L72-L78) · [E01](../upstream/deepseek-harness/docs/subsystems/skills.md#L64-L89) |

### 2.5 路径

| 编号 | 上游期待 | DSH 对应项或缺失 | 审查结论 | 证据 |
|---|---|---|---|---|
| PATH-01 | `.cursor/skills/`、`~/.cursor/skills/` 存放技能 | DSH 扫描 `<projectRoot>/.dsh/skills`、`<projectRoot>/.agents/skills`、`$DSH_HOME/skills`、`~/.agents/skills`，并支持 `bundledSkillDir` | 映射 · 完整（目录名换为 DSH 根） | [claude-code L52](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L52) · [E01](../upstream/deepseek-harness/docs/subsystems/skills.md#L64-L89) |
| PATH-02 | `~/.cursor/plugins/`、`.cursor-plugin/plugin.json` 定位插件和代理 | DSH 用 profile、bundle 和 `cordis.patch.yml`；没有 `.cursor-plugin` 目录和缓存路径 | 映射 · 部分（G-13）。插件内容需通过 DSH bundle 或 profile 安装，不能按 Cursor 插件缓存路径查找 | [claude-code L53](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L53) · [docs/architecture.md#L9-L21](../docs/architecture.md#L9-L21) |
| PATH-03 | `.cursor/rules/*.mdc` 自动应用到每个会话；模型规则例外 | DSH 每个新会话加载 `$DSH_HOME/AGENTS.md`、`<agentsHome>/AGENTS.md` 和项目链；不解析 `.mdc`，也不解析 `@path` 导入 | 标准 · 部分（G-01、G-08）。指令文件可承载规则，但角色配置没有结构化入口；进入 `PI-02` | [claude-code L54](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L54) · [E20](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L30-L40) · [E20-限制](../upstream/deepseek-harness/packages/context/agent-instructions/README.md#L219-L223) |
| PATH-04 | GitHub 上的 pstack 文件链接改为本地 `<pstack>/<path>`，本地存在就不 fetch | DSH 的 `read` 与 `glob` 直接读本地文件；技能资源相对路径由 `resourceBase` 解析 | 映射 · 完整 | [claude-code L55](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L55) · [E02](../upstream/deepseek-harness/docs/subsystems/skills.md#L227-L233) |
| PATH-05 | 会话转写在 `~/.cursor/projects/<slug>/agent-transcripts/`，当前会话是最新 `.jsonl`，子代理在 `<session>/subagents/` | 标准模式没有跨会话读文件的模型工具；可选 `@deepseek-ai/dsh-experimental-session-search` 提供 `session_search`、`session_event_search`、`session_trace`、`session_event_read`，只允许同 `cwd` 的会话 | 可选 · 完整（`OPT-06`）。标准模式单独使用时见 G-03 | [claude-code L56](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L56) · [E18](../upstream/deepseek-harness/packages/experimental/session-search/README.md#L8-L20) |
| PATH-06 | `.cursor/skills/verify-<app>/` 项目本地验证技能 | DSH 项目技能放 `.dsh/skills/verify-<app>/` 或 `.agents/skills/verify-<app>/`，目录 bundle 规则一致 | 映射 · 完整 | [create-verification-skill L25-L36](../upstream/cursor-plugins/pstack/skills/create-verification-skill/SKILL.md#L25-L36) · [E01](../upstream/deepseek-harness/docs/subsystems/skills.md#L64-L89) |

### 2.6 脚本与运行时前提

| 编号 | 脚本与入口 | 运行时、依赖与外部命令 | 输入输出、格式与退出码 | DSH 对应或缺失 | 结论与证据 |
|---|---|---|---|---|---|
| SCR-01 | `skills/poteto-mode/scripts/check-plan.mjs`，`node check-plan.mjs <plan.md>` | Node `fs` 与 `process`；无第三方依赖；`#!/usr/bin/env node` | 读 Markdown，检查 H1、`## How to read this`、`## Program checklist` 的五个 H3 顺序、每个 PR 的九个子块、10 条 live lane、perf 四项、review gate、appendix；stdout 输出每 PR 统计，stderr 输出问题；退出 0（无问题）、1（有问题）、2（用法错误） | 标准模式可用 `bash` 调 `node`，但没有随包脚本路径与 id，Node 版本与路径不由 DSH 保证；进入 `PI-03` | `标准 · 部分`；[check-plan.mjs#L1-L205](../upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/check-plan.mjs#L1-L205) · [check-plan.test.ts#L1-L110](../upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/check-plan.test.ts#L1-L110) |
| SCR-02 | `skills/poteto-mode/scripts/watch-pr/watch-pr`，由 `bootstrap.ts` 自装依赖后调用 `cli.ts` | Bun shebang；`bootstrap.ts` 以 `package.json` 与 `bun.lock` 哈希校验并运行 `bun install --frozen-lockfile`；依赖 `commander@14.0.0`；外部 `gh` GraphQL | 模式 `single`、`stack`、`queued-stack`；`--status-only`、`--pretty`、`--interval`、`--sweep-interval`、`--timeout`、`--max-query-errors`；默认 NDJSON；verdict 集 `READY`、`WAITING`、`ADVANCE`、`COMPLETE`；退出码由 verdict 决定，参数错误 64 | DSH 不保证 Bun；标准 `bash` 可调 `gh`，但没有 pstack 的轮询与 stack 或 queue 判定；进入 `PI-05` | `标准 · 部分`；[watch-pr#L1-L6](../upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/watch-pr/watch-pr#L1-L6) · [cli.ts#L97-L215](../upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/watch-pr/cli.ts#L97-L215) · [bootstrap.ts#L1-L55](../upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/bootstrap.ts#L1-L55) |
| SCR-03 | `skills/poteto-mode/scripts/worktree-audit.sh [-b <ref>] [repo-path]` | Bash；`git`、`jq`、`rg`、`du`、`stat`、`date`、`awk`、`sed`、`xargs`；读取 `~/.cursor/projects/<slug>/agent-transcripts` | TSV 列 `SIZE`、`AGE`、`MERGED`、`DIRTY`、`REMOTE`、`PR`、`LAST_CHAT`、`BUCKET`、`WORKTREE`；只读，不删除；退出 0（成功）、1（不在 git 仓库或无 base）、2（参数错误） | 标准 `bash` 可运行 git、jq、rg，但 Cursor 转写路径不存在，聊天列需 DSH 会话搜索或标 unknown；进入 `PI-06` | `标准 · 部分`；[worktree-audit.sh#L1-L134](../upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/worktree-audit.sh#L1-L134) |
| SCR-04 | `skills/show-me-your-work/scripts/log.sh <logfile> <phase> <decision> <why> <evidence> <result>` | Bash `set -euo pipefail`；`date`、`tr`、`printf` | 首次写入 TSV header，UTC ISO8601 时间戳，清理 tab、换行、CR，转义 `=`、`+`、`-`、`@` 前缀，追加一行；参数数不为 6 退出 1 | DSH `bash` 可直接运行，但 Windows 与 Electron 运行时和 `pstack_script` 统一 Node 方案要求等价重写；进入 `PI-07` | `标准 · 部分`；[log.sh#L1-L42](../upstream/cursor-plugins/pstack/skills/show-me-your-work/scripts/log.sh#L1-L42) |
| SCR-05 | `skills/statechart/scripts/statechart SPEC.tla [--config FILE] [--view FILE] [--out DIR]`，入口 `statechart.ts` 经 `worker.ts` 调用 `run.ts` 与 `pipeline.ts` | 启动器检测 Node 22.18 或 23.6 以上、Bun 1.1.5 以上、Deno 2.0 以上；实际运行 TypeScript；外部 `mise` 安装 TLC 与 Java，首次运行需要网络；TLC 与 TLA+ 工具链 | 读 TLA+ spec、cfg、view；写 `report.md`、`chart.mmd`、`tlc.out`、每个失败规则的 `tlc-RULE.out`；退出 0（全部规则成立）、1（有规则破坏）、2（TLC 错误、信号或无法运行）、130 或 143（SIGINT 或 SIGTERM）；只有 0 和 1 写输出 | DSH 标准模式只有 `bash`，不保证 Node、Java、mise、TLC；没有随包脚本 id；进入 `PI-09` | `标准 · 部分`；[statechart#L1-L29](../upstream/cursor-plugins/pstack/skills/statechart/scripts/statechart#L1-L29) · [statechart.ts#L1-L164](../upstream/cursor-plugins/pstack/skills/statechart/scripts/statechart.ts#L1-L164) |
| SCR-06 | `skills/poteto-mode/scripts/orch/{orch,store}.ts` | 上游在 `1ba91fc` 已删除；本地旧镜像随之删除 | 无调用点 | 无 | `无调用点（已删除）`；[prepare §3](../docs/port-prepare.md#L34-L39) |
| SCR-07 | `skills/poteto-mode/scripts/bootstrap.ts`、`package.json`、`bun.lock`、`check-plan.test.ts`、`watch-pr/*.test.ts`、`statechart/scripts/test/**` | Bun 或 pnpm 安装与测试资产；`bootstrap.ts` 只服务 watch-pr 自装依赖 | 不对外暴露入口 | 不单独移植；构建由本仓 pnpm 与 profile 负责；测试用例作为行为验收参考 | `资产，不单独成项`；[prepare §4](../docs/port-prepare.md#L45-L60) |

`docs/port-prepare.md` 已确认 pstack 子树在 `1ba91fc..4dd1d05` 间无文件差异，树哈希一致。第 2.6 节的 SCR 行为继续以上游 `4dd1d05` 为准；`SCR-06` 与 `SCR-07` 只作脚本去向记录，不进入 135 个原子能力编号和分阶段状态表。

### 2.7 技能（33 项；`setup-pstack` 见 2.4）

#### 2.7.1 普通技能（33 项）

| 编号 | 能力 | 上游证据 | DSH 实际与覆盖 | 缺口 |
|---|---|---|---|---|
| SKL-01 | `poteto-mode`：匹配 23 个 playbook、复制步骤到 todo、路由其他技能、按消费者和维护者写回复 | [skills/poteto-mode/SKILL.md#L1-L150](../upstream/cursor-plugins/pstack/skills/poteto-mode/SKILL.md#L1-L150) | 技能文本可加载；路由依赖 `TOOL-04b`，模型角色依赖 G-01，todo skip 依赖 G-11，常驻模式依赖 G-08 | 部分（G-01、G-02、G-08、G-11） |
| SKL-02 | `poteto-help`：按问题路由到技能或 guide，给一条可发送的 prompt，不启动工作 | [skills/poteto-help/SKILL.md#L1-L163](../upstream/cursor-plugins/pstack/skills/poteto-help/SKILL.md#L1-L163) | 技能文本可加载；检查 `pstack-models.mdc` 和模式状态的逻辑依赖 G-01、G-08 | 部分（G-01、G-08） |
| SKL-03 | `in-your-own-words`：复述用户目标与问题 | [skills/in-your-own-words/SKILL.md#L1-L7](../upstream/cursor-plugins/pstack/skills/in-your-own-words/SKILL.md#L1-L7) | 纯指令，无运行时依赖 | 完整 |
| SKL-04 | `sharpen`：说明专家会多做什么，再改写 prompt，不做任务 | [skills/sharpen/SKILL.md#L1-L16](../upstream/cursor-plugins/pstack/skills/sharpen/SKILL.md#L1-L16) | 纯指令，无运行时依赖 | 完整 |
| SKL-05 | `how`：架构走查，复杂子系统 2 到 4 个只读 explorer，再由 explainer 综合 | [skills/how/SKILL.md#L1-L36](../upstream/cursor-plugins/pstack/skills/how/SKILL.md#L1-L36) | 技能文本可加载；子代理与只读 preset 依赖 G-12，角色模型依赖 G-01 | 部分（G-01、G-12） |
| SKL-06 | `why`：并行查询 7 类证据源，按置信度分层输出并标注缺口 | [skills/why/SKILL.md#L1-L98](../upstream/cursor-plugins/pstack/skills/why/SKILL.md#L1-L98) | 技能文本可加载；MCP 类别发现依赖 G-06，角色模型依赖 G-01 | 部分（G-01、G-06） |
| SKL-07 | `teach`：组合 `how` 与 `why` 成一篇渐进解释，空间概念用生成图 | [skills/teach/SKILL.md#L1-L21](../upstream/cursor-plugins/pstack/skills/teach/SKILL.md#L1-L21) | 依赖 `how` 与 `why` 的 G-01、G-06；图像生成依赖 G-15 | 部分（G-01、G-06、G-15） |
| SKL-08 | `recall`：从自己的聊天历史和共享记录重建当前状态 brief | [skills/recall/SKILL.md#L1-L35](../upstream/cursor-plugins/pstack/skills/recall/SKILL.md#L1-L35) | 技能文本可加载；标准模式无跨会话读取，启用 `OPT-06` 后补足；角色模型依赖 G-01 | 部分（G-01、G-03） |
| SKL-09 | `ketchup`：用平实语言和小图汇报本次聊天变化，并列出等待用户决定的事项 | [skills/ketchup/SKILL.md#L1-L43](../upstream/cursor-plugins/pstack/skills/ketchup/SKILL.md#L1-L43) | 纯指令；截图与图片依赖宿主渲染，文字部分完整 | 完整 |
| SKL-10 | `blast-radius`：找出一处改动在别处可能破坏什么，并用运行代码证明那个安全事实 | [skills/blast-radius/SKILL.md#L1-L50](../upstream/cursor-plugins/pstack/skills/blast-radius/SKILL.md#L1-L50) | 纯指令加标准 shell 与 read | 完整 |
| SKL-11 | `architect`：先 `how` 与 `why` 接地，再用 `arena` 产出多个设计候选，综合后实现 | [skills/architect/SKILL.md#L1-L79](../upstream/cursor-plugins/pstack/skills/architect/SKILL.md#L1-L79) | 依赖 G-01 的角色模型、G-05 的隔离工作树 | 部分（G-01、G-05） |
| SKL-12 | `arena`：N 个并行候选，每个独立工作树，跨评审选 base 后嫁接 | [skills/arena/SKILL.md#L1-L48](../upstream/cursor-plugins/pstack/skills/arena/SKILL.md#L1-L48) | 子代理可用；每候选独立工作树依赖可选 worktree 或 shell，角色模型依赖 G-01 | 部分（G-01、G-05） |
| SKL-13 | `swarm`：把独立切片或 race 分给 N 个 worker，父级汇总一个 PASS、ISSUES、BLOCKED 报告 | [skills/swarm/SKILL.md#L1-L41](../upstream/cursor-plugins/pstack/skills/swarm/SKILL.md#L1-L41) | 本地 worker 可用；上游默认云 worker 被排除，容量默认 8 需配置 | 部分（G-01、G-05、G-09） |
| SKL-14 | `interrogate`：不同模型对同一 diff 做对抗评审，只保留运行证明的 finding | [skills/interrogate/SKILL.md#L1-L31](../upstream/cursor-plugins/pstack/skills/interrogate/SKILL.md#L1-L31) | 多模型评审需要 G-01 的角色路由；每个 adversary 的独立工作树依赖 G-05；单模型仍可运行但失去多样性 | 部分（G-01、G-05） |
| SKL-15 | `figure-it-out`：没有合适 playbook 时设计一套可审计的工作流 | [skills/figure-it-out/SKILL.md#L1-L52](../upstream/cursor-plugins/pstack/skills/figure-it-out/SKILL.md#L1-L52) | 纯指令，无额外运行时依赖 | 完整 |
| SKL-16 | `tdd`：先写最小失败测试，再做最小修复并重跑 | [skills/tdd/SKILL.md#L1-L42](../upstream/cursor-plugins/pstack/skills/tdd/SKILL.md#L1-L42) | 纯指令加标准 shell 与 edit | 完整 |
| SKL-17 | `benchmark-checklist`：用七个问题审查性能数字，输出 faster、slower、no difference、inconclusive | [skills/benchmark-checklist/SKILL.md#L1-L39](../upstream/cursor-plugins/pstack/skills/benchmark-checklist/SKILL.md#L1-L39) | 纯指令加标准 shell | 完整 |
| SKL-18 | `create-verification-skill`：访谈仓库，生成 `.cursor/skills/verify-<app>/`，含 Launch、Doctor、Drive、Evidence、Cleanup 和 feature map | [skills/create-verification-skill/SKILL.md#L1-L44](../upstream/cursor-plugins/pstack/skills/create-verification-skill/SKILL.md#L1-L44) | 生成器本身可写文件；驱动真实 UI 依赖可选 `OPT-03`、`OPT-04`、`OPT-05`，视频证据未覆盖 | 部分（G-04、G-15） |
| SKL-19 | `maintain-verification-skill`：每个 feature 一个只读源阅读器，再做一次 live pass，最多一个 PR | [skills/maintain-verification-skill/SKILL.md#L1-L39](../upstream/cursor-plugins/pstack/skills/maintain-verification-skill/SKILL.md#L1-L39) | 同 `SKL-18`，依赖真实 app 控制能力 | 部分（G-04、G-15） |
| SKL-20 | `create-formal-verification-skill`：选最强属性，选验证工具，生成项目本地验证技能 | [skills/create-formal-verification-skill/SKILL.md#L1-L43](../upstream/cursor-plugins/pstack/skills/create-formal-verification-skill/SKILL.md#L1-L43) | 纯指令加标准 shell 与文件；具体工具由项目安装；TLA+ 结果用 `/statechart` 读取 | 完整 |
| SKL-21 | `maintain-formal-verification-skill`：代码变更后更新模型、工具、属性，重跑并区分 drift 与 bug | [skills/maintain-formal-verification-skill/SKILL.md#L1-L58](../upstream/cursor-plugins/pstack/skills/maintain-formal-verification-skill/SKILL.md#L1-L58) | 纯指令加标准 shell 与文件 | 完整 |
| SKL-22 | `unslop`：按 33 条稳定规则清除 AI 文风 | [skills/unslop/SKILL.md#L1-L62](../upstream/cursor-plugins/pstack/skills/unslop/SKILL.md#L1-L62) | 纯指令 | 完整 |
| SKL-23 | `technical-writing`：Diátaxis、Google developer style、STE、Global English 四层标准 | [skills/technical-writing/SKILL.md#L1-L106](../upstream/cursor-plugins/pstack/skills/technical-writing/SKILL.md#L1-L106) | 纯指令 | 完整 |
| SKL-24 | `no-comments`：启动 Comment Sicko，接受或拒绝 findings，必要时把约束编码为类型、测试或 lint | [skills/no-comments/SKILL.md#L1-L24](../upstream/cursor-plugins/pstack/skills/no-comments/SKILL.md#L1-L24) | 依赖 `AGT-02` 的只读审查 preset，见 `PI-08` | 部分（G-12） |
| SKL-25 | `typescript-best-practices`：把类型系统纪律落到 TypeScript 语法规则 | [skills/typescript-best-practices/SKILL.md#L1-L31](../upstream/cursor-plugins/pstack/skills/typescript-best-practices/SKILL.md#L1-L31) | 纯指令；`paths` 自动挂载在 DSH 不生效，需手动 `/typescript-best-practices` | 部分（G-14） |
| SKL-26 | `bro`：用平实语言重述上一段回复 | [skills/bro/SKILL.md#L1-L7](../upstream/cursor-plugins/pstack/skills/bro/SKILL.md#L1-L7) | 纯指令 | 完整 |
| SKL-27 | `reflect`：读当前转写，三个并行 reviewer，综合成技能编辑 | [skills/reflect/SKILL.md#L1-L69](../upstream/cursor-plugins/pstack/skills/reflect/SKILL.md#L1-L69) | 依赖 G-03；启用 `OPT-06` 后可读当前与历史会话；角色模型依赖 G-01 | 部分（G-01、G-03） |
| SKL-28 | `correct`：从历史错误归纳 mistake class，按 architecture、types、lint、test、docs 顺序修复 | [skills/correct/SKILL.md#L1-L32](../upstream/cursor-plugins/pstack/skills/correct/SKILL.md#L1-L32) | 纯指令加标准 shell 与文件 | 完整 |
| SKL-29 | `automate-me`：从历史挖掘工作习惯，生成个人 `-mode` 技能 | [skills/automate-me/SKILL.md#L1-L104](../upstream/cursor-plugins/pstack/skills/automate-me/SKILL.md#L1-L104) | 依赖 G-03 的历史读取；`create-skill` 用 `writing-for-agents` 代替；角色模型依赖 G-01 | 部分（G-01、G-03） |
| SKL-30 | `show-me-your-work`：维护 TSV 决策日志，审计转写，跑跨模型 reviewer | [skills/show-me-your-work/SKILL.md#L1-L82](../upstream/cursor-plugins/pstack/skills/show-me-your-work/SKILL.md#L1-L82) | 日志格式可移植；转写审计依赖 G-03，跨模型 reviewer 依赖 G-01；`log.sh` 进入 `PI-07` | 部分（G-01、G-03） |
| SKL-31 | `make-bot-ui`：生成页面，按钮通过本地服务器唤醒 Grok Bot；含 sender key 和 Tailscale | [skills/make-bot-ui/SKILL.md#L1-L115](../upstream/cursor-plugins/pstack/skills/make-bot-ui/SKILL.md#L1-L115) | 本地页面、服务器和 Tailscale 可用标准 shell 与代码生成；`update_state`、`SendToUser` 和 routine wake 是 Cursor Automations | 平台排除（EXCL-01） |
| SKL-32 | `ketchup-video`：把 `/ketchup` 的结果做成带字幕的短视频幻灯片 | [skills/ketchup-video/SKILL.md#L1-L29](../upstream/cursor-plugins/pstack/skills/ketchup-video/SKILL.md#L1-L29) | 文本与幻灯片规划可做；mp4 渲染、字幕烧录和逐帧核验依赖外部 ffmpeg 或录屏工具，DSH 没有视频渲染工具 | 部分（G-15） |
| SKL-33 | `statechart`：检查 TLA+ 模型并把用户可见状态画成 Mermaid 状态图，给出每条规则破坏的最短路径 | [skills/statechart/SKILL.md#L1-L82](../upstream/cursor-plugins/pstack/skills/statechart/SKILL.md#L1-L82) | 指令可加载；`scripts/statechart` 的 Node 端口进入 `PI-09`，TLC、Java、mise 与首次联网安装依赖 G-15 | 部分（G-15、PI-09） |

### 2.8 Playbook（23 项）

| 编号 | 能力 | 上游证据 | DSH 实际与覆盖 | 缺口 |
|---|---|---|---|---|
| PB-01 | Investigation：只读调查，产出带引用的解释或建议 | [playbooks/investigation.md#L1-L14](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/investigation.md#L1-L14) | 依赖 `how` 与 `why` 的 G-01 | 部分（G-01） |
| PB-02 | Bug fix：在同一界面自行复现，二分定位，最小修复，重跑原 repro | [playbooks/bug-fix.md#L1-L15](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/bug-fix.md#L1-L15) | 标准 shell 可做代码修复；界面复现依赖 G-04 | 部分（G-01、G-04） |
| PB-03 | Perf issue：先抓 baseline trace，按性能箴言定位，测量后修复 | [playbooks/perf-issue.md#L1-L25](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/perf-issue.md#L1-L25) | 标准 shell 可做 profile；运行中的界面或浏览器 trace 依赖 G-04 | 部分（G-01、G-04） |
| PB-04 | Hillclimb：一个指标、一个冻结 harness、一次一个假设，保留或回滚 | [playbooks/hillclimb.md#L1-L21](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/hillclimb.md#L1-L21) | 标准 shell 加子代理；角色模型依赖 G-01；决策日志依赖 `SKL-30` | 部分（G-01、G-03） |
| PB-05 | Runtime forensics：instrumentation 活进程，输出诊断而非修复 | [playbooks/runtime-forensics.md#L1-L11](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/runtime-forensics.md#L1-L11) | 需要运行中的浏览器或桌面进程控制，依赖 G-04 | 部分（G-04） |
| PB-06 | Trace forensics：读已捕获的 profile、trace、spindump、heap，映射到源码 | [playbooks/trace-forensics.md#L1-L14](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/trace-forensics.md#L1-L14) | 标准 shell 加文件读取 | 完整 |
| PB-07 | Feature：`how`、`architect`、throughput checkpoint、子代理实现、验证 | [playbooks/feature.md#L1-L21](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/feature.md#L1-L21) | 依赖 G-01 的角色模型、G-05 的工作树隔离 | 部分（G-01、G-05） |
| PB-08 | Refactoring：先 pin 行为，再按目标形状小步迁移，删除旧 API | [playbooks/refactoring.md#L1-L16](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/refactoring.md#L1-L16) | 纯指令加标准 shell 与 edit | 完整 |
| PB-09 | Prototype：在 scratch 目录做可丢弃变体，用截图或时序证明选择 | [playbooks/prototype.md#L1-L14](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/prototype.md#L1-L14) | 代码生成可做；浏览器截图依赖 G-04 | 部分（G-04） |
| PB-10 | Visual parity：以 baseline 为规格，用 image diff 证明像素一致 | [playbooks/visual-parity.md#L1-L11](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/visual-parity.md#L1-L11) | baseline 与 diff 脚本可写；真实浏览器截图依赖 G-04 | 部分（G-04） |
| PB-11 | Authoring a skill：按 create-skill 流程写、校验、测试、开 PR | [playbooks/authoring-a-skill.md#L1-L12](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md#L1-L12) | 直接按 DSH `SKILL.md` 格式写文件；`create-skill` 由 `writing-for-agents` 替代（AD-04） | 完整 |
| PB-12 | Eval：盲化候选、同 prompt、独立 sanitized 目录、单 judge、读转写核 chain | [playbooks/eval.md#L1-L25](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/eval.md#L1-L25) | 子代理可跑；多模型角色依赖 G-01，转写核验依赖 G-03 | 部分（G-01、G-03） |
| PB-13 | Babysit：驱动 PR 或 stack 到 merge-ready，按 conflicts、threads、CI 顺序处理 | [playbooks/babysit.md#L1-L23](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/babysit.md#L1-L23) | 标准 shell 可跑 `gh`；Bugbot 专属部分被排除，`watch-pr` 进入 `PI-05` | 部分（G-07、EXCL-02、PI-05） |
| PB-14 | Shipping：每个 PR 独立验证，只落地从底部连续的 verified run | [playbooks/shipping.md#L1-L12](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/shipping.md#L1-L12) | 标准 shell `gh` 加子代理；queued watcher 依赖 `PI-05`，`origin` 用 `gh` 替代 | 部分（G-07、PI-05） |
| PB-15 | Autonomous run：先写可检查的 exit predicate，再按事件或心跳驱动到完成 | [playbooks/autonomous-run.md#L1-L13](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/autonomous-run.md#L1-L13) | `create_goal` 自动续轮，`schedule_*` 按 RFC 5545 做定时心跳，后台 job 完成通知做事件唤醒；无 `/loop` 命令 | 部分（G-10） |
| PB-16 | Orchestrate：多日、多个 stacked PR、协调者、子协调者、worker 三级 | [playbooks/orchestrate.md#L1-L25](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/orchestrate.md#L1-L25) | 子代理默认深度 1、容量 8；Project tracker 与 PR 事件订阅缺失；云 worker 被排除 | 部分（G-01、G-03、G-05、G-09、EXCL-04） |
| PB-17 | Autopilot-full：每个 PR 一个 owner，swarm 验证后由 owner merge | [playbooks/autopilot-full.md#L1-L25](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/autopilot-full.md#L1-L25) | 本地 owner 可跑；云 VM、深度、forge 状态需配置或排除 | 部分（G-01、G-05、G-07、G-09） |
| PB-18 | Autopilot-stack：同样 owner 循环，但只交付线性 stack 给操作者落地 | [playbooks/autopilot-stack.md#L1-L8](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/autopilot-stack.md#L1-L8) | 同 `PB-17`，但不需要 merge 权限 | 部分（G-01、G-05、G-07、G-09） |
| PB-19 | Session pickup：读先前 trail，重建分支状态，命名 resume point | [playbooks/session-pickup.md#L1-L11](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/session-pickup.md#L1-L11) | 依赖 G-03；git 状态由标准 shell 读 | 部分（G-03） |
| PB-20 | Pause safely：在安全边界停下，提交 wip checkpoint，写 resume note | [playbooks/pause-safely.md#L1-L10](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/pause-safely.md#L1-L10) | 纯指令加标准 shell 与 git | 完整 |
| PB-21 | Multi-phase plan：先原型解决开放问题，再写每个 PR 的 checklist 与证据 | [playbooks/multi-phase-plan.md#L1-L155](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md#L1-L155) | 计划内容可写；`check-plan.mjs` 进入 `PI-03` | 部分（PI-03） |
| PB-22 | Worktree cleanup：按 merge 状态、未提交工作、聊天占用分类，安全门后删除 | [playbooks/worktree-cleanup.md#L1-L12](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md#L1-L12) | git 命令可跑；`worktree-audit` 进入 `PI-06`，聊天占用依赖 G-03 | 部分（G-03、PI-06） |
| PB-23 | Opening a PR：worktree、small ordered commits、clean diff、unslop、forge PR | [playbooks/opening-a-pr.md#L1-L34](../upstream/cursor-plugins/pstack/skills/poteto-mode/playbooks/opening-a-pr.md#L1-L34) | 标准 shell `gh` 加子代理；`deslop` 是外部插件，缺失时按上游 fallback 用普通语言要求 | 完整（条件：宿主有 `gh`；`deslop` 外部） |

### 2.9 Principle（24 项）

所有 principle 都是单条规则文本，没有运行时依赖。它们统一按 DSH 技能格式加载；`poteto-mode` 的 inline index 仍可以在技能正文里保留。下表每项结论都是 `映射 · 完整`。

| 编号 | 规则 | 上游证据 |
|---|---|---|
| PRIN-01 | Laziness Protocol：偏删除和最小改动 | [skills/principle-laziness-protocol/SKILL.md#L1-L10](../upstream/cursor-plugins/pstack/skills/principle-laziness-protocol/SKILL.md#L1-L10) |
| PRIN-02 | Foundational Thinking：先定核心类型与数据结构 | [skills/principle-foundational-thinking/SKILL.md#L1-L21](../upstream/cursor-plugins/pstack/skills/principle-foundational-thinking/SKILL.md#L1-L21) |
| PRIN-03 | Redesign from First Principles：把新需求当成第一天就存在 | [skills/principle-redesign-from-first-principles/SKILL.md#L1-L16](../upstream/cursor-plugins/pstack/skills/principle-redesign-from-first-principles/SKILL.md#L1-L16) |
| PRIN-04 | Attack the Premise：两个以上同 premise 的修复失败时先验证 premise | [skills/principle-attack-the-premise/SKILL.md#L1-L21](../upstream/cursor-plugins/pstack/skills/principle-attack-the-premise/SKILL.md#L1-L21) |
| PRIN-05 | Subtract Before You Add：先删死重量再添加 | [skills/principle-subtract-before-you-add/SKILL.md#L1-L18](../upstream/cursor-plugins/pstack/skills/principle-subtract-before-you-add/SKILL.md#L1-L18) |
| PRIN-06 | Minimize Reader Load：压缩层数与读者要记住的状态 | [skills/principle-minimize-reader-load/SKILL.md#L1-L18](../upstream/cursor-plugins/pstack/skills/principle-minimize-reader-load/SKILL.md#L1-L18) |
| PRIN-07 | Outcome-Oriented Execution：朝目标架构收敛，不保留临时兼容态 | [skills/principle-outcome-oriented-execution/SKILL.md#L1-L21](../upstream/cursor-plugins/pstack/skills/principle-outcome-oriented-execution/SKILL.md#L1-L21) |
| PRIN-08 | Experience First：用户愉悦优先于实现便利 | [skills/principle-experience-first/SKILL.md#L1-L19](../upstream/cursor-plugins/pstack/skills/principle-experience-first/SKILL.md#L1-L19) |
| PRIN-09 | Exhaust the Design Space：2 到 3 个竞争原型再定 | [skills/principle-exhaust-the-design-space/SKILL.md#L1-L9](../upstream/cursor-plugins/pstack/skills/principle-exhaust-the-design-space/SKILL.md#L1-L9) |
| PRIN-10 | Build the Lever：把工作做成可重跑的工具或检查 | [skills/principle-build-the-lever/SKILL.md#L1-L23](../upstream/cursor-plugins/pstack/skills/principle-build-the-lever/SKILL.md#L1-L23) |
| PRIN-11 | Model the Domain：用结构表达领域，不用散落条件 | [skills/principle-model-the-domain/SKILL.md#L1-L24](../upstream/cursor-plugins/pstack/skills/principle-model-the-domain/SKILL.md#L1-L24) |
| PRIN-12 | Boundary Discipline：验证集中在系统边界 | [skills/principle-boundary-discipline/SKILL.md#L1-L34](../upstream/cursor-plugins/pstack/skills/principle-boundary-discipline/SKILL.md#L1-L34) |
| PRIN-13 | Type System Discipline：让非法状态不可表示 | [skills/principle-type-system-discipline/SKILL.md#L1-L13](../upstream/cursor-plugins/pstack/skills/principle-type-system-discipline/SKILL.md#L1-L13) |
| PRIN-14 | Make Operations Idempotent：重复运行收敛到同一状态 | [skills/principle-make-operations-idempotent/SKILL.md#L1-L22](../upstream/cursor-plugins/pstack/skills/principle-make-operations-idempotent/SKILL.md#L1-L22) |
| PRIN-15 | Migrate Callers Then Delete Legacy APIs：同一波迁移调用方并删旧 API | [skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md#L1-L14](../upstream/cursor-plugins/pstack/skills/principle-migrate-callers-then-delete-legacy-apis/SKILL.md#L1-L14) |
| PRIN-16 | Separate Before Serializing Shared State：先消除共享再谈锁 | [skills/principle-separate-before-serializing-shared-state/SKILL.md#L1-L16](../upstream/cursor-plugins/pstack/skills/principle-separate-before-serializing-shared-state/SKILL.md#L1-L16) |
| PRIN-17 | Prove It Works：对真实产物验证，不用代理指标 | [skills/principle-prove-it-works/SKILL.md#L1-L22](../upstream/cursor-plugins/pstack/skills/principle-prove-it-works/SKILL.md#L1-L22) |
| PRIN-18 | Fix Root Causes：沿症状追到第一次出错的位置 | [skills/principle-fix-root-causes/SKILL.md#L1-L21](../upstream/cursor-plugins/pstack/skills/principle-fix-root-causes/SKILL.md#L1-L21) |
| PRIN-19 | Sequence Verifiable Units：每个小单元以可检查状态结束 | [skills/principle-sequence-verifiable-units/SKILL.md#L1-L17](../upstream/cursor-plugins/pstack/skills/principle-sequence-verifiable-units/SKILL.md#L1-L17) |
| PRIN-20 | Test Behavior, Not Implementation：断言用户可观察的行为 | [skills/principle-test-behavior-not-implementation/SKILL.md#L1-L20](../upstream/cursor-plugins/pstack/skills/principle-test-behavior-not-implementation/SKILL.md#L1-L20) |
| PRIN-21 | Explain the Number：说出限制因素，排除测错对象的可能 | [skills/principle-explain-the-number/SKILL.md#L1-L18](../upstream/cursor-plugins/pstack/skills/principle-explain-the-number/SKILL.md#L1-L18) |
| PRIN-22 | Guard the Context Window：把 bulk 交给子代理，主线程留摘要 | [skills/principle-guard-the-context-window/SKILL.md#L1-L12](../upstream/cursor-plugins/pstack/skills/principle-guard-the-context-window/SKILL.md#L1-L12) |
| PRIN-23 | Never Block on the Human：可逆工作先做后报，不可逆才确认 | [skills/principle-never-block-on-the-human/SKILL.md#L1-L15](../upstream/cursor-plugins/pstack/skills/principle-never-block-on-the-human/SKILL.md#L1-L15) |
| PRIN-24 | Encode Lessons in Structure：把重复指令变成 lint、检查或脚本 | [skills/principle-encode-lessons-in-structure/SKILL.md#L1-L11](../upstream/cursor-plugins/pstack/skills/principle-encode-lessons-in-structure/SKILL.md#L1-L11) |

## 3. 标准模式与可选插件

### 3.1 覆盖总览

| 覆盖层 | 完整 | 部分 | 合计 |
|---|---:|---:|---:|
| 映射 | 44 | 3 | 47 |
| 标准模式 | 18 | 54 | 72 |
| 可选插件 | 1 | 2 | 3 |
| 平台排除 | 13 | 0 | 13 |
| 合计 | 76 | 59 | 135 |

说明：

- 映射的 47 项由第 2 节的 20 个完整转换项、3 个语义差异项（`TOOL-03`、`MOD-01`、`PATH-02`）和 24 个 principle 组成。第 2 节的 20 个完整项是 `TOOL` 4 项、`SUB` 6 项、`MOD` 3 项、`SET` 4 项、`PATH` 3 项。
- 标准模式的 72 项由 18 个完整项和 54 个部分项组成。18 个完整项是 13 个技能与 5 个 playbook；54 个部分项是 19 个技能、18 个 playbook 和第 2 节的 17 个模板或脚本项（`TOOL-04b`、`SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`MOD-04`、`MOD-06`、`SET-01`、`SET-02`、`SET-04`、`SET-06`、`PATH-03`、`SCR-01` 至 `SCR-05`）。
- 可选插件的 3 项是 `SUB-05`、`SUB-07` 两个部分项和 `PATH-05` 一个完整项；其余可选插件只是在部分覆盖项上补强，不另立主层。
- 平台排除的 13 项是 6 个 benny automation、6 个 Cursor 平台能力和 `SKL-31` 的 Cursor 专属部分。

### 3.2 标准模式结论

标准模式能加载全部 58 个 `SKILL.md`，能读写文件、运行 shell、使用子代理、todo、用户提问、目标、定时任务、workflow 和后台 job。完整的 18 项是：

- 技能：`SKL-03`、`SKL-04`、`SKL-09`、`SKL-10`、`SKL-15`、`SKL-16`、`SKL-17`、`SKL-20`、`SKL-21`、`SKL-22`、`SKL-23`、`SKL-26`、`SKL-28`。
- Playbook：`PB-06`、`PB-08`、`PB-11`、`PB-20`、`PB-23`。

其余 54 项是标准模式的部分覆盖，缺口统一在 3.4 节按 G-01 至 G-15 展开。标准模式不能代替本仓插件提供的隐藏技能加载、角色模型路由、命名代理 preset 和随包脚本 id。

### 3.3 可选插件覆盖

以下插件由 DSH 官方发布，默认未启用；多数随安装提供，CUA 通过 on-demand catalog 安装。只有明确启用后才算数。实验性状态取自各包 README 的标注。

| 编号 | 可选插件 ID | 默认状态、实验性、启用条件 | 覆盖能力 | 支持范围与缺口 | 证据 |
|---|---|---|---|---|---|
| OPT-01 | `@deepseek-ai/dsh-experimental-tool-worktree`，配套 `@deepseek-ai/dsh-experimental-worktree` | 默认关闭；实验性；在 Plugins 的 Git worktrees 打开，或显式挂载两行 | `SUB-05`、`SUB-07`、`SKL-11`、`SKL-12`、`SKL-13`、`PB-07`、`PB-16` 至 `PB-18` 的本地隔离部分 | 支持创建新分支和检出目录，`from` 指定本地 ref，改变当前 Session 目录。缺口是无云 VM，不自动为每个子代理开工作树，`from` 不 fetch，多个候选要自己用 shell 建树 | [packages/experimental/tool-worktree/README.md#L5-L34](../upstream/deepseek-harness/packages/experimental/tool-worktree/README.md#L5-L34) · [E13](../upstream/deepseek-harness/docs/tool-catalog.md#L2608-L2634) |
| OPT-02 | `@deepseek-ai/dsh-experimental-forge-bundle` | 默认关闭；实验性；在 Plugins 启用 Change requests and worktrees；需要宿主 `gh` 登录 | `PB-13`、`PB-14`、`PB-17`、`PB-18`、`PB-23` 的 GitHub 状态展示 | 支持 PR 状态轮询、按需读取完整 checks、面板侧行内评论与 review 提交、mark ready、merge、Session 绑定和工作树选项。缺口是模型侧没有变更请求工具，只有面板；没有 pstack 的 stack 或 queued-stack verdict；没有 `origin` CLI | [packages/experimental/forge-bundle/README.md#L10-L65](../upstream/deepseek-harness/packages/experimental/forge-bundle/README.md#L10-L65) · [packages/experimental/client-ui-forge/README.md#L28-L40](../upstream/deepseek-harness/packages/experimental/client-ui-forge/README.md#L28-L40) · [E14](../upstream/deepseek-harness/docs/subsystems/forge.md#L5-L18) |
| OPT-03 | `@deepseek-ai/dsh-browser-use` 加 `@deepseek-ai/dsh-experimental-browser-use-stagehand-native`、`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp` 或 `@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp` | 默认关闭；provider 实验性；显式挂载 `dsh-browser-use` 加一个 provider | `SKL-18`、`SKL-19`、`PB-02`、`PB-03`、`PB-05`、`PB-09`、`PB-10` 的浏览器驱动 | 支持导航、点击、输入、截图、ARIA snapshot。缺口是没有视频录制；Stagehand 原生 provider 需要 Chromium 和独立模型；不同 provider 的 selector 与工具不同；单 provider 槽互斥 | [E15](../upstream/deepseek-harness/docs/subsystems/browser-use.md#L9-L15) · [packages/experimental/browser-use-stagehand-native/README.md#L9-L20](../upstream/deepseek-harness/packages/experimental/browser-use-stagehand-native/README.md#L9-L20) |
| OPT-04 | `@deepseek-ai/dsh-cua-bundle` | 按需安装、默认关闭；实验性；仅 macOS PTC；在 Plugins 安装并启用 bundle | `SKL-18`、`SKL-19`、`PB-02`、`PB-05`、`PB-09`、`PB-10` 的桌面应用驱动 | 支持 macOS 应用点击、输入、截图，权限页和会话级授权。缺口是仅 macOS，Windows 未完成；没有视频录制；只在 PTC session；单 provider 槽互斥 | [packages/experimental/cua-bundle/README.md#L10-L20](../upstream/deepseek-harness/packages/experimental/cua-bundle/README.md#L10-L20) · [E16](../upstream/deepseek-harness/docs/subsystems/computer-use.md#L9-L27) |
| OPT-05 | `@deepseek-ai/dsh-experimental-terminal-bundle` | 默认关闭；实验性；显式挂载终端 bundle | `SKL-18`、`SKL-19` 的 CLI 或 TUI 驱动部分 | 支持六个持久终端工具，跨调用保持 shell 与 REPL 状态，支持后台 send 和 owner 隔离。缺口是只覆盖终端，不覆盖 GUI，不提供视频 | [packages/experimental/terminal-bundle/README.md#L8-L20](../upstream/deepseek-harness/packages/experimental/terminal-bundle/README.md#L8-L20) · [E17](../upstream/deepseek-harness/packages/experimental/tool-terminal/README.md#L10-L30) |
| OPT-06 | `@deepseek-ai/dsh-experimental-session-search` | 默认关闭；实验性；Plugins 中启用，或加入 `dsh.profile.bundles` | `PATH-05`、`SKL-08`、`SKL-27`、`SKL-29`、`SKL-30`、`PB-12`、`PB-19`、`PB-22` 的历史读取 | 支持五个只读工具搜索、追踪、读取会话事件；跨会话要求精确 `cwd` 相同。缺口是没有 Cursor 的原始 `.jsonl` 路径；`session_search` 不含调用者会话，当前会话用 `session_event_search`；子代理转写覆盖深度未证实 | [E18](../upstream/deepseek-harness/packages/experimental/session-search/README.md#L8-L20) · [packages/experimental/tool-session-query/README.md#L12-L53](../upstream/deepseek-harness/packages/experimental/tool-session-query/README.md#L12-L53) |
| OPT-07 | `@deepseek-ai/dsh-mcp-client` | 无默认服务器；稳定可选插件；每个 server 一条 client 配置 | `SKL-06`、`SKL-07` 的 MCP 证据源 | 支持每个 MCP server 的工具以 `mcp__<server>__<tool>` 形式出现，`mcp-resources` 列出有资源的 server。缺口是没有自动类别发现；每个 server 要用户配置；没有 server 时无工具 | [E19](../upstream/deepseek-harness/packages/mcp/mcp-client/README.md#L10-L24) · [packages/mcp/mcp-resources/README.md#L38-L40](../upstream/deepseek-harness/packages/mcp/mcp-resources/README.md#L38-L40) |
| OPT-08 | `@deepseek-ai/dsh-experimental-agent-team-profile` | 默认关闭；实验性；显式启用 Agent Teams profile | `PB-16` 至 `PB-18` 的多代理协作部分 | 支持 Lead 与 teammate、共享任务板、九个团队工具、Web roster。缺口是没有 pstack 的 PR frontier、ledger、stack verdict；会禁用 `subagent` 与 `subagent_fork`，并替换全局 child controls，不能与 `pstack_subagent` 同时启用 | [packages/experimental/agent-team-profile/README.md#L5-L20](../upstream/deepseek-harness/packages/experimental/agent-team-profile/README.md#L5-L20) · [E26](../upstream/deepseek-harness/packages/experimental/tool-agent-team/README.md#L10-L32) |
| OPT-09 | `@deepseek-ai/dsh-experimental-ralph-bundle` | 默认关闭；实验性；显式挂载 | `PB-15` 的 fresh-agent 循环部分 | 支持固定 foreground 循环，每轮 fresh child，结构化交接。缺口是同一 Session 的常驻循环、事件 watcher，不替代 pstack 的 goal 与 decision log | [packages/experimental/ralph-bundle/README.md#L8-L20](../upstream/deepseek-harness/packages/experimental/ralph-bundle/README.md#L8-L20) · [packages/experimental/tool-ralph/README.md#L10-L30](../upstream/deepseek-harness/packages/experimental/tool-ralph/README.md#L10-L30) |

### 3.4 缺口记录

每个缺口给出支持什么、不支持什么、场景示例、建议和涉及能力。场景示例绑定能力编号，便于实现阶段直接变成验收用例。

#### G-01 角色模型路由

- **支持什么**：`subagent` 在 `modelSelection: true` 时可以传 `provider`、`model`、`reasoning_effort`；`ctx.llm.listProviders()` 与 `listModels()` 能枚举目录；agent preset 可以给固定默认路由。[E06](../upstream/deepseek-harness/packages/subagent/tool-subagent/README.md#L45-L79) · [E24](../upstream/deepseek-harness/packages/llm/llm/README.md#L28-L28)
- **不支持什么**：没有 pstack 的角色到模型映射文件，没有 `unlimited`、`large`、`medium`、`small` 预算阶梯，没有 `how explorer`、`why investigators`、`arena runners` 这些角色名；没有 Session policy 时显式选择只允许父级路由，无法在多个模型间按角色分布。
- **场景示例**：用户运行 `/setup-pstack`，期望 `feature, refactoring` 用代码模型、`judgment and prose` 用判断模型（`SET-01`、`SET-04`、`MOD-04`）；DSH 没有角色表，`subagent` 调用只能沿用父级模型，`arena` 的多个 runner 也变成同一模型。
- **建议**：采用 `PI-02` 的角色配置与服务；在 pstack profile 中设置 `subagentModelSelection` 允许的模型列表，或使用插件提供的专用 delegation 工具；技能文本按 DSH 的 `provider` 与 `model` 名称重写。
- **涉及能力**：`MOD-01`、`MOD-04`、`MOD-06`、`SET-01`、`SET-02`、`SET-04`、`SET-06`、`SKL-01`、`SKL-02`、`SKL-05`、`SKL-06`、`SKL-07`、`SKL-11` 至 `SKL-14`、`SKL-27`、`SKL-29`、`SKL-30`、`PB-01` 至 `PB-05`、`PB-07`、`PB-12`、`PB-16` 至 `PB-18`。

#### G-02 pstack 内部技能路由

- **支持什么**：用户输入 `/name` 会注入 user-invocable 技能；`ctx.skills.get(name)` 对受信任调用者可以返回完整定义，不受目录策略限制。[E03](../upstream/deepseek-harness/packages/skill/tool-skill/README.md#L89) · [E25](../upstream/deepseek-harness/docs/subsystems/skills.md#L128-L128)
- **不支持什么**：`skill` 工具只加载 model-invocable 技能；pstack 的 `how`、`why`、`architect` 等大多声明 `disable-model-invocation: true`，`poteto-mode` 无法通过 `skill` 工具路由到它们。
- **场景示例**：用户输入 `/poteto-mode` 让它调查一个子系统（`SKL-01`）；`poteto-mode` 的步骤说 route through the **how** skill，模型调用 `skill({name:"how"})` 得到 unknown 或不可用，因为 catalog 不包含它。
- **建议**：采用 `PI-01` 的技能加载器；或在移植时把被路由技能改成 model-invocable，代价是 catalog 膨胀和用户可见技能列表变化；或让 `poteto-mode` 用 `read` 直接读技能文件，代价是路径脆弱。
- **涉及能力**：`TOOL-04b`、`SKL-01`、`SKL-29`。

#### G-03 会话历史与转写读取

- **支持什么**：`@deepseek-ai/dsh-experimental-session-search` 提供 `session_search`、`session_event_search`、`session_trace`、`session_event_trace`、`session_event_read`；`ctx.sessionQuery` 和 SQLite backend 在 base 中。[E18](../upstream/deepseek-harness/packages/experimental/session-search/README.md#L8-L20)
- **不支持什么**：标准模式没有模型可见的跨会话读取工具；没有 Cursor 的 `~/.cursor/projects/<slug>/agent-transcripts/` 目录，也没有 `subagents/*.jsonl` 的路径约定；跨会话只允许精确相同 `cwd`；session-search 默认不含调用者会话。
- **场景示例**：用户说 `/recall catch me up on the export work from last week`（`SKL-08`）；标准模式没有工具可搜上周会话，模型只能要求用户粘贴；启用 `OPT-06` 后 `session_search` 可按 workspace 搜到，但不存在最新 `.jsonl` 这种文件路径。
- **建议**：在 pstack profile 启用 `OPT-06`；把 `recall`、`reflect`、`automate-me`、`show-me-your-work`、`session-pickup` 的路径说明改成使用会话搜索工具，并把精确 `cwd` 作为最低条件。
- **涉及能力**：`PATH-05`、`SKL-08`、`SKL-27`、`SKL-29`、`SKL-30`、`PB-12`、`PB-19`、`PB-22`。

#### G-04 浏览器与桌面控制

- **支持什么**：可选 browser-use provider 支持 Chromium 导航、点击、输入、截图和 ARIA 快照；`OPT-04` 支持 macOS 桌面应用；`OPT-05` 支持 CLI 或 TUI 持久终端。[E15](../upstream/deepseek-harness/docs/subsystems/browser-use.md#L9-L15) · [E16](../upstream/deepseek-harness/docs/subsystems/computer-use.md#L9-L27)
- **不支持什么**：没有统一的 control adapter 协议；没有视频录制；CUA 只在 macOS PTC；browser provider 需要 Chromium 和 Stagehand 的独立模型；不同 provider 的工具名与 selector 不同。
- **场景示例**：`/create-verification-skill` 要求生成的技能能 Launch、Doctor、Drive、Evidence、Cleanup，并示例视频（`SKL-18`）；DSH 可用 browser-use 截图，但没有视频工具，且必须让生成技能绑定具体 provider 的工具名。
- **建议**：在 pstack profile 启用 `OPT-03`、`OPT-04`、`OPT-05` 之一；把 `create-verification-skill` 的 control adapter 契约缩到可用 provider 的工具；视频证据在非 benny 场景可降级为截图加状态交叉检查，若必须视频则用外部 ffmpeg 或系统录制，标为当前提交未证实。
- **涉及能力**：`SKL-18`、`SKL-19`、`PB-02`、`PB-03`、`PB-05`、`PB-09`、`PB-10`。

#### G-05 工作树与云隔离

- **支持什么**：`create_worktree` 从本地 commit、branch 或 tag 创建新分支和目录，改变当前 Session 目录；子代理接受 `cwd`；标准 shell 可以用 `git worktree add`。[E13](../upstream/deepseek-harness/docs/tool-catalog.md#L2608-L2634)
- **不支持什么**：没有云 VM；没有自动为每个并行子代理分配独立工作树；`create_worktree` 的 `from` 只用本地 ref，不 fetch；调用后父 Session 目录改变，连续创建多个候选会以新目录为源。
- **场景示例**：`/arena this, 5 candidates` 期望每个候选在独立工作树或目录（`SKL-12`）；DSH 默认所有子代理继承父级目录，必须由技能先 `git worktree add` 或逐个 `create_worktree` 加 `cwd`，否则会互相覆盖。
- **建议**：在 `arena`、`swarm`、`autopilot` 技能文本里用标准 shell 建树并给每个子代理 `cwd`；`OPT-01` 只作为单树替代；`environment:"cloud"` 的云能力按 `EXCL-03` 排除。
- **涉及能力**：`SUB-05`、`SUB-07`、`SKL-11`、`SKL-12`、`SKL-13`、`SKL-14`、`PB-07`、`PB-16` 至 `PB-18`。

#### G-06 MCP 类别发现

- **支持什么**：`dsh-mcp-client` 每个 server 的工具以 `mcp__<server>__<tool>` 出现；`mcp-resources` 在系统提示里列出有资源的 server；模型可以看到已挂载的 MCP 工具。[E19](../upstream/deepseek-harness/packages/mcp/mcp-client/README.md#L10-L24)
- **不支持什么**：没有 `mcps/` 目录；没有按 evidence category 自动发现 server 的 API；没有 server 时没有工具；server 要用户逐项配置。
- **场景示例**：`/why` 期望自动发现 source control、ticket、docs、chat、observability、error tracking、analytics 七类 MCP 并各派一个 investigator（`SKL-06`）；DSH 只能看到用户已配的 `mcp__*` 工具，未配类别必须在 Sources Consulted 里标未搜索或无 MCP。
- **建议**：在 pstack profile 配置 `dsh-mcp-client` 的 server 列表；把 `why` 的 discovery 改成读取当前可见 `mcp__*` 工具并按名字与描述归类，缺失类别按上游 contract 记 gap。
- **涉及能力**：`SKL-06`、`SKL-07`。

#### G-07 GitHub 与 forge 工具链

- **支持什么**：标准 `bash` 可以运行 `gh`；可选 forge bundle 提供 PR 状态轮询、完整 checks 详情、面板侧行内评论与 review 提交、mark ready、merge、Session 绑定和工作树选项；`gh` 是默认路径。[E12](../upstream/deepseek-harness/docs/tool-catalog.md#L695-L735) · [E14](../upstream/deepseek-harness/docs/subsystems/forge.md#L5-L18) · [packages/experimental/forge-bundle/README.md#L51-L65](../upstream/deepseek-harness/packages/experimental/forge-bundle/README.md#L51-L65)
- **不支持什么**：没有模型侧 PR 或变更请求工具；没有 `origin` CLI；forge bundle 默认关闭且实验性；没有 pstack 的 `watch-pr` stack 或 queued-stack 判定。面板能发 review，不等于模型能在技能步骤中调用 review。
- **场景示例**：`/babysit this pr. get it green.`（`PB-13`）在宿主没有 `gh` 时无法读 PR；有 `gh` 但没启用 forge bundle 时只能靠 shell 输出；`origin pr ...` 分支不存在。
- **建议**：把 `gh` 作为 pstack profile 的运行前提；在技能里把 `origin` 分支统一改写为 `gh`；需要面板或轮询时启用 `OPT-02`；`watch-pr` 的具体判定由 `PI-05` 保证。
- **涉及能力**：`PB-13`、`PB-14`、`PB-17`、`PB-18`、`PB-23`。

#### G-08 Custom Mode 与常驻 poteto-mode

- **支持什么**：DSH 的 `/name` 注入可以让每条用户消息带上 `poteto-mode`；agent preset 可以让整个 Session 使用固定 persona 与工具组合。[E03](../upstream/deepseek-harness/packages/skill/tool-skill/README.md#L54-L56) · [E22](../upstream/deepseek-harness/packages/preset/agent-preset/README.md#L28-L48)
- **不支持什么**：没有 Cursor 的 Option+Enter Custom Mode 开关；技能附着只对当前消息生效，不会自动保持到后续轮次；agent preset 在 Session 创建时选定，不能像 mode 一样随时切换。
- **场景示例**：用户在 Cursor 里用 Option+Enter 把 `/poteto-mode` 变成常驻模式（`SKL-01`）；DSH 里普通 Enter 只影响一条消息，下一条消息不再带模式，除非用户重新输入 `/poteto-mode` 或选择 pstack 的 session preset。
- **建议**：提供一个可选的 `poteto-mode` agent preset，在 `PI-08` 中一起交付，并在 `poteto-help` 与 guide 中说明每条任务输入 `/poteto-mode` 或新会话选 pstack preset。
- **涉及能力**：`SKL-01`、`SKL-02`。

#### G-09 嵌套子代理深度与并发

- **支持什么**：`maxDepth` 可以按工具实例或 Host 设置调整；`maxActiveSubagents` 可以调大；子代理可以继续委派。[E23](../upstream/deepseek-harness/packages/subagent/subagent/README.md#L49-L55)
- **不支持什么**：默认 `maxDepth` 为 1，只允许直接子代理；默认 `maxActiveSubagents` 为 8；`orchestrate` 需要协调者、子协调者、worker 三级和几十到上百个并发，默认配置不够。
- **场景示例**：`/orchestrate the store migration` 让 coordinator 启一个 sub-coordinator（`PB-16`），后者要再启 worker；默认深度 1 下 worker 启动被拒绝。
- **建议**：在 pstack profile 把 `subagent.maxDepth` 调到至少 3，`maxActiveSubagents` 按机器能力调大；技能文本把这两个配置写成启动前提。
- **涉及能力**：`SKL-13`、`PB-16` 至 `PB-18`。

#### G-10 `/loop` 事件唤醒

- **支持什么**：`create_goal` 让同一 Session 跨自动续轮保持目标；`schedule_create` 接受一段 `DTSTART` 加 `RRULE` 的 RFC 5545 重复规则，并可投递到 `this_session`、`new_once` 或 `new`；`bash run_in_background` 完成后由 job 通知唤醒父级。[E10](../upstream/deepseek-harness/docs/tool-catalog.md#L1503-L1653) · [E11](../upstream/deepseek-harness/docs/tool-catalog.md#L1407-L1497) · [E12](../upstream/deepseek-harness/docs/tool-catalog.md#L695-L735)
- **不支持什么**：没有名为 `/loop` 的命令；`schedule_*` 只按时间触发，不能订阅 CI、merge 或 ref 前进；没有统一的 forge 事件 watcher；后台 job 的完成通知不是通用事件总线。
- **场景示例**：`/autonomous-run` 的 wake 规则是 CI 或 merge 事件，长心跳兜底（`PB-15`）；DSH 只能创建 goal 加 `schedule_create` 定时任务，或用后台 `bash` watcher 轮询，不能直接订阅 forge 事件。
- **建议**：把 `autonomous-run` 映射到 `create_goal` 加定时 `schedule_create` 或后台 `bash` watcher；在技能里写清事件不可订阅时用轮询加 goal 续轮；`/loop` 字样改为 DSH 术语。
- **涉及能力**：`PB-15`。

#### G-11 todo 的 skip 状态

- **支持什么**：`todo_write` 可以整表替换并显示三种状态。[E08](../upstream/deepseek-harness/docs/tool-catalog.md#L2534-L2580)
- **不支持什么**：没有 `skip` 状态；无法在 tool schema 层表达这条步骤有意不做及原因。
- **场景示例**：`/poteto-mode` 匹配 Bug fix playbook，某个步骤不适用（`SKL-01`），期望列表保留 `skip: <reason>`；DSH 只能把它写成 `completed` 的 content，状态语义变成已完成而不是跳过。
- **建议**：在技能文本里规定 `skip: <reason> - <step>` 前缀，仍标 `completed` 以保持列表可见；不改 DSH todo 工具。
- **涉及能力**：`TOOL-03`。

#### G-12 自定义代理预设

- **支持什么**：Agent preset 支持 `persona`、工具组合和 `agent_preset` 选择；子代理可以随 preset 恢复。[E22](../upstream/deepseek-harness/packages/preset/agent-preset/README.md#L28-L48) · [E05](../upstream/deepseek-harness/docs/subsystems/subagent.md#L70-L130)
- **不支持什么**：DSH 没有 `agents/*.md` 这种代理定义格式；标准 preset 没有 `poteto-agent` 与 `comment-sicko`；`agent_preset` 字段只有在配置了 `allowedAgentPresets` 时才出现在 schema 中。
- **场景示例**：`/poteto-mode` 要求所有 playbook 步骤的派生代理使用 `subagent_type: "poteto-agent"`（`SKL-01`、`AGT-01`）；DSH 的 `subagent` 没有这个字段，普通 `subagent` 也不会自动读 `poteto-mode` 全文。
- **建议**：采用 `PI-08`，在 pstack bundle 中声明 `poteto-agent` 与 `comment-sicko` 两个 preset，给 `subagent` 配置 `agentPreset` 与 `allowedAgentPresets`，或提供专用 `pstack_agent` 工具。
- **涉及能力**：`SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24`。

#### G-13 Cursor 插件清单与缓存路径

- **支持什么**：DSH 用 profile、bundle 和 `cordis.patch.yml` 安装；`bundledSkillDir` 可以指向包内技能根。[E01](../upstream/deepseek-harness/docs/subsystems/skills.md#L64-L89) · [E21](../upstream/deepseek-harness/packages/bundle/web-app/presets/standard.patch.yml#L4-L130)
- **不支持什么**：没有 `.cursor-plugin/plugin.json`、`~/.cursor/plugins/` 缓存目录或 Cursor 插件版本选择逻辑。
- **场景示例**：`poteto-agent` 说搜索 `~/.cursor/plugins/` 找 `skills/poteto-mode/SKILL.md`，多个副本按 `.cursor-plugin/plugin.json` 版本取最高（`AGT-01`、`PATH-02`）；DSH 没有这些路径。
- **建议**：由父级在 prompt 里传 DSH 技能资源路径；插件安装时通过 `bundledSkillDir` 或自定义 provider 暴露技能；`poteto-agent` 的搜索逻辑改为使用父级给的绝对路径。
- **涉及能力**：`PATH-02`。

#### G-14 技能 `paths` 自动挂载

- **支持什么**：DSH 技能有 `description` 和可选的 `whenToUse`，模型按 catalog 语义选择。[E01](../upstream/deepseek-harness/docs/subsystems/skills.md#L64-L89)
- **不支持什么**：`skill-filesystem` 不识别 `paths` frontmatter；没有编辑 `.ts` 或 `.tsx` 时自动加载某技能的机制。
- **场景示例**：pstack 的 `typescript-best-practices` 声明 `paths: ["**/*.ts", "**/*.tsx"]`（`SKL-25`），期望编辑 TypeScript 时自动挂载；DSH 不会自动出现，用户必须显式 `/typescript-best-practices`。
- **建议**：保持手动调用；在技能描述里写清触发场景；如果确实要自动挂载，做一个文件类型监听插件，但这是额外本地扩展，不进入本次 pstack 上游能力。
- **涉及能力**：`SKL-25`。

#### G-15 外部工具链、视频与图像生成

- **支持什么**：标准 `bash` 可以调用宿主已安装的 `node`、`java`、`mise`、`ffmpeg` 等命令；`read_image` 支持 PNG、JPEG、WebP、GIF。[E12](../upstream/deepseek-harness/docs/tool-catalog.md#L695-L735) · [docs/tool-catalog.md#L1131-L1148](../upstream/deepseek-harness/docs/tool-catalog.md#L1131-L1148)
- **不支持什么**：DSH 没有内置的视频渲染、录屏、图像生成、TLA+、TLC、Java、mise 工具；这些命令是否安装、版本是否满足要求不由 DSH 保证；`ketchup-video` 的帧级自检和 `statechart` 的首次联网安装尤其依赖外部环境。
- **场景示例**：`/statechart` 首次运行需要 `mise` 安装 TLC 与 Java 并联网（`SKL-33`、`SCR-05`）；`/ketchup-video` 需要渲染 mp4 并逐帧核对字幕（`SKL-32`）；`/teach` 在空间概念上要求生成图片（`SKL-07`）。
- **建议**：`PI-09` 保留 TLC、Java、mise 的外部前提并做启动前探测；视频和图片生成降级为 mermaid 或截图，或明确要求宿主安装 ffmpeg 与图像生成服务，未满足时在回复中标注当前提交未证实。
- **涉及能力**：`SKL-07`、`SKL-32`、`SKL-33`、`SCR-05`。

## 4. 平台排除

排除依据统一来自 `<pstack>/docs/harness/claude-code.md` 的 `Cursor-only features`：Cursor 没有该能力时，Claude Code 用一行 `Skipped in Claude Code: <step>. <reason>.` 跳过并继续；需要被跳过步骤产物时留占位符。DSH 对同一完整能力沿用同样的跳过语义，不把局部替代品拼成完整支持。

### 4.1 benny automation

| 编号 | 上游完整能力 | 排除依据 | 证据 |
|---|---|---|---|
| AUT-01 | triage automation：监听 Slack 顶层报告，保留原 thread，分类 bug、performance、feature、question、reroute，查重 tracker，只发一条带 marker 的线程回复 | 依赖 Cursor Automations 的 trigger、Slack 动作和 tracker 集成；DSH 没有等价 automation 服务 | [automations/benny/README.md#L1-L23](../upstream/cursor-plugins/pstack/automations/benny/README.md#L1-L23) · [FOR_AGENTS.md#L5-L17](../upstream/cursor-plugins/pstack/automations/benny/FOR_AGENTS.md#L5-L17) · [claude-code L64](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L64) |
| AUT-02 | reproduce 与 fix automation：等待可信 triage marker，通过 control adapter 真实 UI 复现两次，验证已有 fix，确认后做 bounded fix 并开 draft PR | 依赖 Cursor Automations trigger、Slack 线程和 Cursor 的 draft PR action；完整链路不能在 DSH 标准模式复现 | [automations/benny/README.md#L1-L23](../upstream/cursor-plugins/pstack/automations/benny/README.md#L1-L23) · [FOR_AGENTS.md#L18-L36](../upstream/cursor-plugins/pstack/automations/benny/FOR_AGENTS.md#L18-L36) · [claude-code L64](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L64) |
| AUT-03 | setup-benny：把整个 pack 合并到目标仓库 `.cursor/automations/benny/`，在 `.cursor/settings.json` 启用 pstack，验证共享技能从 project scope 解析 | 目标路径、`.cursor/settings.json` 和 project-scoped plugin 都是 Cursor 概念；DSH 用 profile 与 bundle 安装 | [skills/setup-benny/SKILL.md#L17-L70](../upstream/cursor-plugins/pstack/automations/benny/skills/setup-benny/SKILL.md#L17-L70) · [claude-code L64](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L64) |
| AUT-04 | automation prompt templates：triage 与 reproduce 的真实 automation prompt，含 `source_channel_id` 和 `thread_ts` 配置注入 | 模板只服务于 Cursor Automations；没有 DSH 对应 trigger 或 prompt shim 宿主 | [triage-automation-prompt.md#L1-L39](../upstream/cursor-plugins/pstack/automations/benny/templates/triage-automation-prompt.md#L1-L39) · [reproduce-automation-prompt.md#L1-L33](../upstream/cursor-plugins/pstack/automations/benny/templates/reproduce-automation-prompt.md#L1-L33) |
| AUT-05 | control-adapter contract：bring up、drive UI、drive mapped features、inspect state、screenshot、recording、cleanup 七项能力 | 这是 benny automation 的控制契约；它的 screenshot 与 recording 依赖 Cursor 自动化执行环境。通用 app 驱动部分已被 verification skill 覆盖，不单独移植 | [control-adapter.md#L1-L169](../upstream/cursor-plugins/pstack/automations/benny/skills/reproduce-and-fix-issues/references/control-adapter.md#L1-L169) |
| AUT-06 | feature-map、routing-map、configuration 模板：`configuration.example.yaml`、`feature-map.example.md`、`routing.example.md` | 只作为 benny automation 的配置示例；DSH 的 verification skill 有自己的 feature-map 示例，不能把 benny 的 Cursor 与 Slack 配置移植成通用能力 | [configuration.example.yaml#L1-L84](../upstream/cursor-plugins/pstack/automations/benny/templates/configuration.example.yaml#L1-L84) · [feature-map.example.md#L1-L205](../upstream/cursor-plugins/pstack/automations/benny/skills/reproduce-and-fix-issues/references/feature-map.example.md#L1-L205) · [routing.example.md#L1-L61](../upstream/cursor-plugins/pstack/automations/benny/skills/triage-issue-reports/references/routing.example.md#L1-L61) |

### 4.2 Cursor 平台能力

| 编号 | 上游完整能力 | 排除依据 | 证据 |
|---|---|---|---|
| EXCL-01 | Cursor Automations：routines、`update_state` routine create 与 update、`api2.cursor.sh/automations` webhook、routine wake、`SendToUser` secret request | `Cursor-only features` 明确要求整类跳过；DSH 没有 automation 服务、routine 生命周期或 Cursor webhook。`SKL-31` 的整份技能因此排除 | [claude-code L64](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L64) · [make-bot-ui L13-L51](../upstream/cursor-plugins/pstack/skills/make-bot-ui/SKILL.md#L13-L51) |
| EXCL-02 | Bugbot：启动、等待、配置 Bugbot check，处理 Bugbot comment | `Bugbot` 是 Cursor 专属 review bot；Claude Code 适配要求 Bugbot comment 当作普通 PR review thread，用 forge 命令 triage；启动、等待、配置 Bugbot 的步骤跳过 | [claude-code L65](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L65) · [bugbot-triage.md#L1-L31](../upstream/cursor-plugins/pstack/skills/poteto-mode/references/bugbot-triage.md#L1-L31) |
| EXCL-03 | Cursor cloud agents：`environment: "cloud"` 的云 VM、dashboard 状态、自有机器、`/in-cloud` | 云代理本身是 Cursor 平台能力；Claude Code 适配把 `environment:"cloud"` 映射到本地 worktree，并跳过需要云代理 dashboard 或自有机器的步骤 | [claude-code L66](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L66) · [guide/02 L105-L123](../upstream/cursor-plugins/pstack/docs/guide/02-poteto-mode.md#L105-L123) |
| EXCL-04 | Cursor Projects：持久 coordinator thread，云端子代理在笔记本关闭后继续，多个项目并行 | Cursor 的 Project 服务和云端 coordinator 是平台能力；DSH 的 agent-team 与 workflow 只能做本地或单 Host 替代，不构成完整支持 | [guide/07 L94-L108](../upstream/cursor-plugins/pstack/docs/guide/07-overnight.md#L94-L108) · [claude-code L66](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L66) |
| EXCL-05 | `SendToUser` secret request：把 sender key 通过 secret card 交给连接器 | 这是 Cursor Automations 的 secret 通道；DSH 没有 `SendToUser`、connector credential file 或 routine panel | [make-bot-ui L39-L51](../upstream/cursor-plugins/pstack/skills/make-bot-ui/SKILL.md#L39-L51) · [claude-code L64](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L64) |
| EXCL-06 | routine wake：`[routine]` turn、`<webhook_event>`、`body_digest` 与 `timestamp_ms` 的解析和响应 | 这是 Cursor webhook routine 的唤醒协议；DSH 没有 `[routine]` turn，也没有 Cursor 的 automation webhook 投递 | [make-bot-ui L105-L115](../upstream/cursor-plugins/pstack/skills/make-bot-ui/SKILL.md#L105-L115) · [claude-code L64](../upstream/cursor-plugins/pstack/docs/harness/claude-code.md#L64) |

**非排除项说明**：`Cursor-only features` 中的内置 PR 工具不是排除项。Claude Code 适配明确要求改用 forge 命令，例如 `gh pr create`，所以 DSH 也走 `gh` 或 forge，不写跳过行。`Custom Mode`、`/loop`、`create-skill` 不在该表里，它们在本审查中分别按 G-08、G-10、`PB-11` 与 `SKL-29` 的替代流程处理，不当作平台排除。这些替代行写在 `dsh.md` 的 `Local replacements` 小节，与可选插件降级分开维护。

## 5. 插件内实现范围

本节只列标准模式或可选插件仍不完整、且无法用纯配置或纯技能文本解决的行为。每项保留原子能力编号和验收行为；平台排除项及其局部步骤不进入此集合。

| 编号 | 覆盖能力 | 验收行为 | 实现建议状态 |
|---|---|---|---|
| PI-01 | `TOOL-04b`、`SKL-01`、`SKL-02`、`SKL-29` | 技能加载器按名称加载 pstack 任意 `SKILL.md` 与相对资源，不受 `disable-model-invocation` 限制；未知名称返回明确错误；用户 `/name` 入口不变；`poteto-mode` 能路由到 `how`、`why`、`architect` 等 | 已选择（见 6.1 AD-01） |
| PI-02 | `MOD-01`、`MOD-04`、`MOD-06`、`SET-01`、`SET-02`、`SET-04`、`SET-06` | `setup-pstack` 能枚举 DSH provider、model、effort，询问预算，展示并确认角色，写入一份可重读的 pstack 模型配置；所有 pstack 技能能按角色解析出 provider、model、effort；重跑幂等，退役角色被删除，缺失配置回退技能默认 | 已选择（见 6.1 AD-01） |
| PI-03 | `SCR-01`、`PB-21` | `check-plan.mjs` 的 Node 等价实现保留全部检查：H1、How to read this、Program checklist、五个 program H3、10 lanes、perf 四项、review gate、appendix、退出码 1 与 2 | 证据唯一（见 7.2） |
| PI-05 | `SCR-02`、`PB-13`、`PB-14`、`PB-17`、`PB-18` | `watch-pr` 的 Node 等价实现保留 simple、stack、queued-stack 模式，`--status-only`，JSON 与 pretty 输出，`READY`、`WAITING`、`ADVANCE`、`COMPLETE` 判定和退出码；不依赖 `origin` | 证据唯一（见 7.2） |
| PI-06 | `SCR-03`、`PB-22` | `worktree-audit` 的 Node 等价实现保留 base 解析，大小、年龄、merge、dirty、remote、PR、last-chat 列，bucket 分类，只读与 `df` 前后对比；Cursor 转写路径改为 DSH 会话搜索或明确不可用 | 证据唯一（见 7.2） |
| PI-07 | `SCR-04`、`SKL-30`、`PB-04` | `log.sh` 的 Node 等价实现保留 TSV header、UTC 时间戳、tab 与 newline 清理、公式前缀转义、首次写 header、用法错误退出 1 | 证据唯一（见 7.2） |
| PI-08 | `SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SKL-05`、`SKL-24` | 提供 `poteto-agent`、`comment-sicko` 两个代理 id，只读工具组合与 persona，可选提供 `poteto-mode` session preset；`subagent` 能选择它们，或提供专用 `pstack_agent` 工具；普通 `subagent` 行为不变 | 已选择（见 6.1 AD-01） |
| PI-09 | `SCR-05`、`SKL-33` | `statechart` 的 Node 等价实现保留 CLI 选项、TLA+ 与 TLC 调用、`report.md`、`chart.mmd`、`tlc.out`、`tlc-RULE.out` 输出、0、1、2、130、143 退出码和 500 状态图上限；不把 TLC、Java、mise 变成 DSH 内置能力 | 已选择：B（见 7.1） |

`PI-04 orch CLI` 已随上游 `1ba91fc` 删除 `orch.ts` 与 `store.ts` 而退役，本轮不再进入插件实现范围；本地旧镜像由 `prepare` 删除。

本轮 `implement port` 复核结论：上表 8 项均保留现有实现，没有新增、修改或删除的代码；各项实现位置、公共接口依据与验证用例记录在 `docs/port-review.md` 的「实现记录」。

不属于插件内实现：

- `AUT-01` 至 `AUT-06`、`EXCL-01` 至 `EXCL-06`、`SKL-31` 的 Cursor 专属部分：平台排除。
- `TOOL-01` 至 `TOOL-05`、`SUB-01` 至 `SUB-10`、`MOD-01` 至 `MOD-06`、`SET-03` 至 `SET-08`、`PATH-01` 至 `PATH-06` 中已由映射或标准模式覆盖的部分：无需插件代码。
- `bootstrap.ts` 的依赖自装：DSH 用 profile 的 pnpm 安装，不需要移植；`package.json`、`bun.lock` 和测试属于脚本实现资产，不作为独立能力。
- `deslop`、`control-cli`、`control-ui` 是 `cursor-team-kit` 外部插件；Cursor `create-skill`、`/loop`、`/automate` 是 Cursor 内置能力。它们按上游 README 的 not shipped here 处理，不进入本插件实现范围。

## 6. 本仓既定适配

本节只记录 `docs/architecture.md` 与 `docs/decisions/` 中 `Status: accepted` 的长期适配选择。它们规定实现方向，不证明上游需求或 DSH 能力；当前实现是否相符留给 `implement` 与 `review` 验证。

### 6.1 AD-01 插件工具面与 agent preset

- **决策**：[docs/decisions/2026-10-28-pstack-plugin-tools.md](../docs/decisions/2026-10-28-pstack-plugin-tools.md#L1-L35)（Status: accepted，2026-10-28）。
- **内容**：根 `src/` 注册四个工具行和两个 agent preset。`pstack_skill` 通过 `ctx.skills.get()` 按名称加载 pstack 技能与相对资源；`pstack_models` 只读枚举 `ctx.llm` 的 provider、model、effort；`pstack_subagent` 按 `role` 解析 `provider/model [effort]`，把 `agent` 映射到 `poteto-agent` 或 `comment-sicko` preset；`pstack_script` 以封闭 `id` 运行随包 Node 脚本；`comment-sicko` 的只读约束由 preset 内 `dsh-tool-fs` 关闭 `write` 与 `edit` 实现。
- **能力范围**：`TOOL-04b`、`MOD-01`、`MOD-04`、`MOD-06`、`SET-01`、`SET-02`、`SET-04`、`SET-06`、`SUB-02`、`SUB-03`、`AGT-01`、`AGT-02`、`SCR-01` 至 `SCR-05`，以及依赖这些能力的 `SKL-01`、`SKL-02`、`SKL-05`、`SKL-06`、`SKL-07`、`SKL-11` 至 `SKL-14`、`SKL-24`、`SKL-27`、`SKL-29`、`SKL-30` 与相应 playbook。
- **验收行为**：隐藏技能仍可被 pstack 路由但不进入普通模型目录；未知技能名返回明确错误；角色文件格式为 `$DSH_HOME/pstack-models.mdc`（Issue #1 已验收，与上游同名；决策记录已同步），重跑幂等，退役角色删除，缺失文件回退 `inherit-parent`，格式错误按行号报告；`pstack_subagent` 的 `general` 不挂 preset，两个命名 agent 走各自 preset；`pstack_script` 的 id 集合与 `src/internal/script-registry.ts` 一致；`comment-sicko` 的写工具被静态移除。
- **源码核验位置**：`src/*.ts`、`cordis.patch.yml`、`tests/**/*.test.ts`（模块职责见 [docs/architecture.md#L9-L21](../docs/architecture.md#L9-L21)；实现与 review 均已通过）。
- **已知代价**：`pstack_script` 不经过 bash 审批与文件系统沙箱，这是 Desktop Electron 运行时的已接受代价；插件组合变更需要改 `cordis.patch.yml` 并重新安装。

### 6.2 AD-02 脚本 Node 运行时与随包替换

- **来源**：[docs/architecture.md#L15-L16](../docs/architecture.md#L15-L16) 的运行时模块、[docs/architecture.md#L46](../docs/architecture.md#L46) 的新增脚本规则，以及 [references/contract.md#L98-L98](../.agents/skills/pstack-port/references/contract.md#L98-L98) 的手写位置约束。
- **内容**：`pstack/runtime/skills/<技能>/scripts/**` 是可执行脚本的 TypeScript 源码；构建编译为 mjs，经 `replace:scripts` 整目录替换随包树里上游附带的脚本；只修改 Node 运行必需的部分及会造成错误行为或误报的少量逻辑，保持上游输入、输出、文件格式、外部命令、退出码与关键算法。
- **能力范围**：`SCR-01` 至 `SCR-05`，以及 `PI-03`、`PI-05`、`PI-06`、`PI-07`、`PI-09`。
- **验收行为**：行为测试、真实脚本调用和与上游关键行为对照；确有行为差异时登记到本 README 的能力状态，并在对应上游适配文档的本地 DSH 产物中说明；脚本 `id` 经 `pstack_script` 暴露，不直接拼路径。
- **源码核验位置**：`pstack/runtime/skills/<技能>/scripts/**`、`pstack/scripts/replace-scripts.mjs`、`src/internal/script-registry.ts`（见 [docs/architecture.md#L15-L16](../docs/architecture.md#L15-L16) 与 [docs/architecture.md#L46](../docs/architecture.md#L46)）。
- **决策链接**：本轮没有独立的 accepted 决策记录；`docs/decisions/2026-10-28-pstack-generated-tree-port.md` 已 `superseded`，其 Node 脚本运行时部分继续由架构与契约约束。

### 6.3 AD-03 生成树与本地适配树

- **来源**：[docs/architecture.md#L14-L17](../docs/architecture.md#L14-L17) 的本地适配树、生成器、生成树三行，[docs/architecture.md#L44](../docs/architecture.md#L44) 的扩展点，以及 [docs/port-prepare.md#L14-L25](../docs/port-prepare.md#L14-L25) 的结构追踪表。
- **内容**：生成树由 `upstream/cursor-plugins/pstack` 加本地 `pstack/harness/` 渲染；主适配器 `pstack/harness/docs/harness/dsh.md` 替换上游 `docs/harness/claude-code.md`；其他上游 harness 附件保持上游相对路径与文件名；生成结果提交进 git，`generate --check` 逐字节比对漂移。
- **能力范围**：`PATH-02`、`PATH-06`、全部 `SKL` 与 `PB` 的资源相对路径，以及 `doc` 阶段的主适配器产物。
- **验收行为**：生成树只能由生成器改变，手写内容只进 `pstack/harness/` 与 `pstack/runtime/`；主适配器按生成树相对路径镜像替换；技能引用、检查名称映射与相对链接在生成时校验；`generate --check` 通过。
- **源码核验位置**：`pstack/scripts/generate-pstack-harness-tree.mjs`、`pstack/harness/docs/harness/dsh.md`、`pstack/pstack/`（见 [docs/port-prepare.md#L14-L25](../docs/port-prepare.md#L14-L25)）。
- **决策链接**：`docs/decisions/2026-10-29-pstack-harness-tree-port.md` 仍为 `proposed`，不构成本轮既定适配；本轮以 `docs/architecture.md` 与 `docs/port-prepare.md` 的当前结构为准。

### 6.4 AD-04 skills 目录的补充边界

- **决策**：[docs/decisions/2026-10-28-skills-directory-scope.md](../docs/decisions/2026-10-28-skills-directory-scope.md#L1-L34)（Status: accepted，2026-10-28）。
- **内容**：`skills/authored/` 与 `skills/.agents/skills/`（构建时以 `vendored/` 发布）只补充 pstack 缺失的能力；收录须同时满足 cursor pstack 中没有提供类似作用的技能，以及在真实项目开发中作用明显。pstack 技能对 `skills/` 下技能的依赖只是使用关系，不改变收录判据。
- **能力范围**：`PB-11`、`SKL-27`、`SKL-29` 中 `create-skill` 的替代路径；`writing-for-agents` 是本仓提供的技能创作技能，不替代 pstack 上游能力。
- **验收行为**：`vendored/` 逐字保留上游内容并在 `skills/skills-lock.json` 记 `source`、`ref`、`skillPath`、`computedHash`；`authored/` 只收本仓自建技能；不得因 pstack 已提供同类能力而拒绝收录，也不得把 `skills/` 当作 pstack 的配套件。
- **源码核验位置**：`skills/authored/**`、`skills/.agents/skills/**`、`skills/skills-lock.json`、`skills/package.json`（见 [docs/architecture.md#L18-L18](../docs/architecture.md#L18-L18)）。

### 6.5 AD-05 非 pstack 上游的已接受决策

- [docs/decisions/2026-10-28-decision-skill-lifecycle.md](../docs/decisions/2026-10-28-decision-skill-lifecycle.md#L1-L39)（Status: accepted）：约束本仓 `decision-write` 与 `decision-audit` 的状态更新与落地锚点。适用能力：无；不属于 pstack 上游移植范围，不进入本 README 的能力编号。

## 7. 实现建议选择

本节只处理第 5 节中尚无既定适配、且存在多种合理实现方式的能力。已由 AD-01 至 AD-04 固定的实现方向不再列为候选；只有一种证据支持的写证据唯一。

### 7.1 PI-09 statechart 的语料与打包方式

`PI-09` 的 Node 移植方向已由 AD-02 固定。测试语料是否随包发布已有决定：B（2026-10-29），本轮沿用。

| 候选 | 做法 | 限制与取舍 |
|---|---|---|
| A | 随包保留上游完整 `statechart/scripts/test/**` 语料，运行时镜像按原样发布，另以同一套用例做行为测试 | 与上游行为对照最完整，后续升级容易逐字比对；包体和发布内容会变大，测试语料不是运行时依赖 |
| B | 只发布 `statechart` 运行时所需源码与精选行为测试，不把上游 corpus 放进 npm 包 | 包体小，安装快；必须证明精选用例覆盖了上游 `differential.test.ts`、`pipeline.test.ts`、`plain-tlc.test.ts` 等固定住的关键行为，后续升级要单独维护对照清单 |

状态：已选择 B（2026-10-29）。关键边界：无论选 A 还是 B，`statechart` 的 CLI 契约、TLC 输出解析、`report.md`、`chart.mmd`、`tlc.out` 格式、退出码 0、1、2、130、143 和 500 状态图上限都不能改变。

B 的关键行为对照清单（`pstack/runtime/skills/statechart/scripts/statechart.test.ts`）：

| 上游测试 | 本仓对照 |
|---|---|
| `chart.test.ts` 的 TLA+ 值语法、标签、相等性 | `parseValue`、`show`、`key` 用例 |
| `pipeline.test.ts` 的编译文件集合、退出码、报告与图输出 | `compile` 的 broken-rule 用例断言 `report.md`、`chart.mmd`、`tlc.out` 与 exit 1 |
| `messages.test.ts` 与 `tlc-out.test.ts` 的 TLC 输出解析 | `readMessages` 与 `plainText` 用例 |
| `cli.test.ts` 的入口参数与退出码 | 缺 spec 时 usage 到 stderr、exit 2；worker 路径冒烟 |
| `differential.test.ts` 与 `corpus.test.ts` 的 TLC 端到端 | 不随包；需要 `TLA2TOOLS`、Java、mise 的外部环境，测试文件保留 `skip` 语义供有 TLC 的环境复核 |

### 7.2 证据唯一的实现路径

| 编号 | 做法 | 为什么没有第二种合理路径 |
|---|---|---|
| PI-03 | 按上游 `check-plan.mjs` 逐条重写为 Node，保留检查项、stdout 与 stderr 格式和退出码 0、1、2 | 这是确定性的格式与证据检查器，DSH 没有等价物；改写为其他语言或放宽检查都会破坏上游契约 |
| PI-05 | 按上游 `watch-pr` 重写为 Node，保留 single、stack、queued-stack、`--status-only`、JSON 与 pretty、四种 verdict 和退出码；只用 `gh`，不实现 `origin` | verdict 逻辑由大量测试固定；直接用 `gh pr view` 与 `gh pr checks` 轮询会把状态判定散落到 prompt，无法测试和复用 |
| PI-06 | 按上游 `worktree-audit.sh` 重写为 Node，保留 TSV 列、bucket、base 解析和只读语义；聊天列由调用方传入 DSH 会话查询结果，缺失时标 `unknown-usage` | 审计表需要稳定、可测试的输出；在 playbook 里内联推导会每次生成不同结果，也丢掉了 bucket 逻辑 |
| PI-07 | 按上游 `log.sh` 重写为 Node，保留 TSV header、UTC 时间戳、单元格清理、公式前缀转义和用法错误退出 1 | 42 行确定性 helper；保留 bash 会在 Windows 与 Electron 上引入额外运行时，改写为其他格式会破坏已有日志兼容性 |
| PI-09 | 按上游 `statechart` 重写为 Node，保留入口参数、TLC 调用、输出文件、退出码和 500 状态图上限；TLC、Java、mise 作为外部前提 | 这是编译器与格式转换器，行为由 `differential.test.ts`、`pipeline.test.ts` 等固定；只换运行壳不改算法 |

## 8. 分阶段状态

下表逐项记录实现、审查、文档与最终覆盖状态。`实现` 列的 `已实现` 表示该能力按第 2～4 节分类的映射、标准模式、可选插件或插件内路径已落地并核验；`不适用（平台排除）` 表示按上游排除基线不实现。`文档` 列定位实际适配产物；`最终覆盖` 区分完整、已覆盖（有适配语义差异）、条件覆盖、部分覆盖和平台排除，括号内列出外部条件、剩余差异或对应缺口。

### 8.1 模板、脚本与路径

| 能力 ID | 实现 | 审查 | 文档 | 最终覆盖 |
|---|---|---|---|---|
| TOOL-01 | 已实现 | 通过 | 已记录（§2.1；dsh.md Tools） | 完整（pstack_subagent） |
| TOOL-02 | 已实现 | 通过 | 已记录（§2.1；dsh.md Tools） | 完整（live root；无 answerer 时纯文本提问） |
| TOOL-03 | 已实现 | 通过 | 已记录（§2.1；dsh.md Tools） | 已覆盖（skip 用 completed 加原因前缀；G-11） |
| TOOL-04a | 已实现 | 通过 | 已记录（§2.1；dsh.md Tools） | 完整（用户 /name 入口） |
| TOOL-04b | 已实现 | 通过 | 已记录（§2.1；dsh.md Tools） | 完整（PI-01） |
| TOOL-05 | 已实现 | 通过 | 已记录（§2.1；dsh.md Tools） | 完整 |
| SUB-01 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整（pstack_subagent general） |
| SUB-02 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整（PI-08） |
| SUB-03 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 已覆盖（comment-sicko 静态只读；其他 brief 靠约束与 git status） |
| SUB-04 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整 |
| SUB-05 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields、OPT-01） | 条件覆盖（OPT-01 或 git worktree；云能力按 EXCL-03 排除） |
| SUB-06 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整 |
| SUB-07 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields、OPT-01） | 条件覆盖（本地 ref；不 fetch；OPT-01 或 bash） |
| SUB-08 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整 |
| SUB-09 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整（send_message） |
| SUB-10 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 已覆盖（prompt 中的路径，不传附件块） |
| AGT-01 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整（PI-08；父级传绝对路径） |
| AGT-02 | 已实现 | 通过 | 已记录（§2.2；dsh.md Subagent fields） | 完整（PI-08；静态禁用 write/edit） |
| MOD-01 | 已实现 | 通过 | 已记录（§2.3；dsh.md Models） | 已覆盖（PI-02；无 Cursor slug 与 -fast） |
| MOD-02 | 已实现 | 通过 | 已记录（§2.3；dsh.md Models） | 完整（继承父级路由） |
| MOD-03 | 已实现 | 通过 | 已记录（§2.3；dsh.md Models） | 完整 |
| MOD-04 | 已实现 | 通过 | 已记录（§2.3；dsh.md Models） | 完整（PI-02） |
| MOD-05 | 已实现 | 通过 | 已记录（§2.3；dsh.md Models） | 完整（provider/model [effort]） |
| MOD-06 | 已实现 | 通过 | 已记录（§2.3；dsh.md Models） | 完整（PI-02 角色清单） |
| SET-01 | 已实现 | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整（PI-02） |
| SET-02 | 已实现（Issue #1） | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整（PI-02；读取 `$DSH_HOME/pstack-models.mdc`，旧 `poteto-models.mdc` 按缺失回退 `inherit-parent`） |
| SET-03 | 已实现 | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整 |
| SET-04 | 已实现 | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整（PI-02；按模型目录校验 effort） |
| SET-05 | 已实现 | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整 |
| SET-06 | 已实现（Issue #1） | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整（PI-02；写入 `$DSH_HOME/pstack-models.mdc`，重跑幂等，格式错误按行号报告） |
| SET-07 | 已实现 | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整（角色面板扇出） |
| SET-08 | 已实现 | 通过 | 已记录（§2.4；dsh.md setup-pstack） | 完整 |
| PATH-01 | 已实现 | 通过 | 已记录（§2.5；dsh.md Paths） | 完整 |
| PATH-02 | 已实现 | 通过 | 已记录（§2.5；dsh.md Paths） | 已覆盖（DSH 包与 profile；无 Cursor 缓存，G-13） |
| PATH-03 | 已实现 | 通过 | 已记录（§2.5；dsh.md Paths） | 已覆盖（AGENTS.md 加 PI-02；.mdc 不自动加载） |
| PATH-04 | 已实现 | 通过 | 已记录（§2.5；dsh.md Paths） | 完整 |
| PATH-05 | 已实现 | 通过 | 已记录（§2.5；dsh.md Paths、OPT-06） | 条件覆盖（OPT-06；无 Cursor .jsonl，G-03） |
| PATH-06 | 已实现 | 通过 | 已记录（§2.5；dsh.md Paths） | 完整 |
| SCR-01 | 已实现 | 通过 | 已记录（§2.6；dsh.md Paths 的 pstack_script） | 完整（PI-03） |
| SCR-02 | 已实现 | 通过 | 已记录（§2.6；dsh.md Paths、OPT-02） | 条件覆盖（PI-05；宿主需 gh） |
| SCR-03 | 已实现 | 通过 | 已记录（§2.6；dsh.md Paths、OPT-06） | 条件覆盖（PI-06；聊天占用需 OPT-06，否则 unknown-usage） |
| SCR-04 | 已实现 | 通过 | 已记录（§2.6；dsh.md Paths 的 pstack_script） | 完整（PI-07） |
| SCR-05 | 已实现 | 通过 | 已记录（§2.6；dsh.md Paths 的 pstack_script） | 条件覆盖（PI-09；宿主需 TLC、Java、mise） |

### 8.2 技能

| 能力 ID | 实现 | 审查 | 文档 | 最终覆盖 |
|---|---|---|---|---|
| SKL-01 | 已实现 | 通过 | 已记录（§2.7；dsh.md Tools、Models、Subagent fields、Local replacements） | 完整（PI-01、PI-02、PI-08；skip 映射见 G-11） |
| SKL-02 | 已实现 | 通过 | 已记录（§2.7；dsh.md Models、Local replacements） | 完整（PI-01、PI-02；无常驻 Custom Mode，G-08） |
| SKL-03 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-04 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-05 | 已实现 | 通过 | 已记录（§2.7；dsh.md Subagent fields） | 完整（PI-02、PI-08） |
| SKL-06 | 已实现 | 通过 | 已记录（§2.7；dsh.md Models、OPT-07） | 条件覆盖（PI-02；MCP 证据需 OPT-07，G-06） |
| SKL-07 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-07） | 条件覆盖（PI-02；MCP 与图像生成依赖外部条件，G-06、G-15） |
| SKL-08 | 已实现 | 通过 | 已记录（§2.7；dsh.md Paths、OPT-06） | 条件覆盖（PI-02；历史读取需 OPT-06，G-03） |
| SKL-09 | 已实现 | 通过 | 已记录（§2.7；dsh.md Local replacements、技能原文） | 完整（图像显示取决于宿主渲染） |
| SKL-10 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-11 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-01） | 条件覆盖（PI-02；隔离需 OPT-01 或 bash，G-05） |
| SKL-12 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-01） | 条件覆盖（PI-02；每候选工作树需 OPT-01 或 bash，G-05） |
| SKL-13 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-01、OPT-08） | 条件覆盖（PI-02；本地 worker、工作树与容量配置，G-05、G-09） |
| SKL-14 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-01） | 条件覆盖（PI-02；独立工作树需 OPT-01 或 bash，G-05） |
| SKL-15 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-16 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-17 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-18 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-03～OPT-05） | 条件覆盖（UI 驱动需 OPT-03～OPT-05；视频需外部工具，G-04、G-15） |
| SKL-19 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-03～OPT-05） | 条件覆盖（UI 驱动需 OPT-03～OPT-05；视频需外部工具，G-04、G-15） |
| SKL-20 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整（验证工具由项目安装） |
| SKL-21 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整（验证工具由项目安装） |
| SKL-22 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-23 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-24 | 已实现 | 通过 | 已记录（§2.7；dsh.md Subagent fields） | 完整（PI-08） |
| SKL-25 | 已实现 | 通过 | 已记录（§2.7；手动 /typescript-best-practices） | 部分（需手动 /typescript-best-practices；paths 不自动挂载，G-14） |
| SKL-26 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-27 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-06、Local replacements） | 条件覆盖（PI-02；历史读取需 OPT-06，G-03） |
| SKL-28 | 已实现 | 通过 | 已记录（§2.7；技能原文） | 完整 |
| SKL-29 | 已实现 | 通过 | 已记录（§2.7；dsh.md OPT-06、Local replacements） | 条件覆盖（PI-02；历史读取需 OPT-06，G-03） |
| SKL-30 | 已实现 | 通过 | 已记录（§2.7；dsh.md Paths、OPT-06） | 条件覆盖（PI-02、PI-07；转写审计需 OPT-06，G-03） |
| SKL-31 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4；dsh.md Cursor-only features） | 按上游平台排除（EXCL-01；跳过并继续） |
| SKL-32 | 已实现 | 通过 | 已记录（§2.7；dsh.md Local replacements、外部视频工具边界） | 部分（文本与幻灯片规划可用；mp4 与逐帧核验需外部 ffmpeg，G-15） |
| SKL-33 | 已实现 | 通过 | 已记录（§2.7；dsh.md Paths 的 pstack_script） | 条件覆盖（PI-09；TLC、Java、mise 与首次联网安装，G-15） |

### 8.3 Playbook 与 principle

| 能力 ID | 实现 | 审查 | 文档 | 最终覆盖 |
|---|---|---|---|---|
| PB-01 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 完整（PI-02） |
| PB-02 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02；UI 复现需 OPT-03～OPT-05，G-04） |
| PB-03 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02；界面 trace 需 OPT-03～OPT-05，G-04） |
| PB-04 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02；历史审计需 OPT-06，G-03） |
| PB-05 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（运行界面控制需 OPT-03～OPT-05，G-04） |
| PB-06 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 完整 |
| PB-07 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02；工作树需 OPT-01 或 bash，G-05） |
| PB-08 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 完整 |
| PB-09 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（截图需 OPT-03～OPT-05，G-04） |
| PB-10 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（真实截图需 OPT-03～OPT-05，G-04） |
| PB-11 | 已实现 | 通过 | 已记录（§2.8；dsh.md Local replacements；对应技能与适配映射） | 完整（writing-for-agents 替代 create-skill） |
| PB-12 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02；转写核验需 OPT-06，G-03） |
| PB-13 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-05；需 gh，Bugbot 启动等按 EXCL-02 排除） |
| PB-14 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-05；需 gh，G-07） |
| PB-15 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（create_goal 加 RFC 5545 schedule 或 watcher；forge 事件用轮询，G-10） |
| PB-16 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（OPT-08 或 pstack_subagent；工作树与深度配置；EXCL-04） |
| PB-17 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02、PI-05；本地工作树与 gh；云 VM 排除） |
| PB-18 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-02、PI-05；本地工作树与 gh；云 VM 排除） |
| PB-19 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（OPT-06；git 状态用 bash，G-03） |
| PB-20 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 完整 |
| PB-21 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 完整（PI-03） |
| PB-22 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 条件覆盖（PI-06；聊天占用需 OPT-06，G-03） |
| PB-23 | 已实现 | 通过 | 已记录（§2.8；对应技能与适配映射） | 完整（需宿主 gh；deslop 缺失时用普通语言要求） |
| PRIN-01 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-02 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-03 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-04 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-05 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-06 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-07 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-08 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-09 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-10 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-11 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-12 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-13 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-14 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-15 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-16 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-17 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-18 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-19 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-20 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-21 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-22 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-23 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |
| PRIN-24 | 已实现 | 通过 | 已记录（§2.9；技能原文） | 完整 |

### 8.4 平台排除

| 能力 ID | 实现 | 审查 | 文档 | 最终覆盖 |
|---|---|---|---|---|
| AUT-01 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.1；dsh.md Cursor-only features） | 按上游平台排除（Cursor Automations；跳过并继续） |
| AUT-02 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.1；dsh.md Cursor-only features） | 按上游平台排除（Cursor Automations；跳过并继续） |
| AUT-03 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.1；dsh.md Cursor-only features） | 按上游平台排除（Cursor Automations；跳过并继续） |
| AUT-04 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.1；dsh.md Cursor-only features） | 按上游平台排除（Cursor Automations；跳过并继续） |
| AUT-05 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.1；dsh.md Cursor-only features） | 按上游平台排除（Cursor Automations；跳过并继续） |
| AUT-06 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.1；dsh.md Cursor-only features） | 按上游平台排除（Cursor Automations；跳过并继续） |
| EXCL-01 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.2；dsh.md Cursor-only features） | 按上游平台排除（跳过并继续） |
| EXCL-02 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.2；dsh.md Cursor-only features） | 按上游排除启动与配置；普通 PR 评论仍用 gh 或 OPT-02 |
| EXCL-03 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.2；dsh.md Cursor-only features） | 按上游平台排除（跳过并继续） |
| EXCL-04 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.2；dsh.md Cursor-only features） | 按上游平台排除（跳过并继续） |
| EXCL-05 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.2；dsh.md Cursor-only features） | 按上游平台排除（跳过并继续） |
| EXCL-06 | 不适用（平台排除） | 通过（平台排除） | 已记录（§4.2；dsh.md Cursor-only features） | 按上游平台排除（跳过并继续） |

### 8.5 文档产物与覆盖口径

主适配文档是 [pstack/harness/docs/harness/dsh.md](harness/docs/harness/dsh.md)，生成副本是 [pstack/pstack/docs/harness/dsh.md](pstack/docs/harness/dsh.md)。它保留上游模板的六个章节，并增加 [Optional plugins](harness/docs/harness/dsh.md#optional-plugins)，逐项覆盖 OPT-01 至 OPT-09 的包名、启用能力与未启用 fallback。技能、playbook、reference 与 principle 正文保持上游原文，由生成器在需要 Cursor 名称映射的技能中加入适配文档指针。

最终覆盖以固定上游提交和本轮测试为限。完整覆盖不排除技能本身声明的通用外部前提；条件覆盖必须启用括号中的插件或安装外部工具；部分覆盖仍有明确语义差异；平台排除按上游规则输出跳过行并继续，不计为通过。六项未决证据保留在 9.3，不因文档完成而核销。

## 9. 文档追踪与未决证据

### 9.1 文档去向

下表按文档集列出全部上游文件。`→` 后的编号是能力去向；`参考` 表示该文档是某项能力的提示模板、示例或说明，不单独产生能力编号。

| 文档集 | 文件 | 去向 |
|---|---|---|
| 根说明 | `README.md` | → `SKL-01` 至 `SKL-33`、`PB-01` 至 `PB-23`、`PRIN-01` 至 `PRIN-24`、`SET-01` 至 `SET-08`、`AGT-01` 至 `AGT-02`、`AUT-01` 至 `AUT-06`；平台说明见 `EXCL-01` 至 `EXCL-06` |
| guide 索引 | `docs/guide/README.md` | → `SKL-01`、`SKL-02`、`SKL-05`、`SKL-08`、`SKL-15`、`SKL-17`、`SKL-18`、`SKL-20`、`SKL-23`、`SKL-30` |
| guide 01 | `docs/guide/01-setup.md` | → `SET-01` 至 `SET-08`、`PATH-01`、`PATH-03`、`PATH-06` |
| guide 02 | `docs/guide/02-poteto-mode.md` | → `SKL-01`、`PB-01` 至 `PB-23`、`SUB-05`、`SUB-06`、`EXCL-03` |
| guide 03 | `docs/guide/03-understand.md` | → `SKL-05`、`SKL-06`、`SKL-07`、`SKL-08`、`PB-19` |
| guide 04 | `docs/guide/04-design.md` | → `SKL-11`、`SKL-12`、`SKL-13`、`SKL-14`、`PB-09`、`PB-21` |
| guide 05 | `docs/guide/05-build-and-clean.md` | → `PB-01`、`PB-02`、`PB-03`、`PB-04`、`PB-05`、`PB-06`、`PB-07`、`PB-08`、`SKL-16`、`SKL-22`、`SKL-24`、`SKL-25` |
| guide 06 | `docs/guide/06-verify-and-ship.md` | → `SKL-17`、`SKL-18`、`SKL-19`、`SKL-20`、`SKL-21`、`SKL-33`、`PB-10`、`PB-13`、`PB-14`、`PB-23` |
| guide 07 | `docs/guide/07-overnight.md` | → `SKL-01`、`SKL-15`、`SKL-29`、`SKL-30`、`PB-15` 至 `PB-18`、`AUT-01` 至 `AUT-06`、`EXCL-03`、`EXCL-04` |
| guide 08 | `docs/guide/08-principles.md` | → `PRIN-01` 至 `PRIN-24` |
| guide 09 | `docs/guide/09-make-it-yours.md` | → `SKL-11`、`SKL-22`、`SKL-23`、`SKL-27`、`SKL-28`、`SKL-29`、`PB-11`、`PB-12` |
| guide 10 | `docs/guide/10-recipes-and-pitfalls.md` | → `SKL-02` 至 `SKL-10`、`SKL-12` 至 `SKL-23`、`SKL-26`、`SKL-32`、`PB-01` 至 `PB-08`、`PB-13` 至 `PB-15`、`PB-19`、`PB-21`、`PB-23` |
| 宿主适配 | `docs/harness/claude-code.md` | 不产生能力编号；提供 1.6 节的模板覆盖域、表格粒度和平台排除基线，并与第 4 节逐条对应 |
| 代理定义 | `agents/poteto-agent.md` | → `AGT-01`、`SUB-02`、G-12 |
| 代理定义 | `agents/comment-sicko.md` | → `AGT-02`、`SUB-03`、`SKL-24`、G-12 |
| benny 说明 | `automations/benny/README.md` | → `AUT-01` 至 `AUT-06`、`EXCL-01` |
| benny 意图 | `automations/benny/FOR_AGENTS.md` | → `AUT-01` 至 `AUT-04`、`EXCL-01` |
| benny setup | `automations/benny/skills/setup-benny/SKILL.md` | → `AUT-03`、`EXCL-01` |
| benny triage | `automations/benny/skills/triage-issue-reports/SKILL.md` | → `AUT-01`、`EXCL-01` |
| benny repro | `automations/benny/skills/reproduce-and-fix-issues/SKILL.md` | → `AUT-02`、`EXCL-01` |
| benny controls | `automations/benny/skills/reproduce-and-fix-issues/references/control-adapter.md` | → `AUT-05`（参考契约） |
| benny controls | `automations/benny/skills/reproduce-and-fix-issues/references/feature-map.example.md` | → `AUT-06`（参考示例） |
| benny controls | `automations/benny/skills/reproduce-and-fix-issues/references/verify-existing-fix.md` | → `AUT-02`（参考步骤） |
| benny routing | `automations/benny/skills/triage-issue-reports/references/routing.example.md` | → `AUT-06`（参考示例） |
| benny prompts | `automations/benny/templates/triage-automation-prompt.md` | → `AUT-04` |
| benny prompts | `automations/benny/templates/reproduce-automation-prompt.md` | → `AUT-04` |
| benny config | `automations/benny/templates/configuration.example.yaml` | → `AUT-06`（参考配置） |
| 普通技能 | `skills/architect/SKILL.md`、`skills/arena/SKILL.md`、`skills/automate-me/SKILL.md`、`skills/benchmark-checklist/SKILL.md`、`skills/blast-radius/SKILL.md`、`skills/bro/SKILL.md`、`skills/correct/SKILL.md`、`skills/create-formal-verification-skill/SKILL.md`、`skills/create-verification-skill/SKILL.md`、`skills/figure-it-out/SKILL.md`、`skills/how/SKILL.md`、`skills/interrogate/SKILL.md`、`skills/in-your-own-words/SKILL.md`、`skills/ketchup/SKILL.md`、`skills/ketchup-video/SKILL.md`、`skills/maintain-formal-verification-skill/SKILL.md`、`skills/maintain-verification-skill/SKILL.md`、`skills/make-bot-ui/SKILL.md`、`skills/no-comments/SKILL.md`、`skills/poteto-help/SKILL.md`、`skills/poteto-mode/SKILL.md`、`skills/recall/SKILL.md`、`skills/reflect/SKILL.md`、`skills/setup-pstack/SKILL.md`、`skills/sharpen/SKILL.md`、`skills/show-me-your-work/SKILL.md`、`skills/statechart/SKILL.md`、`skills/swarm/SKILL.md`、`skills/tdd/SKILL.md`、`skills/teach/SKILL.md`、`skills/technical-writing/SKILL.md`、`skills/typescript-best-practices/SKILL.md`、`skills/unslop/SKILL.md`、`skills/why/SKILL.md` | → `SKL-01` 至 `SKL-33`、`SET-01` 至 `SET-08` |
| principle 技能 | `skills/principle-*/SKILL.md`（24 个） | → `PRIN-01` 至 `PRIN-24` |
| playbook | `skills/poteto-mode/playbooks/{investigation,bug-fix,perf-issue,hillclimb,runtime-forensics,trace-forensics,feature,refactoring,prototype,visual-parity,authoring-a-skill,eval,babysit,shipping,autonomous-run,orchestrate,autopilot-full,autopilot-stack,session-pickup,pause-safely,multi-phase-plan,worktree-cleanup,opening-a-pr}.md` | → `PB-01` 至 `PB-23` |
| architect references | `skills/architect/references/{design-red-flags,rationale-template,runner-prompt}.md` | → 参考 `SKL-11`、`SKL-12`，无独立能力 |
| create-verification references | `skills/create-verification-skill/references/feature-map-example/{README,create-note,search}.md` | → 参考 `SKL-18`、`SKL-19`、`PATH-06`，无独立能力 |
| how references | `skills/how/references/{explainer-prompt,explorer-prompt}.md` | → 参考 `SKL-05`，无独立能力 |
| poteto-help references | `skills/poteto-help/references/{prompting,recipes}.md` | → 参考 `SKL-02`、`SKL-04`，无独立能力 |
| poteto-mode reference | `skills/poteto-mode/references/bugbot-triage.md` | → 参考 `PB-13`、`EXCL-02`，无独立能力 |
| reflect references | `skills/reflect/references/{judgment-reviewer,tooling-reviewer,divergent-reviewer,synthesizer}.md` | → 参考 `SKL-27`，无独立能力 |
| typescript reference | `skills/typescript-best-practices/references/patterns.md` | → 参考 `SKL-25`，无独立能力 |
| why references | `skills/why/references/{epistemics,investigator-prompt,synthesizer-prompt,source-playbook}.md`、`skills/why/references/sources/{code-archaeology,databricks,datadog,incident-postmortem,linear,notion,sentry,slack}.md` | → 参考 `SKL-06`、`SKL-07`，无独立能力 |
| show-me-your-work assets | `skills/show-me-your-work/references/decision-log-template.tsv`、`skills/show-me-your-work/scripts/log.sh` | → `SKL-30`、`SCR-04`；tsv 是表头模板，sh 是脚本资产 |
| statechart references | `skills/statechart/references/render.md` | → 参考 `SKL-33`，无独立能力 |
| statechart 测试语料 | `skills/statechart/scripts/test/corpus/**/report.md`（33 个） | → `SCR-05` 的验收夹具，不作为独立需求 |
| 脚本资产 | `skills/poteto-mode/scripts/check-plan.mjs`、`check-plan.test.ts`、`watch-pr/{watch-pr,cli.ts,github.ts,policy.ts,render.ts,types.ts,types.compile.ts,fakes.test-helper.ts,*.test.ts,tsconfig.json}`、`worktree-audit.sh`、`bootstrap.ts`、`bun.lock`、`package.json`、`skills/statechart/scripts/{statechart,statechart.ts,run.ts,worker.ts,pipeline.ts,ir.ts,backends/**,frontends/**,passes/**,package.json,tsconfig.json,test/**}` | → `SCR-01` 至 `SCR-05`、`SCR-07`；`bootstrap.ts` 不移植，`bun.lock`、`package.json`、测试只作为依赖与行为证据 |
| 删除的脚本资产 | `skills/poteto-mode/scripts/orch/{orch,store}.ts` | → `SCR-06`（无调用点，上游已删除） |
| 插件清单 | `.cursor-plugin/plugin.json` | → 版本与技能、代理声明；安装路径按 `PATH-02` 映射 |

### 9.2 文档完整性核对

- `docs/harness/claude-code.md` 的六个模板域全部在 1.6 节登记；`Cursor-only features` 六类全部在 4.2 节登记；`Task`、`AskQuestion`、todo、运行技能、`Grep` 与 `Glob` 五行全部在 2.1 节有去向。
- 136 个 Markdown 文档全部落在 9.1 的文档集行内；58 个 `SKILL.md`、23 个 playbook、24 个 principle 全部列出；33 个 statechart `report.md` 作为测试夹具单独说明。
- 所有上游脚本都有 `SCR` 去向：5 个可执行入口有行为契约，`orch` 标为无调用点，`bootstrap.ts` 与锁文件、测试标为辅助资产。
- `automations/benny/templates/configuration.example.yaml` 与 `show-me-your-work/references/decision-log-template.tsv` 作为文档形式模板单独列出，不把 YAML 或 TSV 配置误算为代码能力。
- 58 个 `SKILL.md` 的 frontmatter 描述长度已逐份测量，最长 460 字符（`maintain-formal-verification-skill`），低于 DSH `catalogDescriptionMaxLength` 默认 500，不存在描述截断风险。

### 9.3 未决证据

以下项目在固定提交和本次调查范围内不能完全证实，`implement` 阶段必须按当前提交未证实处理，不得写成已支持：

| 编号 | 未决问题 | 当前证据与影响 |
|---|---|---|
| U-01 | DSH 是否有稳定的屏幕视频录制工具链 | 当前工具目录只有 `read_image`（PNG、JPEG、WebP、GIF）和 browser 或 CUA 截图能力，没有视频录制或视频渲染工具。pstack 的 benny control-adapter 要求 recording；非 benny 的 verification skill 多数只需要截图。若必须视频，需要外部 ffmpeg 或系统录制，标为未证实。[docs/tool-catalog.md#L1131-L1148](../upstream/deepseek-harness/docs/tool-catalog.md#L1131-L1148) |
| U-02 | DSH `ask_user_question` 在 headless 或非交互 profile 的实际回答者 | `user-questions` 服务只在 live root 有 answerer；无 answerer 时 `ask` 会失败或阻塞。pstack 的 Claude Code 适配在 `-p` 模式改成纯文本提问；DSH headless 的命令行行为当前提交未证实。[docs/subsystems/user-questions.md#L280-L293](../upstream/deepseek-harness/docs/subsystems/user-questions.md#L280-L293) |
| U-03 | `@deepseek-ai/dsh-experimental-session-search` 对子代理 transcript 的覆盖深度 | `session_trace` 能追踪子代理，但 Cursor 的 `subagents/*.jsonl` 文件路径不存在；跨会话要求精确 `cwd`。`reflect` 的自审和 `show-me-your-work` 的 transcript audit 可能只能读到父会话事件。[E18](../upstream/deepseek-harness/packages/experimental/session-search/README.md#L8-L20) |
| U-04 | DSH browser provider 的截图与 ARIA 输出是否足够 pstack 的视频或截图证据 | Stagehand、Playwright、Chrome DevTools 的 screenshot 可用，但不同 provider 的工具名、页面身份标记和清理语义未在本审查全部实测；`create-verification-skill` 里的二实例并行也依赖具体 provider。标为待实现时验证。[E15](../upstream/deepseek-harness/docs/subsystems/browser-use.md#L9-L15) |
| U-05 | DSH `worktree` 服务能否安全支持同一 Session 连续创建多个候选工作树 | `create_worktree` 会改变当前 Session 目录；连续调用时的源仓库选择与 `from` 解析在文档中未给出多候选示例；`arena` 的每候选独立工作树需用 shell `git worktree add` 或逐次显式 `cwd` 验证。[E13](../upstream/deepseek-harness/docs/tool-catalog.md#L2608-L2634) |
| U-06 | `gh`、`git`、`node`、`java`、`mise`、`ffmpeg` 在 DSH 桌面和 headless 宿主上的可用性 | DSH 的 `bash` 工具执行 `bash -c`，但目标机器是否安装这些命令、`gh` 是否登录、Java 与 TLC 与 mise 版本是否满足 `statechart` 要求不在本仓库控制内；脚本 Node 重写只解决运行时语言，不解决外部命令。[E12](../upstream/deepseek-harness/docs/tool-catalog.md#L695-L735) |

已核销的未决项：

- DSH 是否有能在 bundle patch 中声明 agent preset 的官方方式：已由 `docs/decisions/2026-10-28-pstack-plugin-tools.md` 的既定适配和 DSH `@deepseek-ai/dsh-agent-preset` 文档覆盖，见 6.1。
- pstack 技能描述超过 500 字符：经逐份测量最大 460 字符，不存在截断风险，见 9.2。
- `orch` CLI 是否仍需移植：因上游删除 `orch.ts` 与 `store.ts` 而关闭，见第 5 节退役说明。

### 9.4 审查统计

| 项目 | 数量 |
|---|---:|
| 上游 Markdown 文档（不含测试语料） | 136 |
| statechart 测试语料 `report.md` | 33 |
| `SKILL.md` | 58 |
| Playbook | 23 |
| Principle | 24 |
| 子代理定义 | 2 |
| benny automation 文档 | 11 |
| 文档形式配置模板 | 2 |
| 可执行脚本入口 | 5 |
| 原子能力总数 | 135 |
| 映射 | 47（完整 44、部分 3） |
| 标准模式 | 72（完整 18、部分 54） |
| 可选插件 | 3（完整 1、部分 2） |
| 平台排除 | 13 |
| 插件内实现项 | 8（`PI-01`、`PI-02`、`PI-03`、`PI-05`、`PI-06`、`PI-07`、`PI-08`、`PI-09`） |
| 已选择实现项 | 4（`PI-01`、`PI-02`、`PI-08`、`PI-09`；见 6.1、7.1） |
| 证据唯一实现项 | 4（`PI-03`、`PI-05`、`PI-06`、`PI-07`；见 7.2） |
| 待选择实现项 | 0 |
| 未决证据 | 6（`U-01` 至 `U-06`） |

审查结论：上游 136 个文档与 33 个测试语料均有去向；135 个原子能力全部落在映射、标准模式、可选插件或平台排除之一；标准模式与可选插件仍不完整的 8 项已进入插件内实现范围。`PI-01`、`PI-02`、`PI-08` 的实现方向已由 2026-10-28 的接受决策固定；`PI-03`、`PI-05`、`PI-06`、`PI-07` 为证据唯一；`PI-09` 的测试语料打包方式沿用 B 方案（2026-10-29）。
