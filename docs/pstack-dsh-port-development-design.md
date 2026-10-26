# dsh-pstack v2 开发设计

Status: implemented (2026-10-26)
Date: 2026-10-24
Audience: 查"当时为什么这样设计"的人，以及要判断某条设计是否仍然有效的人

实施从 [§13 实施顺序与交付单元](#13-实施顺序与交付单元) 开始。验收看 [§12 测试和实机验收](#12-测试和实机验收)。逐技能查 [§6 56 个技能逐项处置](#6-56-个技能逐项处置)。playbook 查 [§7 23 个 playbook 逐项处置](#7-23-个-playbook-逐项处置)。未决项查 [§15 已决定事项与保留问题](#15-已决定事项与保留问题)。

> **实施已完成，本文件是设计依据而不是当前契约的权威来源。** 行注册、`inject` 列表和工具入参出参的权威定义在代码：`cordis.patch.yml`、各 `src/*.ts` 的 `export const inject`、`src/host-contract.ts`。实施期间有四处偏离设计，各自都有决策记录，见 §3.3 末尾。凡本文件与代码不一致，以代码为准；发现不一致应改本文件或补记录，不要让读者照抄过期指令。

## 目录

1. [目标与验收范围](#1-目标与验收范围)
2. [上游实现方式及其适用边界](#2-上游实现方式及其适用边界)
3. [总体架构](#3-总体架构)
4. [术语与功能替代表](#4-术语与功能替代表)
5. [生成器和资源契约](#5-生成器和资源契约)
6. [56 个技能逐项处置](#6-56-个技能逐项处置)
7. [23 个 playbook 逐项处置](#7-23-个-playbook-逐项处置)
8. [SkillProvider 与技能加载](#8-skillprovider-与技能加载)
9. [`pstack_subagent` 详细契约](#9-pstack_subagent-详细契约)
10. [受限历史读取设计](#10-受限历史读取设计)
11. [配置、安装和升级](#11-配置安装和升级)
12. [测试和实机验收](#12-测试和实机验收)
13. [实施顺序与交付单元](#13-实施顺序与交付单元)
14. [风险与应对](#14-风险与应对)
15. [已决定事项与保留问题](#15-已决定事项与保留问题)
16. [主要证据索引](#16-主要证据索引)

## 1. 目标与验收范围

本设计把上游 Cursor `pstack` 移植为可安装、可更新、可验证的 DSH bundle。实施者不需要重新调查术语或猜测 DSH 接口。本文件给出源版本、目标结构、逐技能处置、Host 接口、实施顺序和运行验收。

首版必须满足以下条件。

- 注册 55 个技能。`make-bot-ui` 是唯一的明确排除项，原因见 §6.15 和 §15。55 表示生成资产覆盖，不表示所有工作流都已具备运行等价性。可选能力缺失时，对应功能必须标为未支持或未验证。
- 保留 23 个 playbook、2 个子代理定义、技能 references、脚本、指南和许可证。运行所需资源不能只复制 `SKILL.md`。
- 提供 `pstack_subagent`。它保留角色路由、agent preamble、三类 panel 展开、完成通知和 fresh-child 工作方式。
- 提供 `setup-pstack`，把用户确认且通过模型元数据预检的 `provider/model` 和推理档位写入 `$DSH_HOME/pstack-models.md`。元数据预检不证明凭证、网络或真实调用可用。
- 技能内部组合按已知路径读取技能文件。用户仍可显式输入 `/name`。
- 为当前会话历史提供受限的只读查询。不得通过扫描整个 `$DSH_HOME/sessions` 或解压整个日志目录实现。
- 对不能等价替代的能力给出局部、明确的降级。不得把 worktree 说成 VM，把 reminder 说成事件订阅，或把同模型复核说成跨模型评审。
- 生成器、适配规则、上游指针和生成产物可以重复验证。安装后在真实 profile 中验证技能加载、委派、会话读取和脚本。

首版不承诺以下能力。

- Cursor Automations、routine、`SendToUser`、Grok Bot webhook 唤醒闭环。
- Cursor cloud VM、云控制台、跨设备执行和云端进程恢复。
- `typescript-best-practices` 的 `paths` 自动触发。该技能可通过描述匹配或 `/typescript-best-practices` 显式使用。
- 在没有独立模型路由时仍宣称多模型独立评审。实现应如实标记同模型复核。
- 在没有项目验证驱动时仍宣称 UI、CLI、性能或像素级行为已经验证。
- 自动升级 DSH 核心。目标 API 以本文件记录的 DSH `0.2.1-rc.3` 契约为实施基线，安装时重新检查。

### 1.1 证据基线

| 对象 | 固定版本或位置 | 已核实事实 |
|---|---|---|
| 上游 | `upstream/cursor-plugins`，`d1453c11d1dde9714d4c313c97d3a68432265c7f` | `pstack/plugin.json` 为 `0.15.29`。56 个技能目录含 134 个文件。 |
| Claude Code 参照 | `upstream/cursor-plugins/harness/pstack/claude-code` 和 `scripts/generate-pstack-harness-trees.mjs` | 23 个 `SKILL.md` 只增加适配导读，其他 111 个文件与原始技能树逐字节相同。 |
| 当前分支 | `refactor/plugin-v2` | 包含 `AGENTS.md`、`.gitmodules`、`upstream`、README、本设计文档、决策记录和上游核对脚本；插件实现尚未开始。 |
| 旧实现 | `main`，`3416f562232cd3c54ca4a47a20adf1adc56ff364` | 生成器和 Host 可作参考，不可作为现行 API 证明。 |
| DSH | `/home/leihaohao/.vite-plus/packages/@deepseek-ai/dsh/a1604d92-17eb-42b5-b7b7-f42c39952459/lib/node_modules/@deepseek-ai/dsh/`，`0.2.1-rc.3` | `skills`、`subagents`、`sessionQuery`、`worktrees` 等契约通过 Inspect 和安装包源码核对。版本见 `package.json:4`，该目录是已安装运行包，不是仓库工作目录。 |
| 旧参考目录 | `/home/leihaohao/workspace/pstack` | 未提交的旧实验，上游更旧。不得作为本次生成基线。 |

本文件中的“事实”来自上述源码、只读脚本和 Inspect。模块设计、阶段拆分及验收计划是建议，尚未通过新实现验证。执行 `node upstream/cursor-plugins/scripts/generate-pstack-harness-trees.mjs --check` 已得到 `harness/pstack is up to date.`。执行 `node scripts/check-upstream-tree.mjs` 会输出逐文件比对，预期 134 个原始文件和 134 个镜像文件、111 个逐字节相同、23 个仅加 adapter、0 个其他变化。脚本位于 `scripts/check-upstream-tree.mjs`，结果打印到标准输出。§6.33 的 32 行引用已逐条回读原文核对，CC-copy 与 CC-adapter 分类另经机械比对 32/32 一致。文档和核对脚本经 comment-sicko 只读评审，未发现应删除的注释。这些结果不证明 DSH 插件已实现或已运行。

## 2. 上游实现方式及其适用边界

### 2.1 上游实际做了什么

上游以 `pstack/` 为源，在 `harness/pstack/claude-code/` 生成独立目录。生成器位于 `scripts/generate-pstack-harness-trees.mjs`。

- `:28-51` 的 `TERMS` 是检测表，不是翻译表。
- `:69-85` 递归扫描每个技能内的 Markdown，收集宿主术语和裸技能路由。
- `:87-104` 检查 frontmatter、H1 和适配文档是否提及已使用的检测项。
- `:118-148` 复制技能、agents、指南、README、LICENSE，必要时在 H1 后插入两行适配导读，并处理遗漏资源的 Markdown 链接。
- `:167-187` 的 `--check` 比较路径集合、文件 bytes 和可执行位。
- `.github/workflows/validate-plugins.yml:31-32` 在 CI 调用该检查。

语义映射在 `pstack/docs/harness/claude-code.md`。它告诉模型把 `Task` 换成 Claude `Agent`，把另一技能的调用换成直接 `Read`，并给出模型、路径和跳过规则。它不是自动重写器。两个 agent 文件原样复制，连 `~/.cursor/plugins` 都仍在原文中。非 Markdown 资源也不经过术语扫描和链接处理。

这意味着两点。

1. DSH 应复用“固定源、显式适配、独立生成树、漂移检查”的结构。
2. DSH 不应把 Claude 的工具名、路径、manifest 或跳过规则再翻译一遍，也不应期待仅插入一张映射表就能让复杂流程成立。

### 2.2 DSH 需要加强的地方

Claude 的映射依赖模型在运行时理解整段指令。DSH 的主要语义差异应落到生成后的具体文本和工具契约中。尤其不能只加 adapter 就结束以下工作。

- `pstack_subagent` 需要真实的角色到模型路由，不能把 Claude/Grok 名称原样留在技能里。
- `setup-pstack` 的模型发现、配置文件和生效时间不同，需要完整 DSH 变体。
- `sessionQuery` 读逻辑事件，不是 Cursor/Claude 的明文 transcript 路径。
- `worktree-audit.sh` 和 `check-plan.mjs` 与技能说明互相依赖，必须同步修改并执行测试。
- `make-bot-ui` 不是单词替换能解决的流程，应独立排除或另行立项。
- `paths`、图像生成、Cursor Custom Mode、跨技能调用并不都在上游检测表中，DSH 清单不能只复制上游 23 项命中结果。

## 3. 总体架构

```mermaid
flowchart LR
    A[固定上游 pstack] --> B[资源与结构审查]
    C[DSH 能力表和逐文件规则] --> D[确定性生成器]
    B --> D
    D --> E[提交的 assets]
    E --> F[SkillProvider 和 agent preamble]
    E --> G[脚本与文档资源]
    H[角色文件] --> I[pstack_subagent]
    I --> J[ctx.subagents / spawn]
    K[可选官方能力] --> L[worktree / session search / control]
    M[pstack-history] -.可选读取 ctx.get.-> N[ctx.sessionQuery]
    O[sync checks / unit tests / runtime acceptance] --> E
    O --> F
    O --> I
    O --> M
```

### 3.1 四层职责

| 层 | 唯一职责 | 不应承担的职责 |
|---|---|---|
| 上游源 | 提供英文技能、agents、指南、脚本和许可证 | 不手改 vendored 源，不引入 Claude 副本作为第二权威源 |
| 适配声明 | 记录 DSH 能力、逐文件替换、排除项、链接和降级 | 不做全文润色，不维护第二份角色列表，不隐式猜工具 |
| 生成资产 | 提供安装包实际读取的文件 | 不手改，不把上游当运行时网络依赖 |
| Host 运行 | 注册技能、委派、角色路由和受限历史查询 | 不重造 Agent 生命周期、通用 worktree、schedule 或 Agent Teams |

### 3.2 核心目录

实施时恢复并调整旧 `main` 的工程骨架。目标结构如下，文件内容以本设计为准。

```text
package.json
cordis.patch.yml
vite.config.ts
tsconfig.json
src/
  index.ts                 # pstack 组合入口
  frontmatter.ts           # 唯一的受限 YAML 子集实现
  paths.ts                 # 包内资源定位
  provider.ts              # SkillProvider
  roles.ts                 # 角色 manifest、解析和精确查找
  models.ts                # 角色文件读取和 route preflight
  subagent.ts              # pstack_subagent 的纯函数和 Host apply
  history.ts               # 可选只读历史工具
scripts/
  capabilities.ts          # 工具/功能映射和分类
  patches.ts               # patch 数据、导读集合、排除项
  apply-patches.ts         # patch 应用、重叠/次数/片段断言
  build-assets.ts          # 纯内存生成
  role-manifest.ts         # 唯一的角色 manifest，src 直接复用
  sync-upstream.ts         # 原子写入、--check
  check-assets.ts          # bytes、mode、链接、资源闭包、分类审计
  check-scripts.ts         # 上游脚本测试和语法检查入口
assets/                    # 生成并提交，禁止手改
  skills/
  agents/
  docs/
locale/
  en.json
  zh.json
static/                    # 手工维护的静态资源，禁止从上游生成
  icon.png
tests/
docs/
  decisions/
```

可以合并小模块，但不能重新制造两个 frontmatter parser、两份角色清单或两套委派路径。`scripts/patches` 可按技能域分组，不要求 55 个文件各建一个补丁文件。

### 3.3 核心 Cordis 行

实际交付六行，权威来源是仓库根的 `cordis.patch.yml`：

```yaml
- insert:
    - id: pstack
      name: dsh-pstack
    - id: pstack-subagent
      name: dsh-pstack/subagent
      config:
        maxDepth: 2
    - id: pstack-worktree
      name: '@deepseek-ai/dsh-experimental-worktree'
    - id: pstack-tool-worktree
      name: '@deepseek-ai/dsh-experimental-tool-worktree'
    - id: pstack-history
      name: dsh-pstack/history
    - id: pstack-script
      name: dsh-pstack/script
```

每行注入什么，以 `src/*.ts` 的 `export const inject` 为准，本文件不再复述清单——复述会漂移，`pstack-history` 就曾因此写错一次（见本节末尾）。设计阶段的分工与理由仍然有效：

- `pstack` 注入 `skills`，注册一个 provider，服务 55 个技能。
- `pstack-subagent` 注入 `tools`、`subagents`、`llm`，默认 provider 为 `spawn`。
- `pstack-history` 需要 `tools` 与 `subagents`；`sessionQuery` **不是**硬依赖。设计写的是"三项都注入"，实施证明那样会让缺 `sessionQuery` 的 profile 里整行 inactive，连 §10.2 "`sessionQuery` 不可用就返回明确 unsupported" 都无法满足。现在按调用用 `ctx.get("sessionQuery")` 可选读取，工具照常注册，缺服务时返回 `unavailable`。持久化来源由 `sessionQuery` 的组合提供，不能假设 `ctx.sessions` 自身会持久化。当前会话审计使用 `observeSession` 的活跃快照，不需要注入 `sessions` 或调用 flush。
- `pstack-worktree` 与 `pstack-tool-worktree` 挂官方行，带 `disabled: !!js` 条件挂载。守卫读本行 entry（`ctx[Symbol.for("cordis.entry")]`），不是 `ctx.fiber.entry`；后者指向外层 `include` 行，会让两行永远挂载并在已装官方 worktree 的 profile 里冲突。
- `pstack-script` 注入 `tools` 与 `workingDirectory`；`jobs` 不是硬依赖，只在 `background: true` 时按调用读取。该行不经过命令审批与 sandbox policy，已在工具描述和 README 声明。
- `maxDepth: 2` 允许根会话 0、track child 1、worker 2。它是绝对 delegation depth，不是剩余调用次数。实际 Host 设置仍由 `ctx.subagents.resolveMaxDepth()` 决定。
- 允许降低单次调用的 depth，不允许模型超过行配置。`agentPreset` 只在 `allowedAgentPresets` 存在时进入 schema，未配置时由部署决定默认值。
- worktree 是首版随包保证的依赖。未启用时由 bundle 条件挂载官方 worktree 行，已启用时不重复挂载。并行写 playbook 不再要求用户手动启用。Agent Teams、workflow、Ralph 仍不是硬依赖。
- 单元 5 前的内部增量可以暂不注册第三行。该增量不满足 §1 的首版验收，不得发布为首版。`reflect`、完整 `recall`、`show-me-your-work`、`eval` 等相关验收不得标通过。最终 55 技能完整目标需要它。

本节实施期间有四处偏离设计，各有记录：

| 偏离 | 记录 |
|---|---|
| `pstack-history` 的 `sessionQuery` 从硬依赖改为可选读取 | [2026-10-26-f01-optional-session-query.md](decisions/2026-10-26-f01-optional-session-query.md) |
| worktree 守卫改读本行 entry | [2026-10-26-worktree-guard-reads-own-entry.md](decisions/2026-10-26-worktree-guard-reads-own-entry.md) |
| `pstack-script` 不经审批与 sandbox，并走会话目录 | [2026-10-26-script-execution-boundary.md](decisions/2026-10-26-script-execution-boundary.md) |
| 行数从三行增到六行 | 本条由 `2026-10-25-restricted-history.md`、`2026-10-25-worktree-conditional-mount.md` 与 `2026-10-25-node-native-script-runtime.md` 分别覆盖 |

这些行不是完整的宿主组合。目标 profile 还必须提供 `skills` 注册表和技能目录/加载消费者、`tools` 注册表、`subagents` 注册表及 `spawn` provider、`llm` adapter。`skill` 工具由官方 `tool-skill` 提供，不能从 provider 的存在推断它已挂载。真实验收要覆盖 preset 内的可见工具，而不只是 Host service。

worktree 的检测和去重机制在实现阶段选定，并用真实 profile 验证。需要覆盖未启用、已启用、禁用后重新启用和升级四种情况。不能只在 README 声明自动启用。检测不能依赖启动时的快照猜测，启动快照会把热切换和升级路径留成盲区。

## 4. 术语与功能替代表

下表是生成器和逐文件 patch 的能力词表。不是所有命中都允许全局替换。代码块、真实产品名、外部 MCP 示例和普通英语要按所在句子判断。

### 4.1 工具与字段

| 上游概念 | DSH 处置 | 实现约束 |
|---|---|---|
| `Task`、Task call/spawn | `pstack_subagent` | 返回 child id，结果由完成通知到达。不是 `workflow` 或 Agent Teams。 |
| `subagent_type: generalPurpose` | `agent: "general"` | how/why/arena/swarm/interrogate/reflect 等评审使用。 |
| `poteto-agent` | `agent: "poteto-agent"` | playbook 内的实现和辅助 child。工具注入 preamble，不用普通 child 冒充。 |
| `comment-sicko` | `agent: "comment-sicko"` | 保留人格与只读评审职责，通过 `/no-comments` 使用。 |
| `model` slug、effort、`fast` | `role` 加角色文件中的 route | 不把 slug 词法当 DSH API。effort 由真实 adapter 元数据决定，`fast` 不虚构通用等价物。 |
| `run_in_background: true` | 删除字段 | `startActivation` 已经是后台 child，结果由 parent delivery 通知。 |
| `readonly: true` | brief 禁写，必要时只读 preset | 文字约束不是沙箱。检查 `git status`。不能意外删除所需 MCP。 |
| `readonly: false` | 删除字段，保留所需 MCP | 不把 `why`/`reflect` 改成失去证据来源的只读模式。 |
| `resume` | 默认 fresh child，必要时 `send_message` | 仅 checkout、未提交改动或活着的进程等状态昂贵才续用。 |
| `file_attachments` | brief 中列出真实路径 | 不伪造不存在的参数。 |
| `environment: "cloud"`、`cloud_base_branch` | 本地 base、`create_worktree`、`cwd` | 只对齐 committed checkout 隔离，不保留 VM/控制面语义。 |
| `AskQuestion` | `ask_user_question` | `multi_select` 替代 `allow_multiple`。无人值守按 playbook 约束处理。 |
| todolist、`TodoWrite` | `todo_write` 全量列表 | 没有 skipped 状态。跳步保留在 content 中，标 `skip: <reason>` 并不进入执行。 |
| `Grep`、`Glob`、`Read`、`Shell` | `grep`、`glob`、`read`、`bash` | 保留当前工具约束。Windows shell 需按目标环境验证，不能假设 bash 永远存在。 |
| 另一技能 `/name` 或 `the **name** skill` | 按 resource base 的绝对路径 `read` | `disable-model-invocation` 技能不能由模型 `skill` 工具加载。用户 `/name` 是另一条合法入口。 |
| Cursor 内建 `create-skill` | pstack 的 authoring playbook 加 DSH 校验器 | 不宣称获得了 Cursor 的草稿、评测或优化工具。 |

### 4.2 路径、模型和宿主功能

| 上游概念 | DSH 处置 | 实现约束 |
|---|---|---|
| `~/.cursor/rules/pstack-models.mdc` | `$DSH_HOME/pstack-models.md` | 不是 always-applied prompt rule。每次新 delegation 读取。 |
| `.cursor/skills`、`~/.cursor/skills` | `.dsh/skills`、`$DSH_HOME/skills` | 默认项目技能使用 `.dsh/skills/<name>/SKILL.md`。不自动生成嵌套分类技能。 |
| `~/.cursor/plugins`、`.cursor-plugin` | 包内绝对资源路径和 DSH `package.json` | 不在文件系统猜最高版本插件。preamble 由 Host 明确注入。 |
| `~/.cursor/projects/.../agent-transcripts` | 受限 `sessionQuery` 查询 | 不硬编码 `session.v3` 或把 zstd 当普通文本。 |
| Custom Mode | 每个新任务显式 `/poteto-mode` | 首版不伪造键盘快捷键或持久模式。 |
| `/loop` | `create_goal`，必要时 `schedule_create` | goal 是同会话 continuation，reminder 是定时输入。事件 watcher 需另行真实存在。 |
| Cursor Automations、`update_state`、`SendToUser` | 不映射，相关技能排除 | `schedule_create` 不等于 webhook routine，secrets 按宿主规则不索取。 |
| cloud agent、Cursor dashboard | 本地 child 和真实完成状态 | 不承诺 VM、云端状态、跨设备恢复。dashboard 无对应时明确缺失。 |
| `deslop` | `/no-comments` 加一次 diff 复读 | 复读检查叙述性注释、无依据 guard、死兼容路径和无关编辑。不是改名为同一技能。 |
| `control-ui`、`control-cli` | 项目 verification skill 或已存在驱动 | 没有驱动时验证状态为未证实，不能降级为源码阅读后宣称通过。 |
| Bugbot | 保留已有 PR 评论的 triage | `gh` 可读普通 review thread。启动/配置 Bugbot 不属于首版。脚本里的 `bugbot` 标识不删。 |
| built-in PR tool | 已解析 forge 的 `gh`，或实际可用的 `origin` | 有 forge 路径不算缺失，不写无意义的 skip。 |
| `image-generation`、`/visualize` | Mermaid、现有截图/视频或实际渲染能力 | 不虚构图像。无法生成时说明替代，不违背只读采集约束。 |
| agent store | 工作区 `.audit/<task-slug>/` 或用户明确指定位置 | 不依赖 system prompt 一定给出 store。涉及提交的长期记录另行明示。 |

### 4.3 文本保真和降级纪律

- 技能和指南保留英文。不要将其翻译成中文，也不要按 `unslop` 全面重写上游作者文本。
- 优先改一个名字或最小完整语义块。句意、权限、证据要求改变时，不得只做 token swap。
- 每个 patch 声明 `kind: rename | path | replace | drop | exclude`，`reason`，输入文件，精确锚点和期望输出。
- 同一文件的 patch 不能重叠。已替换片段不能再次被通用规则改写。
- `drop` 必须留下完整句子和后续行为，或者删除有明确理由的整个技能/段落。不得留下待执行却不存在产物的步骤。
- 保留 `Bugbot`、外部 MCP 名称、真实 GitHub 数据字段和普通 `agent`/`skill` 词，不做产品名一刀切。
- 能力缺失写在实际发生的步骤，不把全文变成一堆无上下文警告。

## 5. 生成器和资源契约

### 5.1 输入与输出

权威源是 `upstream/cursor-plugins/pstack`，不是 `harness/pstack/claude-code`。复制范围如下。

- `skills/` 全树，排除 `make-bot-ui/`。
- `agents/poteto-agent.md` 和 `agents/comment-sicko.md`，经 DSH 专用转换。
- `docs/guide/` 全部文本和实际引用的图片。
- `README.md` 的 DSH 使用变体。
- `LICENSE`，保留上游版权和许可。
- 新生成 `docs/harness/dsh.md` 与 `docs/pstack-models.example.md`。

不复制 `.cursor-plugin/`、`.claude-plugin/`、`automations/`、仓库其他插件、无关 `assets/` 或 `node_modules/`。不把上游 GitHub `main` 外链当作运行时资源。必要外链固定到源 commit，且不能代替本地必需文件。

### 5.2 适配数据形状

建议每份文件生成一个 `Asset`，不用多态松散文档约定。

```ts
type Asset = {
  path: string
  bytes: Buffer
  executable: boolean
  origin: "copy" | "generated"
}

type Patch = {
  file: string
  kind: "rename" | "path" | "replace" | "drop" | "exclude"
  reason: string
  anchor: RegExp | string
  expectedMatches: number
  replacement?: string
  outputIncludes?: readonly string[]
}
```

`Asset` 表示一个字节资源，不是逐字段可空的状态包。文本 patch 只作用于已解码的 UTF-8 Markdown 或指定脚本，二进制永远走 `bytes` 复制。

流程如下。

1. 枚举 `skills/<name>/SKILL.md`，验证目录名、frontmatter name、kebab-case 和长度。
2. 读取技能及资源的 bytes 和 executable bit。文本与二进制分开处理，禁止把二进制按 UTF-8 读入。
3. 先应用 `exclude`，再应用文件级 patch。每项锚点必须精确命中声明次数。
4. 只对 `INTRO_SKILLS` 显式集合中的技能，在 H1 后插入 DSH 指引。集合由上游宿主术语检测和 DSH 适配例外共同确定，当前为 24 个。集合内技能必须都有 H1，否则构建失败；不要给全部技能默认插入，也不要为了格式统一给上游正文补标题。导读只说明实际适配文件的位置，不用它代替精确替换。
5. 处理 frontmatter。保留 `name`、`description`、`disable-model-invocation`、`user-invocable` 和实际支持的 `whenToUse`。去掉 `icon`、`color`、`is_background`、`paths` 等当前 DSH 不消费字段，并在规则中说明。`typescript-best-practices` 的 `paths` 单独记录自动触发缺口。
6. 只规范化目标格式需要的 CRLF、frontmatter 和最终换行。非特殊生成文件不得顺带清理全文空白。
7. 解析 Markdown 链接，验证本地目标存在。遗漏资源先修复复制范围，不能默认改为网络链接。
8. 执行最终输出检查，再原子替换生成目录。

### 5.3 防双重适配

旧 `main:scripts/adapt.ts` 先局部替换，再执行全局规则，可能把新文本再改一次。新实现采用文件内互不重叠的 patch 区间，或者以 token 保护已完成的替换。通用规则只处理未判定区间。

每个 patch 至少通过四类断言。

- 上游锚点仍命中，次数正确。
- 输出包含预期 DSH 句子和关键安全约束。
- 输出锚点不会再被后续规则改变。
- 最终文本不含该上下文中禁止的 Cursor 字段，同时保留允许存在的真实产品名和普通词。

### 5.4 提交与同步检查

`assets/` 生成后提交，供代码评审阅读。上游指针、适配规则、生成器和生成树在同一个变更中更新。普通 `build` 和 `test` 不自动重写生成基线。

`sync --check` 在内存重建，并检查以下项目。

- 期望路径与实际路径完全相同，包含缺失和多余文件。
- 所有 bytes 相同。文本只允许明确声明的 CRLF 差异。
- executable bit 相同。
- 所有 patch 锚点仍有效，所有生成的预期片段存在。
- 55 个技能可解析，name 与目录一致，调用标志符合上游。
- 内部相对链接、资源引用、脚本入口和指南图片存在。
- 排除技能的导航链接已同步删除，不出现 `/make-bot-ui` 的可执行指引。
- 禁词审计按文件和允许例外执行。禁词为零不是语义验收，仍需 golden 检查。
- 脚本与 Markdown 的共享协议一致，例如 `check-plan.mjs` 的检查标记与计划模板相同。

同步报告需要列出概念乘文件的覆盖矩阵、未使用规则、保留的外部产品名和所有语义替换原因。`TERMS` 只用于发现候选，不自动证明覆盖。新出现的 Cursor 概念若无规则，应失败并进入人工审查。

### 5.5 脚本和指南

- `poteto-mode/scripts/check-plan.mjs` 的 `PROGRAM_MARKERS` 与 `multi-phase-plan.md` 同步改。对应 `check-plan.test.ts` 同步更新并运行。
- `worktree-audit.sh` 不能直接读取 Cursor 路径。首版应改为查询受限会话数据或让明确的只读工具提供输入。还需要处理跨平台 `stat`，不能把 macOS 命令替换为“DSH 等于 Linux”。
- `orch/`、`watch-pr/`、`bootstrap.ts` 保留上游逻辑，先检查 Bun/Node、依赖安装、锁文件和 shell 条件。它们的测试不能依赖主 `vp test` 碰巧发现。
- `show-me-your-work/scripts/log.sh` 保留追加、表头、tab/换行清理和公式注入防护，并验证可执行位。
- `docs/guide/` 与 `poteto-help` 按最终实现写安装、角色、worktree、goal、会话历史和降级说明。图片随包，链接不指向漏拷文件。
- 首批必须实现的文件 patch 包括 `blast-radius/SKILL.md:33-48` 中对 `why`、`arena`、`unslop` 的运行时引用。它们都改为按 resource base 的绝对路径读取，不能因上游 Claude 没有 adapter 就原样保留裸调用。
- 发布前检查实际 packed file list。至少包含 `dist`、`assets`、`cordis.patch.yml`、README、LICENSE、locale、`static` 和 icon。本地 linked install 不过滤目录，因此还要检查 registry tarball。

## 6. 56 个技能逐项处置

“原样”指正文可保留，仍通过统一 frontmatter、链接和资源检查。“适配”指有明确文本替换或能力要求。所有技能的 `disable-model-invocation` 保留。上游未设置该字段的 `setup-pstack` 不得被机械补上。

### 6.1 poteto-mode

资源为 `SKILL.md`、23 个 playbook、`references/bugbot-triage.md`、`scripts/` 和 `agents/poteto-agent.md`。

需处理 `AskQuestion`、create-skill、deslop/control、Cursor babysit、`/loop`、Task/模型/todo/cloud/restart。Subagents 段改为真实的 `pstack_subagent`、`agent`、`role`、`cwd` 和 depth 语义。内部技能按路径读取。默认 fresh child 与 `send_message` 的例外保持。主会话仍拥有 playbook、todo 和最终评审。

必须保留原则先读 leaf 后引用、23 个 playbook 的匹配、跳步原文、吞吐检查点和证据标准。工作流功能逐项见 §7。

### 6.2 poteto-help

资源含 `references/prompting.md`、`recipes.md`，并链接 README 和全部指南。

改成 DSH 的安装、`/setup-pstack`、角色文件、每次 delegation 生效、显式技能调用和本地 worktree 说明。缺角色文件或角色行表示继承 parent route，不是仍有 Claude/Grok 默认。无持久 Custom Mode。删除 `make-bot-ui` 导航，修复 README 相对路径和公开链接。cloud、图像生成、control、外部 tracker 等内容只能按实际可用能力描述。

### 6.3 in-your-own-words

原样。无宿主特定工具。保留只复述目标与问题、不开始实现的边界。

### 6.4 sharpen

原样。保留专家补充、原始材料、方法工具和外部证据四步，以及只重写 prompt、不执行任务。

### 6.5 how

资源含 `references/explorer-prompt.md`、`explainer-prompt.md`。

Explorer 用 `pstack_subagent({ agent: "general", role: "how explorer" })`，明确只读。Explainer 用 `role: "how explainer"`。简单问题只启动一个 explainer，复杂问题才并行 2 至 4 个角度。全部 explorers 返回后再单独合成。Read/Grep/Glob 改成 DSH 名称。缺少模型配置只说明继承 parent，不虚构双模型差异。

### 6.6 why

资源含 `references/` 下全部方法论和 8 个 source 文档。

`why investigators` 和 `why synthesizer` 分别路由。先建立 git/gh 代码锚点，再按实际 MCP 和工具发现证据源。源码调查是必做，其他类别不可用要记录 gap。不要把外部 MCP 名称写成 DSH 已安装能力，也不要以只读模式切断所需 MCP。保留引用置信语言、来源清单、查询范围和原文链接。

### 6.7 recall

使用官方可选 `session_search`、`session_event_search`、`session_trace` 和事件读取能力，或插件为当前工作区提供的同等只读封装。按 cwd、时间、主题和明确授权的 session id 过滤。`session_search` 默认排除当前会话，正适合历史 recall，但不能拿它代替当前会话审计。

保留默认 7 天、topic/workspace 范围、少量不 fanout、why 的 shared-record 调查、live-state 验证和输出 contract。chat 证据改为 DSH session id。需要快速模型时新增 `recall miners` 角色，或者如实继承 parent，不把默认称谓当已验证速度。

### 6.8 ketchup

原工作流程基本保留。`/visualize` 和 image generation 改为当前真实渲染能力、Mermaid 或已有 artifact。不得为采集新图而启动应用或 job，不得伪造截图、数值和视频。行动项必须包含用户决策、推荐、影响、证据、风险和实际链接。

### 6.9 blast-radius

适配：保留安全证据步骤，仅将 `why`、`arena`、`unslop` 的运行时引用改为按 resource base 的绝对路径读取。通过真实代码或运行应用证明安全性事实，而不是只写论证。没有项目驱动时明确验证缺口，不能将调查或 typecheck 当作运行证据。

### 6.10 architect

资源含 `design-red-flags.md`、`rationale-template.md`、`runner-prompt.md`。

用 `architect runners`，不能错用 `arena runners`。每个配置 entry 一个 child，至少两个结构不同候选。Worktree 在 child 内创建，或由 parent 顺序创建后传路径，不能让多个 child 改同一个 parent cwd。保留 ground、sketch、可选 checkpoint、implement、scrap 和 rationale 的全部结构。

### 6.11 arena

用 `arena runners` 自动 panel 展开，每条 entry 对应一个 child 和实际 route。`arena cross-judge pool` 用 `roleIndex` 选一个 judge，优先不同 provider/model 家族。无法确认不同家族时明示同模型复核。所有 candidates 完成后才 judge。保留主代理全读、rubric、base 选择、graft 和最终验证。

### 6.12 swarm

每个 worker 用 `agent: "general"` 和 `role: "swarm workers"`；该角色是 list，首项是每个 worker 的默认 route，model race 的每个 arm 用 `roleIndex` 选另一 entry，worker 仍由调用方逐个启动。base/SHA、采样方法、独立输出和 PASS/ISSUES/BLOCKED 继续保留。写 worker 需要官方 worktree 或预建 checkout，不用 `environment`。缺失结果只重试一次，第二次记 gap。不能用 Ralph 代替 race。

### 6.13 interrogate

资源含 4 个 reviewer references。用 `interrogate reviewers` panel，Reviewer A/B 对应实际 route。brief 禁写并检查工作区。保留 lead 自己分类、不同意见、证据、Act on/Consider/Noted/Dismissed 和不自动改代码。相同 route 时不得声称不同模型独立发现。

### 6.14 automate-me

`allow_multiple` 改为 `multi_select`。项目 mode 写到 `.dsh/skills/<handle>-mode/SKILL.md`，用户级写到 `$DSH_HOME/skills/<handle>-mode/SKILL.md`。沿用 disable-model-invocation 的默认值。历史读取用受限会话查询。create-skill 替换为本包 authoring 规则和 frontmatter/link 校验，不虚构 description 优化工具。保留多切片交叉验证、用户迭代、worktree 和 PR 边界。

### 6.15 make-bot-ui

排除，不注册，不进入 55 技能计数。它依赖 `update_state` 创建 webhook routine、Cursor Routines 面板、`api2.cursor.sh/automations/webhook`、sender key 的 `SendToUser` secret request 和 `[routine]` 唤醒。DSH 的 schedule、webhook delivery、Tailscale 和普通本地 server 均不构成这个闭环。

同步删除 `poteto-help`、README、指南中的可执行入口。未来若需要，另立 DSH ingress、签名认证、凭据存储、后台 server 生命周期和 agent 唤醒设计，不在本次用模拟实现补齐。

### 6.16 setup-pstack

使用专用 DSH 变体，不做路径字符串替换。

- 优先 `list_subagent_models()` 无参列 provider，再 `list_subagent_models({ provider })` 列模型，再 `list_subagent_models({ provider, model })` 查 effort。该工具是否存在取决于官方 delegation 配置。
- 工具不可用时，请求用户给出其已确认的 `provider/model`，或者全部使用 `inherit-parent` 并说明未验证。不得硬编码本机模型或索取 API Key。
- 角色文件为 `$DSH_HOME/pstack-models.md`，支持 `inherit-parent` 或 `<provider>/<model> [effort]`，panel 是逗号分隔列表。
- 保留四档预算的语义。目标 effort 必须在具体模型支持列表中，不能假定所有模型都有 `max/xhigh/high/medium/low`。
- 重新运行时读取旧配置，保留用户改动，列出 retired roles。覆盖前确认，完整写出，确保重复执行收敛。
- 新值影响下一次新 delegation。已经运行的 child 保持启动时 route，不写“必须新会话”这种未核实结论。
- 保留两个 verification 生成器的一次性可选建议，但只在它们确实随包可用时提供。

角色键共 17 行，必须来自一份 manifest。

```text
feature, refactoring
bug-fix
perf-issue
hillclimb
judgment and prose
hardest tasks
how explorer
how explainer
why investigators
why synthesizer
reflect tooling
reflect judgment, divergent, synthesizer
arena runners
arena cross-judge pool
swarm workers
architect runners
interrogate reviewers
```

### 6.17 reflect

资源含 4 个 reviewer/synthesizer references。

使用 `pstack_history` 获取当前会话及直接子代理的原始事件，或由父会话提供受限的紧凑摘要。摘要只能支持非审计评审。使用摘要时，完整 transcript 审计仍未完成，对应 §12.4 用例不得判通过。三个 reviewer 分别用 `reflect tooling` 和共享的 `reflect judgment, divergent, synthesizer` 角色，synthesizer 用共享角色。保留禁写、MCP 引用核查、Accepted 需用户批准、Backlog 不自动发帖和结构化 enforcement 检查。

references 中识别技能使用的条件改为真实 DSH `skill`/`read` 调用、技能资源路径和工具名。不得只识别 Cursor `Read`。create-skill 改为 authoring 规则与验证器。完整 transcript 不可用时报告未完成该项审计，不伪造已读全量。

### 6.18 correct

原样。保留从重复错误类别出发、架构到类型/lint 到测试到文档的优先级，以及真实历史反例证明。Agent 指令文件按 DSH 项目规范选择。不得把该技能退化为只写规则。

### 6.19 teach

运行 how/why 后合成，保留 why 的置信语言。图按每次新增一个部分逐步构建。空间示意需要图像生成但工具不存在时，改用 Mermaid 或已有 artifact 并说明，不能声称已生成白板图。中文会话按宿主语言策略用自然中文表达，不能机械要求英文回复。

### 6.20 tdd

原样。保留便宜本地测试路径、先红后绿、无法合理测试时用最近可执行验证，以及 failing-before/passing-after 证据。不得为了流程搭建过大的测试环境。

### 6.21 benchmark-checklist

原样。profiler 和命令是否存在按当前项目检查。报告数字前保留 limiter、误差、重复运行和端到端相关性检查。

### 6.22 no-comments

资源还包括 `agents/comment-sicko.md`。调用 `pstack_subagent({ agent: "comment-sicko" })`，Host 注入人格。保留两次报告、主代理接受/拒绝判断和结构化替代建议。只读评审不是权限沙箱，需检查 diff。交互批准可用 `ask_user_question`，无人值守遵守原授权要求。

### 6.23 typescript-best-practices

正文和 `references/patterns.md` 原样。删除不支持的 `paths` 字段并登记功能缺口。`description` 保留 TS/TSX 使用条件，用户可显式调用。内部 principle 路由按路径读取 `principle-type-system-discipline` 和 `principle-boundary-discipline`。首版不增加文件事件自动触发系统。

### 6.24 figure-it-out

`todo_write` 替代 todolist，worker 用 `pstack_subagent`。写入隔离用 worktree 或预建 checkout 加 `cwd`。保留可证伪 done predicate、工作流设计、逐单元实验、审计轨迹和 VERIFIED/NOT VERIFIED/INCONCLUSIVE。复杂长任务保留 figure-it-out，不为了使用 workflow 而改路由。

### 6.25 show-me-your-work

资源含 TSV 模板和 `scripts/log.sh`。脚本原样保留并验证追加语义。当前会话审计使用 `pstack_history`，保留 run/start 边界、evidence 指针和只读复核。

跨模型审查必须实际选另一 provider/model 家族。无可用异构路由时，明确 `reviewed by <actual model>` 和同模型限制，不能宣称独立跨模型。若不能读取完整 run 和子代理事件，报告未完成审计，而不是只看摘要后声明通过。

### 6.26 create-verification-skill

项目技能写入 `.dsh/skills/verify-<app>/`。feature map 留在该技能包内，DSH 只发现一层技能目录，正适合这种结构。保留 Launch/Doctor/Drive/Evidence/Cleanup/Helpers、初始 feature map 和真实端到端证明。示例中的 `control-notes` 只是示例，不代表随包通用驱动。

### 6.27 maintain-verification-skill

定位 `.dsh/skills/verify-*/`，每个 feature 一个只读 `pstack_subagent`。父代理收集所有结果再 reconcile，之后由协调者串行 live pass。保留 doctor、证据在 cleanup 后仍存在、编辑范围仅限验证资源、产品问题不藏在文档修改中，以及 clean/changed/blocked 三种结果。

### 6.28 create-formal-verification-skill

原主体保留。生成项目技能时遵循 DSH frontmatter 和 `.dsh/skills` 路径。验证工具按目标仓库现场选择，不随技能虚构 TLA+/SMT 环境。必须保留反例注入、清理恢复、边界说明和不得为通过而削弱性质。

### 6.29 maintain-formal-verification-skill

保留按行为查找验证技能、先运行旧检查、逐 commit 审查、更新后反例验证、sync commit 和 bug/drift 区分。负向变异在隔离环境执行并恢复。不能只复制文字就宣称完成验证。

### 6.30 unslop

原样。稳定规则编号不能改。`harness as a metaphor` 是写作示例，不是 DSH 产品名。其他技能需要它时按路径读取。

### 6.31 bro

原样。无额外资源或模型路由要求。

### 6.32 technical-writing

原主体保留。应用 unslop 时读取对应文件，不直接编辑 unslop。保留文档模式、句子规则、Global English 和 PR 写作约定。

### 6.33 逐技能源证据速查

下表压缩路径前缀 `skills/`，行号均指 `upstream/cursor-plugins/pstack/skills/`。Claude Code 镜像在标题后多两行导读，按镜像核对会整体偏移。CC-copy 表示镜像无变化，CC-adapter 表示只插入统一导读。这是上游事实，不是 DSH 修改量的分类。详细的 DSH 功能要求见各小节。

| 技能 | 上游源证据和 Claude 处理 | DSH 改造重点 |
|---|---|---|
| `poteto-mode` | `poteto-mode/SKILL.md:20-38,93-149`，CC-adapter | 委派、角色、内部技能、playbook 和脚本全套适配 |
| `poteto-help` | `poteto-help/SKILL.md:25-60,66-99,112-148`，CC-adapter | 安装、配置、导航、降级和实际帮助文案 |
| `in-your-own-words` | `in-your-own-words/SKILL.md:7`，CC-copy | 原文保留 |
| `sharpen` | `sharpen/SKILL.md:7-16`，CC-copy | 原文保留 |
| `how` | `how/SKILL.md:11-32`，CC-adapter | role、只读 brief、探索和合成两阶段 |
| `why` | `why/SKILL.md:11-13,23,33-84`，CC-adapter | 真实 MCP、证据类别、角色和引用；Cursor IDE 上下文改为对话或显式目标 |
| `recall` | `recall/SKILL.md:13-21`，CC-adapter | 授权历史搜索和 shared-record 调查 |
| `ketchup` | `ketchup/SKILL.md:35-43`，CC-copy | 可视化工具的局部替代，其余保留 |
| `blast-radius` | `blast-radius/SKILL.md:33-48`，CC-copy | 保留证据要求，改 `why`、`arena`、`unslop` 的按路径读取 |
| `architect` | `architect/SKILL.md:27-39`，CC-adapter；worktree 见 `architect/references/runner-prompt.md:3` | `architect runners`、候选数量和 worktree |
| `arena` | `arena/SKILL.md:17-32`，CC-adapter | panel、cross-judge、模型多样性、每候选独立 cwd 或 worktree |
| `swarm` | `swarm/SKILL.md:22-39`，CC-adapter | 本地写隔离、SHA/方法、结果聚合 |
| `interrogate` | `interrogate/SKILL.md:25-46`，CC-adapter | panel、禁写、lead 分类和真实多样性 |
| `automate-me` | `automate-me/SKILL.md:15-17,29,42-77,96-102`，CC-adapter | 会话历史、DSH 技能路径、结构化提问 |
| `make-bot-ui` | `make-bot-ui/SKILL.md:13-51,53-73,105-115`，CC-adapter | 排除 Cursor routine/secret-request 闭环 |
| `setup-pstack` | `setup-pstack/SKILL.md:12-70`，CC-adapter | DSH 模型发现、17 角色、四档预算、立即生效边界 |
| `reflect` | `reflect/SKILL.md:13-58`，CC-adapter；技能使用判定见 `reflect/references/divergent-reviewer.md:19-21` 和 `reflect/references/synthesizer.md:21` | 完整会话、三评审、用户批准、技能使用证据 |
| `correct` | `correct/SKILL.md:13-30`，CC-copy | 原文保留，按 DSH 指令文件执行 |
| `teach` | `teach/SKILL.md:11-19`，CC-adapter | how/why 组合、渐进图、图像生成降级、跨技能读 unslop、回复语言按宿主策略 |
| `tdd` | `tdd/SKILL.md:13-42`，CC-copy | 先红后绿及证据，原文保留 |
| `benchmark-checklist` | `benchmark-checklist/SKILL.md:9-39`，CC-copy | 原文保留，profiler 按环境核实 |
| `no-comments` | `no-comments/SKILL.md:17-23`，CC-adapter | comment-sicko preamble、两次报告和实际修复 |
| `typescript-best-practices` | `typescript-best-practices/SKILL.md:3-5,10,25,31`，CC-copy | `paths` 自动触发降级，references 原样 |
| `figure-it-out` | `figure-it-out/SKILL.md:13-50`，CC-adapter | todo、worktree、实验和审计轨迹 |
| `show-me-your-work` | `show-me-your-work/SKILL.md:38,52,55-74`，CC-adapter | 完整事件、日志追加、真实评审模型 |
| `create-verification-skill` | `create-verification-skill/SKILL.md:9,23-40`，CC-adapter | `.dsh/skills`、项目驱动、端到端证明 |
| `maintain-verification-skill` | `maintain-verification-skill/SKILL.md:19-39`，CC-adapter | source wave、live pass、cleanup 证据、`.dsh/skills/verify-*` 路径替换 |
| `create-formal-verification-skill` | `create-formal-verification-skill/SKILL.md:17-37`，CC-adapter | DSH 技能路径、反例、验证边界 |
| `maintain-formal-verification-skill` | `maintain-formal-verification-skill/SKILL.md:22-58`，CC-adapter | 逐 commit 检查、变异验证、bug/drift 区分 |
| `unslop` | `unslop/SKILL.md:11-62`，CC-copy | 原文和稳定规则编号保留 |
| `bro` | `bro/SKILL.md:7`，CC-copy | 原文保留 |
| `technical-writing` | `technical-writing/SKILL.md:19,93`，CC-adapter | 原文保留，unslop 按路径读取 |

### 6.34 24 个 principle 技能

下列 23 个原样，只有资源链接和统一 frontmatter 检查。`Agents`、`subagents`、`skill`、`PR` 等普通词不应被替换。

- `principle-attack-the-premise`
- `principle-boundary-discipline`
- `principle-build-the-lever`
- `principle-encode-lessons-in-structure`
- `principle-exhaust-the-design-space`
- `principle-experience-first`
- `principle-explain-the-number`
- `principle-fix-root-causes`
- `principle-foundational-thinking`
- `principle-guard-the-context-window`
- `principle-laziness-protocol`
- `principle-make-operations-idempotent`
- `principle-migrate-callers-then-delete-legacy-apis`
- `principle-minimize-reader-load`
- `principle-model-the-domain`
- `principle-never-block-on-the-human`
- `principle-outcome-oriented-execution`
- `principle-redesign-from-first-principles`
- `principle-separate-before-serializing-shared-state`
- `principle-sequence-verifiable-units`
- `principle-subtract-before-you-add`
- `principle-test-behavior-not-implementation`
- `principle-type-system-discipline`

`principle-prove-it-works` 保留原文，仅添加读取 `docs/harness/dsh.md` 的导读，因为它引用 `show-me-your-work`。其它跨技能依赖由统一资源解析和本地链接闭合，不需要给所有原则添加相同前言。

## 7. 23 个 playbook 逐项处置

所有 playbook 都由 `poteto-mode` 读取，不是独立 slash 技能。不得用“上游 Claude 没改它们”推断 DSH 不用改。

| Playbook | DSH 处置与启用门槛 | 交付单元和验收用例 |
|---|---|---|
| `investigation` | 通过 how/why 做只读调查，保持吞吐 n/a、证据和结论，不走 PR/babysit。 | 单元 4，B01 |
| `bug-fix` | `bug-fix` role，真实 surface 先复现再修复。长 hunt 可用 goal，不把 goal 当验证器。红证据在修复之前进入历史。 | 单元 4，B02 |
| `perf-issue` | `perf-issue` role，保留 baseline、profiler/trace、benchmark-checklist 和前后比较。没有真实 profiler 不得用单元测试替代。 | 单元 4，B03 |
| `hillclimb` | `hillclimb` role，冻结测量工具、决策日志、每轮单假设和保留/回退。无人值守借用 goal，不用 Ralph 替代同会话实验监督。 | 单元 6，B04 |
| `runtime-forensics` | 需要实际 live CPU/heap/CDP/profiler 接口。大 artifact 可委派缩减，缺少实时证据时只报告缺口。 | 单元 4，B05 |
| `trace-forensics` | 处理已捕获 artifact，不重跑。大文件可转 SQLite 查询，符号不可解析时明说。 | 单元 4，B06 |
| `feature` | `feature, refactoring` role 和 `poteto-agent`，保留四个吞吐项含 n/a。必要时 arena，不能嵌套时按原文 parent 持 diff 并保 review separation。 | 单元 4，B07 |
| `refactoring` | 用共享 feature/refactoring role。先 characterization pin，再小步迁移。typecheck/lint 不能当行为 pin。 | 单元 4，B08 |
| `prototype` | 在 scratch 中实证开放问题，真实行为、截图或计时。需要 server/browser 时使用真实工具，不把草图直接转为正式 PR。 | 单元 4，B09 |
| `visual-parity` | 冻结 baseline，每组件独立 worktree，图像 diff 必须为零。缺图像比较能力不能宣称 parity。goal 只驱动迭代。 | 单元 6，B10 |
| `authoring-a-skill` | 用 DSH frontmatter、链接和结构校验代替 Cursor create-skill，主观输出走用户反馈，结构变化走测试。 | 单元 4，B11 |
| `eval` | 用 arena runner/judge role、隔离目录和 `pstack_history` 验证实际文件读取。盲化要求不变，候选可见的路径和 prompt 不含禁词。 | 单元 5，B12 |
| `babysit` | `check`、`threads-only` 可先运行。`drive/background` 需要 watcher 和唤醒的真实组合。`watch-pr` 及测试必须随包，schedule 不是 PR 事件 watcher。 | 单元 6，B13 |
| `shipping` | 用独立 child 加本地 worktree 做独立验证，不用 VM 名义。保留实际 surface verdict、patch-id、bottom-up 和人工合并授权。 | 单元 6，B14 |
| `autonomous-run` | 主机制 `create_goal` 和真实完成/阻塞状态。时间提醒只作 heartbeat，事件需要实际 watcher。Ralph 仅在用户明确要求 Ralph 时使用。 | 单元 6，B15 |
| `orchestrate` | 需要 `.audit` store、orch CLI、depth 2、completion→inbox、side-effect liveness 和本地写隔离。云重启/云存活不在首版支持范围，分阶段验收，不能宣称完整等价。 | 单元 6，B16 |
| `autopilot-full` | owners 用独立 worktree，hold 用 `send_message`，stuck 用 interrupt 后 fresh replacement。必须验证 queue/watcher/独立 verifier，合并授权单独给人。 | 单元 6，B17 |
| `autopilot-stack` | 在 full 基础上由 root 独占 topology。`create_worktree` 不替代 PR stack 管理，交付后不写链。 | 单元 6，B18 |
| `session-pickup` | 支持 session id、branch、trail，不支持 cloud-agent URL。`sessionQuery` 加 git 重建现场，goal resume 不等于完整工作恢复。 | 单元 5，B19 |
| `pause-safely` | 需要时 `interrupt_agent`，保留安全边界、WIP commit 和离线 resume note。goal pause 不能替代工作现场保存。 | 单元 6，B20 |
| `multi-phase-plan` | 保留完整模板、10 live lanes、trunk 对照和 review gate。模板中的 `/loop`、cloud、store 改真实 DSH 表述，同步 `check-plan.mjs` 和测试。 | 单元 6，B21 |
| `worktree-cleanup` | 新审计脚本理解 DSH 会话和 worktree，不读 Cursor cache。删除遵守绝对路径核实、WIP/pinned 保护和用户批准。 | 单元 5，B22 |
| `opening-a-pr` | 每个 child 独立 worktree/cwd，pre-commit 用 no-comments 加 diff 复读，统一 forge。保留 PR 结构、ready 和不自动 babysit。 | 单元 4，B23 |

`references/bugbot-triage.md` 原样保留。已有 GitHub Bugbot 评论按普通 review thread 处理，安全、隐私、数据和迁移风险不自动 dismiss。启动或配置 Bugbot 不属于首版。

## 8. SkillProvider 与技能加载

### 8.1 Provider

保留旧 `src/provider.ts` 的单 provider、多技能思路，按当前 `SkillProvider` 契约重建。

- `list()` 返回 `SkillCandidate`，含 name、description、invocation、`source: "bundled"`、provider、`BUNDLED_SKILL_RANK`、locator、path 和目录型 `resourceBase`。
- `get(candidate)` 使用原始 locator，读取 body，返回 `SkillDefinition`。不得把目录名当用户输入拼接，candidate 必须来自本 provider 的索引。
- 包内资源是只读发布资产，不复制到 `$DSH_HOME/skills`。安装后 catalog 需读取 frontmatter，body 按需加载，references/playbooks/scripts 再按 resource base 读取。
- `resourceBase` 只是模型提示，不会自动读取资源，也不授予文件权限。
- 静态包内 provider 以 package reload 为更新边界。不能借用官方 filesystem provider 的 watch 行为宣称 assets 热更新。若支持用户自定义目录，再实现 watch 和 `control.invalidate()`。
- 一个 malformed bundled skill 应使生成和启动检查失败，不能静默消失。可选额外目录可隔离错误并记录诊断。
- 不删除 `disable-model-invocation` 来让技能进入模型目录。模型内部路由通过已加载父技能的指令和路径读取。

### 8.2 Agent preamble

`poteto-agent` 的原始职责保留，但 Cursor 安装发现、最高版本扫描和 `Task` 用语改成 Host 注入。`pstack_subagent` 在启动 child 前读取对应 preamble 和 `poteto-mode` 的绝对路径。`comment-sicko` 人格保留。

读取 preamble 失败必须阻止该 agent 类型的启动并给出诊断，不能像旧实现一样静默退化成普通 child。`general` 不注入这些 preamble。每个 prompt 保持自包含，主 agent 负责审查 diff 和汇总，不能只转发 child 自述。

## 9. `pstack_subagent` 详细契约

### 9.1 模型参数

```text
description: string
prompt: string
agent?: "poteto-agent" | "comment-sicko" | "general"
role?: string
cwd?: string
agentPreset?: string       # 仅 allowlist 非空时出现
maxDepth?: integer         # 只能低于或等于配置上限
roleIndex?: integer        # 选择 list-valued role 的一项
```

默认 `agent` 为 `poteto-agent`。`role` 省略时继承 parent route。`roleIndex` 必须和 `role` 同时提供，且是非负安全整数。`agentPreset` 只影响 preset，不是 pstack 的 `agent` 类型。

工具说明应描述返回值和语义，不重复完整角色列表。失败要返回可操作诊断，不能让错误 route 静默看似已配置。

### 9.2 启动流程

1. 读取 `exec.agent`，没有 Agent 上下文则失败。
2. 根据 `agent` 加载 preamble，组成独立 prompt。
3. 从 `$DSH_HOME/pstack-models.md` 重新读取角色文件。文件不存在或角色缺省时继承 parent。不可读和已配置但拼错要区分，不能把前者当“无配置”。
4. 按角色 manifest 判断单项还是 panel。三个自动 panel 角色是 `arena runners`、`architect runners`、`interrogate reviewers`。其它 list role 默认选首项，`roleIndex` 选择指定项。
5. 解析 `inherit-parent`/`auto` 为不传 `agentOptions`。真实 route 用 `ctx.llm.resolveCallConfig()` 做模型元数据和配置预检，不能只做静态字符串检查。它不证明凭证、网络、配额或真实调用成功，真实模型验收仍需观察 child 的请求和完成结果。
6. 根据 `maxDepth` 配置和请求取较小值，传给每次 activation。
7. 对每个 entry 调用 `ctx.subagents.startActivation()`，参数为 `provider`、`label`、`delivery: "parent"`、`signal` 和包含 `parent`、`prompt`、`cwd?`、`agentPreset?`、`agentOptions?`、`maxDepth?` 的 request。
8. 返回所有 child id 和路由诊断。多个 panel child 在第 N 个启动失败时，不回滚已启动 child，错误中列出既有 id。
9. 完成结果由 runtime 的 parent delivery 到达，不轮询。需要 steer/list/interrupt 时复用官方 control 和单独 list-agents 行。

### 9.3 角色策略

一份角色 manifest 同时驱动 setup 默认、角色解析、panel 行为、示例文件和文档。不可在 `adapt.ts`、setup 模板和 `subagent.ts` 各写一份。

- 精确匹配规范化后的角色名。近似拼写只提示，不猜测。
- `feature, refactoring` 可作为整键和单项别名，panel 角色键中的逗号不能误拆为多个角色。
- `arena cross-judge pool` 不自动 fanout，由 `roleIndex` 选一个 judge entry；`swarm workers` 也不 fanout，首项是每个 worker 的默认 route，race 时用 `roleIndex` 给各 arm 换 entry，worker 仍由调用方逐个启动。并非所有 list-valued role 都展开。
- route 无效时，单项调用失败并指出配置。panel 中可以保留其余 entry，但必须报告降级。若仍启动相同 parent route 的两个 child，不能声称多模型 panel。
- `allowedModels` 是 pstack 行配置的独立精确 route 限制，启动任何 child 前先校验。它不等于 DSH native session allowedModels。继承 native policy 需要公开 seam，首版不读官方私有 projection。
- effort 属于 adapter。缺省继承 parent route 时由 DSH 合并，显式换 route 而未指定 effort 时使用新模型默认。不要全局假定 effort 枚举或 fast 变体。

### 9.4 生命周期和隔离

- 新工作默认 fresh child，brief 包含原始任务、后续指令、之前报告和分支。
- `send_message` 只在必须保留 child 本地状态时使用，返回消息受理，不返回答案。
- `create_worktree({ name?, from? })` 使用本地 ref，不 fetch，返回 `path/branch/baseCommit/repositoryRoot`。`baseCommit` 是返回值。未提交内容留在原 checkout。
- 写入 child 应在自己的会话里调用 worktree，或 parent 顺序准备后把绝对 `path` 传 `cwd`。同 branch 的多个 child 不会自动隔离。
- worktree 不隔离端口、网络、凭据、全局缓存、外部服务或运行时，不自动 merge/cleanup。
- 启动时检查 provider 和 capabilities。`agentOptions`、独立 preset 或 depth 不支持时给出明确错误，不静默忽略。

## 10. 受限历史读取设计

### 10.1 为什么不能只改路径

DSH 默认 JSONL 持久化可以配置 root，默认使用 zstd。官方文档明确压缩文件不能直接按行读取。`ctx.sessionQuery` 提供 `readSession`、`readSurface`、`filterSessions`、`traceSession` 和事件读取，能处理逻辑事件和历史格式。技能不能直接把 Service 当模型工具调用，所以需要薄工具适配。

官方 `session_search` 系列已经提供按 caller cwd 授权的搜索，适合 `recall`。其中 `session_search` 排除当前会话，而 `reflect`、`show-me-your-work`、`eval` 需要当前 run 的完整事实，因此不能只安装 search bundle。

### 10.2 `pstack_history` 工具

组合行 id 为 `pstack-history`，注册给模型的工具名为 `pstack_history`。建议输出一个受限、分页的只读结果。

```text
scope?: "current" | "children"
sessionId?: string           # 省略为 exec.agent.id；提供时必须是直系 child
fromSeq?: integer
limit?: integer              # 有最大值
includeDescendants?: boolean # 默认 false，首版可不提供
```

结果包含请求的 session id、header、每条原始 `SessionEvent` 的 `seq/time/type/data`、下一游标、`source`、快照 `throughSeq`、`persistedThroughSeq`、逐事件 `provenance` 和直接子代理关系。`source` 是 `live` 或 `prepared`，`provenance` 是 `source-log` 或 `read-time-repair`。prepared 来源另外记录 `revision`。`data` 是原始事件数据，不是 `deriveMessages()` 的模型表面。`readSurface` 只用于需要当前模型可见状态的辅助场景，不能替代审计输入。

分页不能建立在 `sessionQuery.listEvents()` 上，因为它只返回摘要。工具优先以 `sessionQuery.observeSession(id)` 取得同一份完整逻辑快照，再按 `fromSeq` 和 `limit` 对这份快照切片，并在 `finally` 中调用 `[Symbol.dispose]()` 释放 lease。活跃 Agent 的 observation 在读取开始时固定 `seq`，之后 `snapshotEvents(0, seq)` 不混入后续追加。审计固定同一 observation 的 `[0, cursor + 1)` 区间，空日志的 cursor 为 -1。`readSession` 可作兼容读取，但它会对一份 detached 副本做重放校验，返回的是原快照事件，因此开放 step/turn 不会导致失败。不得逐页混入新事件，也不得在 flush 后重新取 `session.seq` 混用边界。

活跃读取不需要 `ctx.sessions.flush`。flush 只等待持久化监听器，不冻结日志，也不能阻止 await 期间或之后的追加。当前会话审计应使用活跃 observation，而不是先 flush 再读磁盘。

审计允许开放的 step 和 turn。结果记录快照的 `throughSeq`，后续页只能读取该边界内的事件，不能把调用 `pstack_history` 自己产生的新事件当作既有工作证据。每条事件在 DTO 中带 `provenance: "source-log" | "read-time-repair"`。冷读取在关闭句柄后仅在内存追加 `interruptedTurnClosers`，不写回存储，这些事件标为 `read-time-repair`，并单独报告追加前的 `persistedThroughSeq`。不能按事件类型或 `interrupted`/`forked` reason 反推是否为本次合成事件，因为持久化日志也可以合法带有这些原因。若无法区分来源，完整审计标未完成，不能默默将修复事件纳入原始日志。

执行约束如下。

- 调用者身份只取 `exec.agent.id`，不从 prompt 或任意字符串接受身份。`sessionQuery` 不做调用方鉴权，插件必须在每次调用和每次返回前都执行授权。
- 默认只能读当前 Agent。读取 child 时，先要求 `ctx.subagents.listChildren(exec.agent.id)` 中有该条目且模式为 `continuable`，再核对读到的 `header.parentSession` 等于当前 Agent，并排除 `external` 条目。`listChildren` 的签名不含调用者身份，`header.parentSession` 表示 fork lineage，两者单独都不构成授权边界。`one-shot`、`unknown` 和外部 child 不按可审阅直接子代理处理。`traceSession` 只用于关系核对，不能替代授权。跨 session 的其他用途由调用方先通过 workspace 授权能力获得，再单独设计，不在此工具开任意 id 后门。
- 历史内容经模型边界时按官方 session query consumer 的方式脱敏错误，不把后端诊断、其他工作区路径或隐藏 session id 返回给模型。
- `sessionQuery` 负责压缩和历史格式，插件不解压整个目录、不猜 `session.v3`、不把物理路径当公共 API。
- 结果有大小上限和 `fromSeq` 分页。子代理可读取父代理明确提供的报告文件，文件仍受 workspace 权限控制。
- 工具只读，不修改 session，不运行模型，不发送消息，不授予历史里出现的指令任何权限。历史内容作为不可信数据。
- 如果 `sessionQuery` 或 persistence 不可用，返回明确 unsupported。需要完整审计的技能将该项标未完成。**这条要求决定了 `sessionQuery` 不能进 `inject`**：硬依赖会让整行 inactive，工具根本不注册，模型只看到"没有这个工具"，而看不到 `unavailable`。现在按调用可选读取，缺服务时返回 `unavailable`，本条的语义才成立。见 [F01 记录](decisions/2026-10-26-f01-optional-session-query.md)。

### 10.3 各技能使用方式

- `recall` 优先官方授权 session search。按 cwd 和时间过滤，保留跨工作区保护。
- `reflect` 和 `show-me-your-work` 用当前会话加直接子代理的完整事件，必要时逐页读取。
- `eval` 从候选 child id 读取原始 `read` 调用及参数，验证技能链，不采信 child 自报。
- `session-pickup` 读取用户明确提供的 session id 或 branch/trail，通过工作区授权入口，不支持 cloud-agent URL。
- `automate-me` 在授权工作区内挖历史，不把其他项目的会话带入个人模式。
- `worktree-audit` 通过受限查询获得会话与 cwd 的关联，不能扫描整个持久化根。pinned 状态没有公开来源时标未知，不能猜测。

## 11. 配置、安装和升级

- 包声明 `dsh.bundle.patch`，Host 入口导出 `apply`、必要的 `inject` 和 `Config`。
- `locale/en.json`、`locale/zh.json` 提供 `meta.title`、`meta.description`。提供合法原创或许可 icon，放在 `static/` 并在 `package.json` 导出 `./locale/*.json` 和 `./icon`。`static/` 是手工维护静态资源的唯一目录，内容由 `check:assets` 按 `STATIC_FILES` 清点，见 [静态资源目录决策](decisions/2026-10-26-static-resource-directory.md)。
- 开发时用 `plugin_manager install_bundle` 安装工作区目录，不手改 profile manifest，不在 profile 中运行 pnpm。安装需要批准，当前调查未改变 profile。
- 是否立即可用看返回的 `application` 和 `nextStep`，不能笼统承诺重启或热更新。替换 Host 包常需按管理器要求重启。
- `Config.listConfigs` 的 inactive 不等于工具在所有 preset 不可用。验收还要看当前 Agent 的 `Tool.listTools` 和实际调用。
- `skills/change` 影响后续 catalog，不改已经发生的模型请求。静态 provider 以包更新为边界。
- `engines.dsh`、peer dependencies 和 Node 版本按当前实现确定。开发与验证基线为 DSH `0.2.1-rc.3`，不要复制旧 `rc.2` 约束而不重新评估。
- `setup-pstack` 只写角色文件，不写 `package.json`、`cordis.patch.yml`、native default model 或凭据。
- 当前版本禁止与 Agent Team 在同一个 profile 中同时启用。Agent Team 会遮蔽 `send_message`、`interrupt_agent`、`list_agents`，并共享子代理激活容量。该规则不加运行时检测，最终 README 必须保留警告原文，见 [决策记录](decisions/2026-10-24-no-agent-team-coexistence.md)。
- README 的必填章节和内容边界见 [内容决策](decisions/2026-10-24-readme-content.md)，篇幅与版本写法见 [篇幅决策](decisions/2026-10-24-readme-concision.md)。README 只写用户可见行为，不写实现和源码说明。

## 12. 测试和实机验收

### 12.1 生成与单元测试

- frontmatter：plain、quoted、folded、literal、CRLF、严格 boolean、非法 name、缺 description。共享同一实现，不声称完整 YAML。
- patch：每个上游锚点、期望输出、互斥、最终不被二次改写、单复数、所有格、代码括号、两个模型对比不坍缩。
- assets：路径、bytes、executable、链接、资源闭包、排除项、指南图片和许可证。
- roles：17 键、精确查找、逗号角色、panel 单项选择、inherit、非法 effort、配置文件不可读诊断。
- delegation：preamble、route 到 agentOptions、cwd/preset/depth、三类 panel、roleIndex、部分启动失败、allowlist、parent inherit。
- history：默认当前身份、child 授权、跨 workspace 拒绝、分页、开放 turn 快照、并发追加不越界、异常路径释放 lease、逻辑事件未经裁剪、合成修复事件与持久化事件分开标识、无持久化时报错。
- 旧 `tests/` 的纯函数和 DI 用例可迁移，硬编码 55 改为“上游集合减明确排除”。

### 12.2 上游脚本测试

随包脚本不再是上游的 Bun/bash 源文件，而是由 `scripts/build-runtime.ts` 打包出的单文件 Node 产物：`check-plan.mjs`、`orch/orch.mjs`、`watch-pr/watch-pr.mjs`、`worktree-audit.mjs`、`log.mjs`，以及对应的五个 `.test.mjs`。每个产物首行是 `#!/usr/bin/env node`，依赖（仅 `commander`，来自 `vendor/commander/` 的 14.0.0）全部内联，不含 `bun:` 引用和 `node_modules` 解析，也没有任何安装步骤。上游源码（`orch`、`watch-pr`、`check-plan` 及其测试）经 `RUNTIME_SOURCE_PATCHES` 改写后进入打包器，所以测试体仍是上游用例，只有 import 行与 `import.meta.dir` 被替换。

模型侧通过 `pstack_script` 工具调用这些脚本，不接受任意路径或 shell 字符串：`id` 是固定枚举，`args` 原样透传，入口用 `process.execPath` 启动产物，仅在 `process.versions.electron` 存在时附加 `ELECTRON_RUN_AS_NODE=1`。这就是 Desktop（Electron）没有 PATH `node` 时仍可运行的原因。

`check-plan` 的模板和 marker 要同时修改并验证。`worktree-audit` 保留十列、bucket 取值、`PINNED unknown`、`--sessions` 语义和 git/du 等价逻辑，jq 用法改为 `JSON.parse`，且不扫描会话存储。`log` 保留表头只写一次、追加不覆盖、tab/CR/LF 清理、`= + - @` 前缀转义和结尾换行。

主仓库 `vp test` 不会自动发现 assets 内上游测试，CI 必须单独调用 `pnpm check:scripts`（等价于 `node scripts/check-scripts.ts`）。入口是零安装的：只把 `assets/skills/` 复制到临时目录，隔离 `HOME`/`TMPDIR`/`XDG_CACHE_HOME`，用 `node --test` 跑全部随包测试，再对五个 CLI 各做一次冒烟（四个用 `--help`；`check-plan` 无 help 且无参数退出 2，`log` 无参数退出 1，按各自 usage 断言）。不调用 bun、不调用 bash、不联网；任一失败非零退出，`finally` 清理副本。`log` 的行为测试由 `tests/shell-scripts.test.ts` 负责，产物的字节契约由 `tests/runtime.test.ts` 负责。

**本次发布前核查状态。** `check:scripts` 在 Linux / Node 24.22.1 上零安装通过：5 个测试文件 68 用例全部通过，五个 CLI 冒烟均按预期退出码返回，副本与隔离目录在 `finally` 中删除，生产 assets 树没有任何安装动作。`worktree-audit` 与上游 bash 版本在同一临时 git 仓库上逐列比对一致：`SIZE`（含 `du` 的块分配与目录自身块）、`AGE`、`MERGED` 的 `YES`/`no`、`DIRTY` 的 `clean`/`wip:<n>`/`scratch:<n>`、`REMOTE` 的 `pushed`/`ahead<n>`/`no-remote`、`PR` 的 `#<n>/<state>`（`gh` 小写化、`origin` 原样）、`LAST_CHAT`、`PINNED=unknown`，以及六个 bucket 的取值与按 SIZE 降序排序；错误路径的消息与退出码（未知选项 2、不可读或非数组 sessions 文件 1、缺 base 1）也一致。`log` 在同一环境上用 6 个用例覆盖上游的 3 类行为，并新增父目录创建与二次追加。这些是脚本级运行证据，不是真实会话审计、真实 worktree 清理或跨平台验收；未在 macOS 或 Windows 实机执行。

### 12.3 真实 DSH 验收

本节的十步与 §12.4 的用例都是可执行清单，不是已经完成的证据。单元 7 把它们逐条整理进 `docs/release-verification-checklist.md` 并标注未验证，没有启动任何真实 profile，见 [发布验收分期](decisions/2026-10-25-release-verification-staging.md)。

按以下顺序在隔离测试 profile 执行，不改用户当前 web profile。

1. 构建、打包并检查文件清单。安装 bundle，读取 `application`。
2. 用 Inspect 核对行和 Config，再用当前 Agent 的工具目录验证实际可见性。
3. 55 个技能全部列出。抽查用户 `/poteto-mode`、`/how`、`/setup-pstack`、`/principle-prove-it-works`，确认 body 和 resource base。
4. 对所有含 `disable-model-invocation` 的技能，确认模型目录不暴露，用户显式入口可用，内部路径读取可用。
5. 配置两条真实 route，启动 `how` explorer、`arena runners` 和 cross-judge，观察 child 的实际 request header 和 route，不只检查工具参数。
6. 验证 fresh child、完成通知、`send_message` 的例外、缺 preamble 失败、depth 0/1/2 和错误 route。
7. 每个 writer 使用独立 worktree，验证 base、未提交文件不复制、cwd 只属于对应 child。
8. 读取当前会话和直接 child 的原始事件，验证分页、`throughSeq`、开放 turn、并发追加不越界、lease 释放、跨工作区拒绝、伪造父子关系拒绝和无权限时不泄露。
9. 实际跑 `log.sh`、`check-plan`、`orch`、`watch-pr` 的测试。外部 forge 使用 fake reader，不擅自操作真实 PR。
10. 刷新现有 GUI URL，验证技能入口与交付文件可打开。Web shell 或普通 package 的变更需要重建，不能假设 HMR 自动更新。

### 12.4 行为级验收样例

本节全部用例在单元 7 结束时仍未执行，逐条状态见 `docs/release-verification-checklist.md`。每个 B 用例必须记录真实输入、可观察结果和未覆盖项。涉及外部写操作的用例使用隔离仓库、fake reader 或测试 profile，不擅自操作真实 PR。

#### Playbook 验收

| 用例 | 可观察的通过条件 |
|---|---|
| B01 `investigation` | 一次只读问题产生 how/why 的证据报告和真实结论，吞吐为 n/a，没有代码修改或 PR 流程。 |
| B02 `bug-fix` | 在同一 surface 先得到失败复现，修复后原复现通过，git 历史中红证据先于修复。缺驱动时明确未验证。 |
| B03 `perf-issue` | 保留 baseline 和修复后的 trace，测量工具能区分工作负载，报告包含真实差值和 artifact 路径。 |
| B04 `hillclimb` | 冻结的测量命令先证明敏感性，每轮只改一个假设，保留或完整回退，日志有每轮结果和最低迭代次数。 |
| B05 `runtime-forensics` | 从运行中的进程取得真实 CPU/heap/CDP artifact，并通过 live instrumentation 证明机制，未直接修改产品代码。 |
| B06 `trace-forensics` | 读取既有 artifact，转换成可查询数据并定位源码位置。没有符号信息时明确不给确定诊断。 |
| B07 `feature` | 四个吞吐项均保留，包括 n/a。实现由 `poteto-agent` 完成，review separation 和真实 surface 验证可追溯。 |
| B08 `refactoring` | 先建立会随行为破坏而失败的 pin，迁移所有 caller 并删除旧 API，最终等价比较通过且没有新行为。 |
| B09 `prototype` | 在 scratch 中用实际行为或截图比较候选，形成决策并标明 throwaway，不把草图混入正式实现。 |
| B10 `visual-parity` | baseline 未修改，逐组件图像 diff 为零。任一非零结果或缺截图能力均不得判通过。 |
| B11 `authoring-a-skill` | 新技能有合法 frontmatter、有效相对链接和结构检查；主观变化由用户评审，结构变化有对应测试。 |
| B12 `eval` | 候选看不到禁词和 rubric，judge 看不到模型身份，真实事件证明候选实际读取了要求的资源。 |
| B13 `babysit` | `check` 和 `threads-only` 可用。`drive/background` 能由真实 watcher 唤醒并按 forge 状态停止，不用固定 sleep 冒充事件。 |
| B14 `shipping` | 每个 PR 有独立 agent 的真实 surface verdict，只落地底部连续 verified run，patch-id 与当前 patch 一致，合并需授权。 |
| B15 `autonomous-run` | goal 有明确 predicate 和实际 continuation，达到条件后 complete，持续阻塞按规则 blocked，heartbeat 不冒充事件订阅。 |
| B16 `orchestrate` | 在隔离 fixture 中跑通 brief、pilot、rolling refill、inbox、ledger、depth 2 和连续落地。云存活及云重连明确不支持。 |
| B17 `autopilot-full` | 每个 owner 有独立 worktree，独立 verifier 判决后才允许合并，hold 能停止写入，stuck 能替换为新 child。 |
| B18 `autopilot-stack` | root 独占 topology，形成有序 base-chain，owner 不 rebase/retarget/merge，交付后链不再被修改。 |
| B19 `session-pickup` | 从授权的 session id、branch 或 trail 恢复未完成事项，不重复已验证工作，cloud URL 明确不支持。 |
| B20 `pause-safely` | 在安全边界停止 child，留下 WIP commit 和离线 resume note，恢复后能从指定下一步继续。 |
| B21 `multi-phase-plan` | 生成完整模板和证据框，`check-plan` 接受同协议的正确计划并拒绝缺漏计划，模板不再引用 Cursor cloud/`/loop`。 |
| B22 `worktree-cleanup` | 审计脚本只读取授权会话与 worktree，pinned 未明时标未知，WIP 需用户决定，删除仅针对核实后的路径。 |
| B23 `opening-a-pr` | 在隔离仓库完成小提交、no-comments、diff 复读和 PR 草稿检查，使用统一 forge，不自动启动 babysit。 |

#### 工作技能补充验收

| 用例 | 可观察的通过条件 |
|---|---|
| S01 `/how` | 简单问题只有一个 explainer。复杂问题先 2 至 4 个 explorer，全部返回后才合成。 |
| S02 `/why` | Sources Consulted 含无 MCP 的类别 gap，不从七类折叠成 git-only，引用可由真实来源复核。 |
| S03 `/arena` | 每个 panel entry 对应一个 child 和实际 route，judge 在 candidates 完成后启动，主代理完成 base/graft。 |
| S04 `/architect` | 使用 `architect runners` 而不是 `arena runners`，至少产出两个结构不同的候选和完整 rationale。 |
| S05 `/swarm` | 每个 slice 都有结果，缺失 SHA/方法的报告重试一次，第二次仍缺失记 gap，不把 gap 当 PASS。 |
| S06 `/interrogate` | 每个 reviewer entry 对应实际 route，lead 分类保留分歧，不自动改代码。相同 route 明确不是多模型评审。 |
| S07 `/no-comments` | `comment-sicko` preamble 已加载，拒绝报告后重跑一次，第二次仍拒绝则标 open 并停止。 |
| S08 `/figure-it-out` | done predicate 可证伪，逐单元实验和决策记录完整，结果区分 VERIFIED、NOT VERIFIED、INCONCLUSIVE。 |
| S09 `/setup-pstack` | 不写未经确认的模型，重复执行保留选择并清理 retired role，下一次 delegation 读到新值。 |
| S10 `/show-me-your-work` | 按 start 边界审计真实 run，证据指针可解析，评审模型如实报告，缺完整事件时审计不通过。 |
| S11 `/create-verification-skill` | 在样例项目完成 launch、doctor、drive、cleanup 和证据存活检查。 |
| S12 `/eval` | 从真实日志确认候选读过要求的文件，而非仅看回答，归入 B12。 |
| S13 `/typescript-best-practices` | 可显式加载并读取 patterns，不把 `paths` 自动触发列为已支持。 |

单元 4 执行 B01、B02、B03、B05、B06、B07、B08、B09、B11、B23 和 S01 至 S08。单元 5 执行 B12、B19、B22、S10 至 S13。单元 6 执行 B04、B10、B13 至 B18、B20、B21。`setup-pstack` 在单元 3 执行 S09。若 B16、B17 等复杂流程尚不能证明，保持未验证，不得用低一级的 smoke test 替代完整用例。

## 13. 实施顺序与交付单元

每个单元独立构建、测试和评审。未完成前一单元的真实验证，不在文档或帮助中宣称后续能力。

### 单元 1：工程骨架和静态资产

恢复 `main` 的包、构建和测试骨架。建立共享 frontmatter、能力表、patch 类型、生成器和检查器。先让纯复制技能通过，随后加入局部 patch。

验收：55 技能、资源、license、链接、bytes、mode 和重复生成检查通过。运行 `node scripts/check-upstream-tree.mjs` 复核上游基线，并以正式 `check-assets` 验证新资产包含 55 个技能且没有未声明的正文差异。

### 单元 2：SkillProvider 和基础技能

实现 bundle、provider、locale/icon 和包资源定位。接入 24 个 principle 和纯文本工作技能，补齐内部路径读取。

验收：真实 profile 中技能目录、显式调用、body、references 可用。

### 单元 3：角色与委派

实现统一角色 manifest、`setup-pstack`、`pstack_subagent`、两个 agent preamble、模型元数据和配置预检、panel 和 depth。迁移旧纯函数测试后按 rc.3 修正。

验收：实际 child 的模型、effort、cwd、preset、完成通知和错误处理符合 §9。

### 单元 4：核心工作流

移植 how/why/architect/arena/swarm/interrogate/no-comments/figure-it-out，以及 playbook `investigation`、`bug-fix`、`perf-issue`、`runtime-forensics`、`trace-forensics`、`feature`、`refactoring`、`prototype`、`authoring-a-skill`、`opening-a-pr`。并行写使用官方 worktree，setup 和 help 只描述已实现能力。

验收：执行 §12.4 的 B01、B02、B03、B05、B06、B07、B08、B09、B11、B23 和 S01 至 S08。`/show-me-your-work` 和 `/eval` 留到单元 5 验收。

### 单元 5：会话历史与相关技能

实现 `pstack_history`，再移植 recall/reflect/automate-me/show-me-your-work/eval/session-pickup/worktree-audit。官方 session search 只能作为 `recall` 的可选加速，不得替代 `reflect`、`show-me-your-work`、`eval` 所需的当前会话及直接子代理完整事件。

验收：当前会话、直接子代理、workspace 权限、原始事件、压缩日志和分页均有运行证据。

### 单元 6：长任务与复杂 playbook

先实现 playbook `autonomous-run` 的 goal 和 `babysit` 的单次模式，再实现 watcher 及 playbook `hillclimb`、`visual-parity`、`shipping`、`autopilot-full`、`autopilot-stack`、`orchestrate`、`pause-safely`、`multi-phase-plan`。保留降级与人工 gate，不把 worktree 当云端运行环境。

验收：goal 完成/暂停/恢复、真实 watcher、独立 verifier、depth 2、恢复边界和脚本协议分别验证。

### 单元 7：发布审查

同步 README、guide、poteto-help、决策记录和排除说明。运行 `pnpm run release`——它先跑只读的 `check`（上游镜像树、`runtime/` 与 `assets/` 的字节比对、资产规则、零安装脚本门、类型检查、单元测试），再重新打包并跑 `check:pack` 校验 tarball 形状；不启动真实 profile，不安装到任何 profile，不操作真实 PR。命令分层见 [构建与校验命令决策](decisions/2026-10-26-build-and-check-commands.md)。

验收：所有公开承诺与实际结果一致，未验证项明确保留在 `docs/release-verification-checklist.md`，不把静态同步或单元测试当作运行通过。§12.3 的实机步骤与 §12.4 的行为级用例改为发布批准后另行执行，见 [发布验收分期](decisions/2026-10-25-release-verification-staging.md)。

## 14. 风险与应对

| 风险 | 具体后果 | 处理 |
|---|---|---|
| 只做词替换 | 句子保留 Cursor 行为，工具根本不存在 | 文件级语义 patch；`check:assets` 断言生成树 `assets/` 里不出现 claude、没有别的宿主的安装命令、角色文件路径只有一种写法，README 与 guide 的禁词只能出现在排除语境；真实调用验收未执行 |
| 局部替换后二次替换 | 新 DSH 文本再次被改写 | 互斥区间、最终输出 golden、`check:assets` 里的字节比对 |
| 角色和 panel 不一致 | 看似多模型，实际同一父模型多次 | 单一 manifest、如实降级、`roleIndex` 越界与 autoPanel 拒绝有单元测试；真实 request header 验证未执行 |
| `disable-model-invocation` 被误解 | 编排器调 `skill` 失败 | 保留 flag，内部按路径读取 |
| 把日志当明文 | 压缩或新版本日志读不出，且可能越权 | `sessionQuery` 逻辑读取、身份和 cwd 授权、分页与 lease 有单元测试 |
| 把 worktree 当 VM | 端口、依赖、外部状态冲突被忽略 | README、guide 02、写入隔离边界的长任务 playbook 与 harness 映射都写明只隔离工作目录与分支；四条 profile 路径未验证 |
| 把 reminder 当 webhook | PR/外部事件没有触发却宣称自动化 | 正文只把 `schedule_create` 写成定时输入，并且不给 child 布置；watcher 未实机验证 |
| 脚本和文本脱节 | 计划检查器接受错误协议或审计脚本读错目录 | 同步 patch 和测试，独立 `check-scripts`；受控副本上通过，生产树不能跑 |
| 生成资产手改 | 下次同步覆盖，实际内容无法复现 | 只改规则和生成器，`--check` 拒绝漂移 |
| 升级只跑同步 | 插件能生成但安装或运行失败 | 提交前跑 `pnpm run release`（只读 `check` + 重打包 + `check:pack`）；真实 profile smoke 未执行 |
| 只跑 `build:bundle` 或只跑 `build:assets` | `dist` 指向 `assets/` 里不存在的路径，安装后才报"脚本找不到" | `build` 一条链写全；`check:pack` 断言 `dist/script.mjs` 携带每个 `assetPath`、`dist/subagent.mjs` 携带每个角色 |
| 与 Agent Team 同启 | Team 遮蔽控制工具、共享激活容量、提示词竞争 | 禁止同 profile 启用，README 保留警告原文；无运行时检测 |
| 隐藏缺失能力 | 质量门槛被静默降低 | 局部 unsupported、保留未验证状态，help 不写幻想功能；未验证项集中在 `docs/release-verification-checklist.md` |

## 15. 已决定事项与保留问题

本设计直接作出以下实施选择，新会话不需要重新询问。

- 源为原始 `pstack`，Claude 目录只作机制参考。
- 首版 55/56，`make-bot-ui` 排除。
- 生成资产提交，禁止手改，使用文件级精确 patch。
- 核心使用 `pstack_subagent`，不引入 Agent Teams，不以 workflow/Ralph 取代普通委派。
- 当前版本禁止与 Agent Team 同 profile 启用。该规则不加运行时检测，最终 README 必须保留警告，见 [决策记录](decisions/2026-10-24-no-agent-team-coexistence.md)。
- README 必须包含简介、DSH 版本、实现原理、worktree 依赖、Agent Team 兼容性、安装、logo 和快速开始。额外技能有则写，无则省略。worktree 作为必要依赖自动启用，已启用时不重复启用。详见 [内容决策](decisions/2026-10-24-readme-content.md) 和 [篇幅决策](decisions/2026-10-24-readme-concision.md)。
- worktree、control、search 优先复用官方能力，pstack 不重复实现通用生命周期。
- `paths` 自动触发降级，不新增复杂的文件事件框架。
- 历史读取以 `sessionQuery` 为后端，新增最小只读授权工具。
- 旧 `main` 只作代码和测试意图参考，目标 API 以 rc.3 reinspection 为准。
- 发布验收分期：静态门（同步检查、资产检查、类型检查、单元测试、打包清单、只读命令核查）与真实 profile 验收分成两步，后者由发布方批准后执行。详见 [发布验收分期](decisions/2026-10-25-release-verification-staging.md)。

仍需实现阶段用证据关闭的问题，不得由猜测填入。

- **仍开放。** 各发布 preset 的实际工具集合和最低支持组合。单元 7 只做了只读核对，没有在真实 profile 里读工具面。
- **已决定。** 模型配置是否要与 native allowedModels 统一：首版保持独立并明示，不读取私有 policy。若要统一，另写记录。
- **已关闭。** `pstack_history` 的分页大小、lease 生命周期和持久化不可用的降级表现。现行为是默认 50、上限 200（超限拒绝而不截断）、lease 在 `finally` 里释放、持久化不可用返回分层 `unavailable`；证据是 `tests/history.test.ts` 与 [受限历史决策](decisions/2026-10-25-restricted-history.md)。冷读的逐事件来源按 rc.3 契约不可判定，如实报告为审计未完成，不再作为待解问题。
- **仍开放。** Bun/Node、shell、profiler、图像比较等环境依赖的跨平台支持矩阵。目前只记录过 Bun 1.4.0 与 Node 24.22.1 上的脚本测试，Windows、profiler 与图像比较都没有矩阵。
- **仍开放。** 复杂 playbook 的分阶段验收结果，尤其 watcher、Orchestrate、自动合并和进程重启后的真实状态。B04、B10、B13 至 B18、B20、B21 全部未执行。

## 16. 主要证据索引

- 上游生成器：`upstream/cursor-plugins/scripts/generate-pstack-harness-trees.mjs:28-51,67-104,118-187`。
- Claude 适配：`upstream/cursor-plugins/pstack/docs/harness/claude-code.md:3-67`。
- 上游 CI：`upstream/cursor-plugins/.github/workflows/validate-plugins.yml:31-32`。
- 技能清单：`upstream/cursor-plugins/pstack/skills/`。
- 关键脚本：`upstream/cursor-plugins/pstack/skills/poteto-mode/scripts/worktree-audit.sh:64-66,103-110`，`check-plan.mjs:19-20`。
- 旧实现：`main:scripts/adapt.ts`、`main:scripts/sync-upstream.ts`、`main:src/provider.ts`、`main:src/subagent.ts`、`main:docs/porting/`。
- DSH SkillProvider：`dsh-skill/lib/types/index.d.ts:24-84,165-197,225-297`。
- DSH 技能调用：`dsh-tool-skill/README.md:52-61,87-90`。
- DSH 文件技能：`dsh-skill-filesystem/README.md:34-56,79-85,147-151`。
- DSH 子代理：`dsh-subagent/README.md:28-73,163-175,197-213`。
- DSH 官方模型发现：`dsh-tool-subagent/lib/index.js:144-196,373-481`。
- DSH 历史：`dsh-session-query/lib/types/index.d.ts:35-153`，`dsh-session-query/lib/index.js:34-54,128-157,302-307,477-507,1081-1088`，`dsh-session/lib/index.js:750-793,1378-1429`，`dsh-session-persistence-jsonl/README.md:45-87,164-167`。
- DSH 授权历史工具：`dsh-tool-session-query/README.md:28-57`。
- DSH worktree：Inspect `Service.worktrees` 与 `dsh-experimental-worktree` 当前实现。

证据索引中的 DSH 包位于当前 DSH checkout 的 `node_modules/@deepseek-ai/`。实施时使用 `cordis_inspect_list` 和精确的 `cordis_inspect_query` 再确认，不把 Inspect 方法当业务 Service 调用。
