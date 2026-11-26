# DeepSeek Harness 中的 pstack

pstack 技能使用 Cursor 名称。在 DeepSeek Harness 中，用下面的表格映射技能中的每个 Cursor 名称。`<pstack>` 指包含 `skills/` 和 `docs/` 的文件夹。

只使用当前会话里实际可见的工具，即使某个名称出现在本文件里。映射到的工具或可选能力不可用时，按对应行的回退处理。步骤需要 Cursor-only 能力时，写一行 `Skipped in DeepSeek Harness: <step>. <reason>.`，然后继续。后续步骤需要被跳过步骤的产物时，留占位符并在这行里点名。

## 工具

| Cursor | DeepSeek Harness |
| --- | --- |
| `Task` | `subagent` 启动一个全新子代理并立即返回它的名称；`subagent_fork` 改为让子代理继承当前对话。把任务写进 `prompt`，把标签写进 `description`；子代理在调用方的工作目录启动，没有原生参数的 Cursor 字段见“子代理字段”。 |
| `AskQuestion` | `ask_user_question` 向用户提问；子代理把问题留在结果里，由父代理询问。工具不存在时用纯文本提问。 |
| Open a todolist | `todo_write` 替换整个列表，且没有 `skipped` 状态。把跳过的步骤保留为 `skip: <reason> - <step>` 并把状态标为 `completed`。 |
| Run another pstack skill (`/name` or "the **name** skill") | `skill` 按精确名称加载目录中的技能。带 `disable-model-invocation: true` 的技能对 `skill` 隐藏，所以用 `read` 读取 `<pstack>/skills/<name>/SKILL.md`；用户 `/name` 手势会直接注入技能，不要再调用 `skill`。 |
| `Grep`, `Glob` | `grep` 和 `glob` 是原生工具，直接调用，`grep` 使用 ripgrep 语法。只有会话两者都没有时，才用 `bash` 运行 `rg`。 |

## 子代理字段

| Cursor | DeepSeek Harness |
| --- | --- |
| `subagent_type: generalPurpose` | 没有这个字段；省略它。子代理就是普通的 `subagent`，任务写进 `prompt`。 |
| `poteto-agent`, `comment-sicko` | 没有原生预设。读取 `<pstack>/agents/<name>.md` 并作为 `prompt` 传入，或自己写出角色说明。 |
| `readonly: true` | 没有沙箱参数。在 `prompt` 写“不要编辑文件”，依赖会话权限模式，并在事后检查 `git status`。 |
| `readonly: false` | 省略；在会话权限模式下子代理可写。 |
| `environment: "cloud"` | 没有云代理。有 `enter_worktree` 这类工作树工具时，进入工作树并在其中工作；否则写跳过行。 |
| `environment: "local"` | 没有这个参数；子代理在调用方的工作目录启动。 |
| `cloud_base_branch: <b>` | 没有这个字段。把 `<b>` 作为 `enter_worktree.from` 传入；否则告诉子代理先 checkout `<b>`。 |
| `run_in_background: true` | 省略。`subagent` 立即返回它的名称并在完成时通知；没有后台开关。 |
| `resume` | `send_message` 按 `agent` 继续子代理，值取 `list_agents` 里的名称或它的会话 id；运行中的子代理在下一步收到消息，空闲的会恢复。`interrupt_agent` 也用同一个 `agent`，但内置 preset 禁用了它，这种情况下视为无法中断。只有它永久停止时才新建 `subagent`。 |
| `file_attachments` | 没有这个字段。把真实路径列在 `prompt` 里；子代理用 `read` 读取它们。 |

## 模型

| Cursor | DeepSeek Harness |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, such as `claude-opus-5-5-xhigh` | 拆成 `provider`、`model` 和 `reasoning_effort`，并去掉 `-fast`；只有委派工具启用模型选择时才有这些参数。工具提供 `list_subagent_models` 时用发现到的 id；不提供时省略它们，子代理继承父级路由。 |
| A `grok-*`, `gpt-*`, or other non-Claude slug | 选最接近的已公布路由。没有匹配时省略 `provider` 和 `model`，让子代理继承父级路由，并说明这一点。 |
| `auto` or `inherit-parent` | 省略 `provider`、`model` 和 `reasoning_effort`；子代理继承父级路由。 |
| The `pstack-models.mdc` rule, `~/.cursor/rules/pstack-models.mdc` | 基础 DeepSeek Harness 没有 `.mdc` rules 目录，也从不加载它。pstack 角色文件是 `$DSH_HOME/pstack/models.json`；基础 DeepSeek Harness 不读它，所以它存在时在委派前自行读取。 |
| A role value `<model> <effort>`, such as `opus high` | 使用 setup-pstack 段描述的结构化 route 对象；不要把 `provider/model` 拼成字符串或再拆开。 |

## setup-pstack

`setup-pstack` 写调用方用来选择路由的角色文件。先用 `list_subagent_models` 发现当前可用的 `provider`、`model` 和 `effort` 路由，不要根据 Cursor slug 猜测。

- Detect：把 `list_subagent_models` 找到的每条真实路由写成结构化对象 `{ kind: "route", provider, model, effort? }`；都检测不到时请用户粘贴路由，绝不写入未确认的路由。
- Defaults：映射找到的路由；不可用路由用 `{ kind: "inherit", alias: "inherit-parent" }`（或 alias `"auto"`）。把选定预算映射到最接近的可用 effort，并说明选择。
- Write：写 `$DSH_HOME/pstack/models.json`，包含 `version: 2`、可选的 `budget` 和由 route 对象数组组成的 `roles`。覆盖整个文件，保证重跑幂等；缺失角色继承父路由。

完成标准：文件能按 version 2 解析，每个角色都使用 route 或 inherit 对象，重跑产生相同文件。

## 路径

| Cursor | DeepSeek Harness |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | 项目技能放在 `.dsh/skills/` 或 `.agents/skills/`；用户技能放在 `$DSH_HOME/skills/` 或 `$DSH_AGENTS_HOME/skills/`。 |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | profile 是 `$DSH_HOME/profiles/<name>/`，包含 `cordis.patch.yml`；插件 manifest 是 `package.json` 的 `dsh` 段。 |
| `.cursor/rules/*.mdc`, always-applied rules | 通用规则使用 `AGENTS.md` 链；DeepSeek Harness 从不读取 `.mdc`。项目 `AGENTS.md`/`AGENTS.local.md`（接受 `CLAUDE.md`）加 `$DSH_HOME/AGENTS.md`。 |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | 文件存在时用 `<pstack>/<path>`。读本地副本，不要抓取；需要时把 URL 给用户。 |
| Transcripts in `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-key>/<session-id>/`，每个会话一个日志。可选 session search 增加模型可见的搜索工具。 |

## Cursor-only features

表格列出每个 Cursor-only 能力及其处理方式。跳过的步骤不算通过。不要停止、提问或重试。

| Cursor | DeepSeek Harness |
| --- | --- |
| Cursor Automations: routines, `update_state` routine calls, `api2.cursor.sh/automations` webhooks, routine wakes, and `SendToUser` secret requests | 用跳过行。 |
| Bugbot | 把 PR 评论当作普通 review thread，使用步骤给的 `gh` 命令；没有 check 或评论时跳过启动或等待 Bugbot。 |
| Cursor cloud agents | 把 `environment: "cloud"` 映射到本地 worktree；跳过需要云机器本身的步骤。 |
| A built-in PR tool | 通过 `bash` 使用步骤给的 `gh` 命令；这不是跳过，不要写跳过行。 |
