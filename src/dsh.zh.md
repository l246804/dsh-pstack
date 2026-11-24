# pstack in DeepSeek Harness

pstack 技能使用 Cursor 名称。在 DeepSeek Harness 中，每会话读取一次本文件，然后用下面的表格映射技能里的每个 Cursor 名称。`<pstack>` 指已安装的 `dsh-pstack` 包中存放 `skills/` 和 `docs/` 的目录。

只使用当前会话实际可见的工具。映射的工具或可选能力不可用时，按该行的 fallback 处理。不要因为文件提到某个名称就假设可选插件已启用。

## Plugin tools

本包注册自己的面向模型的工具；下面 Tools 块把 Cursor 操作映射到这些工具。

| Tool | Purpose |
| --- | --- |
| `pstack_subagent` | 一次调用启动一个子代理，完成时通过通知返回。它不是后台 job；不要用 `job_output` 等它。 |
| `pstack_interrupt` | 按 `list_agents` 的名称或 Session id 中断一个 pstack 子代理的当前回合。内置 preset 禁用了原生 `interrupt_agent`，所以这是中断入口。 |
| `pstack_models` | 列出本部署实际提供的 `provider`、`model` 和 `reasoning_effort` 路由。只在 setup 期间用来发现可配置的路由。它不读取角色文件，任何角色到模型的查询都用 `pstack_roles`。列出的路由在调用时仍可能失败。 |
| `pstack_roles` | 报告每个角色的已配置路由、可用 `efforts` 和默认档位。任何角色到模型的查询都用它，给 `pstack_subagent` 选模型时使用这些路由值。 |

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent` 一次调用启动一个子代理；在同一消息里按子代理数多次调用，传 `description` 和 `prompt`。角色路由先从 `pstack_roles` 读取：把它的 `provider` 传给 `provider`，`model` 传给 `model`，可选传 `reasoning_effort`；全部省略则继承父路由。 |
| `AskQuestion` | `ask_user_question` 接收一批带选项和自由输入的问题。只有活跃的根代理有人工回答者；被委派的子代理把问题留在结果里。工具不可用时用纯文本提问。 |
| Open a todolist | `todo_write` 替换整个列表，没有 `skipped` 状态。跳过的步骤保持可见，在 `content` 中写 `skip: <reason> - <step>`，状态设为 `completed`。 |
| Run another pstack skill (`/name` 或 "the **name** skill") | 会话技能目录里的技能用原生 `skill`。带 `disable-model-invocation: true` 的随包技能对 `skill` 隐藏，所以读取 `<pstack>/skills/<name>/SKILL.md` 并遵循。用户 `/name` 手势直接注入；内置帮助技能是 `poteto-help`。 |
| `Grep`, `Glob` | `grep` 和 `glob` 是原生工具；只有两者都不存在时才用 `bash` 的 `rg`。 |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent_preset: "general"`（默认值）加入父 preset 并继承其工具。 |
| `poteto-agent`, `comment-sicko` | `agent_preset: "poteto-agent"` 或 `agent_preset: "comment-sicko"`。它们是 agent preset，不是 `subagent_type` 值。 |
| `readonly: true` | `agent_preset: "readonly"` 给子代理只读沙箱。需要写入时用 `general`。 |
| `readonly: false` | `agent_preset: "general"`。 |
| `environment: "cloud"` | 没有云代理。可用时用 `create_worktree`，把 checkout 作为 `cwd`；否则按规则跳过。 |
| `environment: "local"` | 省略 `cwd`；子代理继承会话目录。 |
| `cloud_base_branch: <b>` | 把 `<b>` 作为 `create_worktree.from` 传入；否则让子代理先 checkout `<b>`。 |
| `run_in_background: true` | 省略。`pstack_subagent` 由托管执行并通过完成通知返回。 |
| `resume` | 用原生 `send_message`，按 `list_agents` 报告的名称或 Session id 续聊 pstack 子代理。只有永久停止时才新建 `pstack_subagent`。 |
| `file_attachments` | 在 `prompt` 中列出真实路径，子代理用 `read` 读取。 |

## Agent Teams

会话启用 Agent Teams 时，每个 `pstack_subagent` child 都是 teammate，共享任务板是可选的。

共享或耐久工作时用板：多个 child 汇入同一交付物、步骤有顺序、另一个成员接手，或 Lead 在 child 返回后还要追踪任务。单个 child 且 Lead 只消费一次结果时不建任务。

用板时，先创建任务，再用 `name` 启动 child，把任务 reassign 给这个名称，并把任务 id 写进 child prompt。每次更新前重读任务。只有 owner 完成任务。Lead 代为收尾前先把任务 reassign 给 Lead。`pstack_roles` 报告的是模型路由，不是 Team 成员。

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]` | 用 `pstack_roles` 读取角色的 `provider`、`model`、`reasoningEffort` 和可用 `efforts`，再把它们传给 `pstack_subagent`。去掉 `-fast`；DSH 没有速度参数。 |
| `grok-*`、`gpt-*` 或其他非 Claude slug | 选最接近的已公布路由，或省略路由让子代理继承父路由；说明选择了哪种。 |
| `auto` 或 `inherit-parent` | 省略路由；子代理继承父路由。 |
| pstack 角色文件 | `$DSH_HOME/pstack/models.json`。通过 `pstack_roles` 读取；`pstack_subagent` 不解析它。文件缺失时沿用父路由。 |
| 形如 `<model> <effort>` 的角色值 | 使用 setup-pstack 段描述的结构化 route 对象；不要把 `provider/model` 拼成字符串或再拆开。 |

覆盖子代理路由时，如果目标模型不支持父级当前 effort，同时传入 `reasoning_effort`。省略会继承父级 effort，并可能在子代理启动前失败。

## setup-pstack

`setup-pstack` 写调用方用来选择路由的角色文件。先用 `pstack_models` 发现当前可用的 `provider`、`model` 和 `effort` 路由，不要根据 Cursor slug 猜测。DSH 不读该角色文件；它存在时通过 `pstack_roles` 读取。

- Detect：把 `pstack_models` 找到的每条真实路由写成结构化对象 `{ kind: "route", provider, model, effort? }`；都检测不到时请用户粘贴路由。
- Defaults：映射找到的路由；不可用路由用 `inherit-parent` 或 `auto`。把选定预算映射到最接近的可用 effort，并说明选择。
- Write：写 `$DSH_HOME/pstack/models.json`，包含 `version: 2`、可选的 `budget` 和由 route 对象数组组成的 `roles`。覆盖整个文件，保证重跑幂等；缺失角色继承父路由。

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | 项目技能位于 `.dsh/skills/` 或 `.agents/skills/`；用户技能位于 `$DSH_HOME/skills/` 或 `~/.agents/skills/`。随包 pstack 技能位于 `<pstack>/skills/`，通过读取 `SKILL.md` 加载。 |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | 在 `SKILL.md` 旁解析包资源；插件 manifest 是 `package.json` 的 `dsh` 段。 |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` 兼容链。DSH 不读取 `.mdc`；pstack 角色文件由调用方读取，`pstack_subagent` 不解析它。 |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | 包内存在该文件时使用 `<pstack>/<path>`。读取本地副本，需要链接时给用户公开 URL。 |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-key>/<session>.jsonl`。可选 session search 增加面向模型的搜索工具。 |

## Local replacements

| Cursor | DeepSeek Harness |
| --- | --- |
| `create-skill` | 用 vendored `writing-for-agents` 技能创建或评审技能，再直接写并校验 `SKILL.md`。 |
| `/deslop` | 用 vendored `deslop` 技能处理代码噪声；`unslop` 只处理 prose。 |
| `/loop` | 自动继续用 `create_goal`，定时心跳用 `schedule_create`，可观察事件用后台 `bash` watcher。 |
| `/automate` | 用 `writing-for-agents` 把已验证的工作模式写成个人技能；历史搜索不可用时用可用的会话证据。 |
| `control-ui`, `control-cli`, `cursor-team-kit` | 使用 vendored 指令技能；浏览器或 PTY 依赖写在其 `SKILL.md`。 |

## Cursor-only features

DeepSeek Harness 没有 Cursor Automations、Bugbot、Cursor cloud agents 或内置 PR 工具。步骤需要它们时，在回复中写一行 `Skipped in DeepSeek Harness: <step>. <reason>.`，然后继续。跳过的步骤不算通过。

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations, routines, webhooks, `SendToUser` secrets | 按行跳过。步骤适合时改用本地调度或后台工作。 |
| Bugbot | 把 PR 评论当普通 review thread，使用步骤给出的 `gh` 命令；没有检查或评论时跳过启动或等待 Bugbot。 |
| Cursor cloud agents | 把 `environment: "cloud"` 映射到本地工作树；需要云机器的步骤跳过。 |
| A built-in PR tool | 用 `bash` 里的步骤 `gh` 命令；这不是跳过，不写跳过行。 |
| Cursor Projects | 按行跳过；没有持久云 Project 协调器。 |
