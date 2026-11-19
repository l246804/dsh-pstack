# pstack in DeepSeek Harness

pstack 技能使用 Cursor 名称。在 DeepSeek Harness 中，每会话读取一次本文件，然后用下面的表格映射技能里的每个 Cursor 名称。`<pstack>` 指已安装的 `dsh-pstack` 包中存放 `skills/` 和 `docs/` 的目录。

只使用当前会话实际可见的工具。映射的工具或可选能力不可用时，按该行的 fallback 处理。不要因为文件提到某个名称就假设可选插件已启用。

## Tools

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `pstack_subagent` 一次调用只启动一个子代理；需要在同一消息里并行多个子代理时，按子代理数多次调用它，并传 `description` 和 `prompt`。覆盖路由时，`provider` 与 `model` 必须成对传入，不能只给其中一个，可再加可选 `reasoning_effort`。全部省略则继承父路由。`pstack_models` 把每个 model id 列在对应 provider 标题下：把标题里的 provider id 传给 `provider`、把列出的 id 传给 `model`，不要传组合后的 `provider/model` 路由。 |
| `AskQuestion` | `ask_user_question` 接收一批带选项和自由输入的问题。只有活跃的根智能体有人工回答者；被委派的子智能体把问题保留在结果里。工具不可用时用纯文本提问。 |
| Open a todolist | `todo_write` 替换整个列表，没有 `skipped` 状态。跳过的步骤保持可见，在 `content` 中写 `skip: <reason> - <step>`，状态设为 `completed`。 |
| Run another pstack skill (`/name` 或 "the **name** skill") | 会话技能目录里的技能用原生 `skill` 工具。带 `disable-model-invocation: true` 的随包 pstack 技能对 `skill` 隐藏，所以用 `read` 读取 `<pstack>/skills/<name>/SKILL.md` 并遵循，包括技能目录下的 playbook 和 reference。用户 `/name` 手势会直接注入一个技能；内置帮助技能是 `poteto-help`。 |
| `Grep`, `Glob` | `grep` 和 `glob` 是原生工具，直接调用。只有会话两者都没有时才用 `bash` 的 `rg`。 |

## Subagent fields

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | `agent_preset: "general"`（默认值）加入父 preset 并继承其工具。 |
| `poteto-agent`, `comment-sicko` | `agent_preset: "poteto-agent"` 或 `agent_preset: "comment-sicko"`。它们是 agent preset，不是 `subagent_type` 值。 |
| `readonly: true` | `agent_preset: "readonly"` 给子智能体只读沙箱。需要写入时用 `general`。 |
| `readonly: false` | `agent_preset: "general"`。 |
| `environment: "cloud"` | 没有云代理。可用时用 `create_worktree`，把 checkout 作为 `cwd`；否则按规则跳过。 |
| `environment: "local"` | 省略 `cwd`；子智能体继承会话目录。 |
| `cloud_base_branch: <b>` | 作为 `create_worktree.from` 传入；否则让子智能体先 checkout `<b>`。 |
| `run_in_background: true` | 省略。`pstack_subagent` 由托管执行并通过完成通知返回。 |
| `resume` | 用原生 `send_message`，按 `list_agents` 报告的名称或它的会话 id 续聊 pstack 子代理。只有永久停止时才新建 `pstack_subagent`。 |
| `file_attachments` | 在 `prompt` 中列出真实路径，子智能体用 `read` 读取。 |

## Models

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]` | 不要传 Cursor slug。用 `pstack_roles` 读角色的 `provider`、`model`、`reasoningEffort` 和可用 `efforts`，改档位时从 `efforts` 里选，并以 `provider`、`model`、`reasoning_effort` 传给 `pstack_subagent`；`pstack_models` 只用于 setup 或校验路由。去掉 `-fast`；DSH 没有速度参数。 |
| A `grok-*`、`gpt-*` 或其他非 Claude slug | 选最接近的已公布路由，或省略 `provider` 和 `model` 让子智能体继承父路由，并说明这一点。 |
| `auto` 或 `inherit-parent` | 省略 `provider` 和 `model`；子智能体继承父路由。 |
| pstack 角色文件 | `$DSH_HOME/pstack-models.json`。用 `pstack_roles` 把角色映射到路由；`pstack_subagent` 不解析它。文件缺失时没有已配置路由，子智能体继承父路由。 |
| 形如 `<model> <effort>` 的角色值 | 写结构化路由对象 `{ kind: "route", provider, model, effort? }`；一个角色保存这些对象的数组，或用 `{ kind: "inherit", alias }` 表示 `auto` 或 `inherit-parent`。`provider`、`model`、`effort` 从 `pstack_models` 或 `pstack_roles` 读取，不要把 `provider/model` 拼成字符串或再拆开。 |

传 `provider` 和 `model` 覆盖子代理路由时，如果目标模型不支持父级当前 effort，同时传 `reasoning_effort`。省略它会继承父级 effort，并可能在子代理启动前失败。

## setup-pstack

`setup-pstack` 写调用方用来选择路由的角色文件。先用 `pstack_models` 发现本部署提供的 provider、model 和 effort 路由，不要根据 Cursor slug 猜测。

- Detect：把每条真实路由写成结构化对象 `{ provider, model, effort? }`。检测不到时请用户粘贴路由。
- Defaults：映射找到的路由；不可用路由用 `inherit-parent` 或 `auto`。把选定预算映射到最接近的可用 effort，并说明选择。
- Write：写 `version: 2`，`roles` 对象值为路由对象数组，另加可选 `budget`。覆盖整个文件，保证重跑幂等；缺失角色继承父路由。

## Paths

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | 项目技能位于 `.dsh/skills/` 或 `.agents/skills/`；用户技能位于 `$DSH_HOME/skills/` 或 `~/.agents/skills/`。随包 pstack 技能位于 `<pstack>/skills/`，通过读取它的 `SKILL.md` 加载。 |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | 在 `SKILL.md` 旁解析包资源；插件 manifest 是 `package.json` 的 `dsh` 段。 |
| `.cursor/rules/*.mdc`, always-applied rules | `AGENTS.md` 兼容链。DSH 不读取 `.mdc`；pstack 角色文件由调用方读取，`pstack_subagent` 不解析它。 |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | 包内存在该文件时使用 `<pstack>/<path>`。读取本地副本，需要链接时给用户公开 URL。 |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-key>/<session>.jsonl`。可选 session search 增加面向模型的搜索工具。 |

## Cursor-only features

DeepSeek Harness 没有 Cursor Automations、Bugbot、Cursor cloud agents 或内置 PR 工具。步骤需要它们时，在回复中写一行 `Skipped in DeepSeek Harness: <step>. <reason>.`，然后继续。跳过的步骤不算通过。

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations, routines, webhooks, `SendToUser` secrets | 按行跳过。步骤适合时改用本地调度或后台工作。 |
| Bugbot | 把 PR 评论当普通 review thread，使用步骤给出的 `gh` 命令；没有检查或评论时跳过启动或等待 Bugbot。 |
| Cursor cloud agents | 把 `environment: "cloud"` 映射到本地工作树；需要云机器的步骤跳过。 |
| A built-in PR tool | 用 `bash` 里的步骤 `gh` 命令；这不是跳过，不写跳过行。 |
| Cursor Projects | 按行跳过；没有持久云 Project 协调器。 |

## Plugin tools

本包在原生 DSH 工具之外注册自己的面向模型的工具。

| Tool | Purpose |
| --- | --- |
| `pstack_subagent` | 启动一个子智能体。必填 `description` 和 `prompt`；可选 `agent_preset`（默认 `general`）、`name`、`cwd`、`maxDepth`，以及用 `provider`、`model`、`reasoning_effort` 覆盖路由。返回 `{kind:"activation", name}`。完成时发通知。子智能体不是后台 job：不要把它的名称传给 `job_output`；等完成通知，或用原生 `list_agents`/`send_message`。 |
| `pstack_interrupt` | 按 `list_agents` 的名称或会话 id 中断一个 pstack 子代理当前回合。内置 preset 禁用了原生 `interrupt_agent`，所以这是 pstack 子代理的中断通道。 |
| `pstack_models` | 列出本部署声明的 provider、model 和 reasoning-effort 路由。是否可用以实际调用为准；列出的路由仍可能失败或被当前 Session 禁用。 |
| `pstack_roles` | 报告每个 pstack 角色及其已配置路由，路由以 provider、model、reasoningEffort 给出，并附该路由的可用 efforts 和默认档位。传给 `pstack_subagent` 时用 `provider`、`model`、`reasoning_effort`。 |

## 智能体团队协作

会话启用智能体团队协作时，`pstack_subagent` 启动的是 teammate。先用 `team_task_create` 创建共享任务，再用 `name` 启动子代理，最后用 `team_task_update` 的 `reassign` 动作把任务分配给返回的子代理名。把任务 id 写进子代理 prompt，让子代理自己领取并完成任务。`pstack_roles` 报告的角色条目是模型路由，不是团队协作成员。

Team 任务板用于需要负责人、依赖关系、写入范围或交接给其他成员的持久工作。私有或一次性的探索、快速查询、工具配置，以及 Lead 自己一轮就能完成的检查，不要创建 Team task；这些仍然使用普通的 `pstack_subagent` 委派，不登记任务。

每次为 Team task 调用 `pstack_subagent` 后，立即用 `team_task_update` 绑定任务负责人。一轮任务派发完成后，先运行 `team_task_list`，发现 pending 且没有 owner 的任务就重新分配或删除，再进入等待。每次 `team_task_update` 前重新读取任务，确保 revision 是最新的。只有任务 owner 才能完成自己的任务；Lead 要代为收尾时，先把任务 reassign 给 Lead，再完成，不要直接完成子代理仍在进行中的任务。

## Local replacements

| Cursor | DeepSeek Harness |
| --- | --- |
| `create-skill` | 用 vendored `writing-for-agents` 技能创建或评审技能，再直接写并校验 `SKILL.md`。 |
| `/deslop` | 用 vendored `deslop` 技能处理代码噪声；`unslop` 只处理 prose。 |
| `/loop` | 自动继续用 `create_goal`，定时心跳用 `schedule_create`，可观察事件用后台 `bash` watcher。 |
| `/automate` | 用 `writing-for-agents` 把已验证的工作模式写成个人技能；历史搜索不可用时用可用的会话证据。 |
| `control-ui`, `control-cli`, `cursor-team-kit` | 使用 vendored 指令技能；浏览器或 PTY 依赖写在其 `SKILL.md`。 |
