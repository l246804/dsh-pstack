# DSH 适配判定依据

本文件只记录 `dsh.md` 每个替换项背后的 DSH 事实和可复查位置。不记录 port 实现、插件建议、角色设计或任何推测结论。

## Tools

| dsh.md 行 | DSH 证据 |
| --- | --- |
| `Task` | `@deepseek-ai/dsh-tool-subagent` 的 `subagent`（`0.2.2-rc.2` 工具目录，源 `packages/subagent/tool-subagent/src/index.ts`）：参数 `cwd`/`description`/`name`/`prompt`，立即返回子代理名称；`subagent_fork` 由 `toolName` 另注册；`@deepseek-ai/dsh-tool-subagent-control` 的 `send_message`/`interrupt_agent`/`list_agents`/`wait_agent` |
| `AskQuestion` | `@deepseek-ai/dsh-tool-ask-user` 的 `lib/index.js`：`questions`（`id`/`question`/`header`/`options`/`multi_select`）与答案的 `selected`/`custom`、timed 模式的 `pending`；README 说明 `DELEGATED_CALLER` 拒绝 live child |
| Open a todolist | `@deepseek-ai/dsh-tool-todo` 的 `lib/index.js`：`name: "todo_write"`，整表替换，状态仅 `pending`/`in_progress`/`completed`，无 `skipped` |
| Run another pstack skill | `@deepseek-ai/dsh-tool-skill` 的 `skill` 工具；`@deepseek-ai/dsh-skill-filesystem` 的 `disable-model-invocation`/`modelInvocable`/`userInvocable` 解析，以及 `/name` 用户手势直接注入技能 |
| `Grep`, `Glob` | `@deepseek-ai/dsh-tool-fs-search` 的 `lib/index.js`：注册 `glob` 与 `grep`，`grep` 用 ripgrep 正则 |

## Subagent 字段

| dsh.md 行 | DSH 证据 |
| --- | --- |
| `subagent_type: generalPurpose` | `@deepseek-ai/dsh-tool-subagent` 的参数表没有 `subagent_type`；子代理类型由所挂 provider 决定 |
| `poteto-agent`, `comment-sicko` | `@deepseek-ai/dsh-tool-subagent` 的 `Config` 只有 `agentPreset`/`allowedAgentPresets`（需 `agentPresets` 服务），没有这两个原生预设名 |
| `readonly: true` | `@deepseek-ai/dsh-tool-subagent` 无 sandbox 参数；写入限制由 `@deepseek-ai/dsh-sandbox-policy` 与 `@deepseek-ai/dsh-permission-presets` 决定 |
| `readonly: false` | 同上；无 writable 字段，默认受会话权限模式约束 |
| `environment: "cloud"` | `@deepseek-ai/dsh-tool-subagent` 无 cloud 环境字段；`@deepseek-ai/dsh-experimental-tool-worktree` 的 `lib/index.js` 注册 `create_worktree` 提供本地检出 |
| `environment: "local"` | `@deepseek-ai/dsh-tool-subagent` 的 `cwd` 省略即继承调用目录 |
| `cloud_base_branch: <b>` | `@deepseek-ai/dsh-tool-subagent` 无该字段；`@deepseek-ai/dsh-experimental-tool-worktree` 的 `create_worktree` 用 `from` 指定本地基线 |
| `run_in_background: true` | `@deepseek-ai/dsh-tool-subagent` 无后台字段；工具立即返回子代理名称，由运行时在完成时通知 |
| `resume` | `@deepseek-ai/dsh-tool-subagent-control` 的 `send_message`/`interrupt_agent` 参数都是 `agent`，取名称或会话 id；`0.2.2-rc.2` 内置 preset 把 `tool-subagent-control` 的 `config.interrupt` 设为 `false`，模型拿不到 `interrupt_agent`，服务层 `interrupt` API 仍在 |
| `file_attachments` | `@deepseek-ai/dsh-tool-subagent` 无附件字段；路径只能列在 `prompt`，由子代理用 `read` 读取 |

## Models

| dsh.md 行 | DSH 证据 |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]` | `@deepseek-ai/dsh-tool-subagent` 的 `Config.modelSelection`/`modelDiscovery` 与参数 `provider`/`model`/`reasoning_effort`；`list_subagent_models` 仅在 `modelDiscovery: true` 时注册；`dsh-base/cordis.patch.yml` 的 `tool-subagent` 未启用这两项 |
| `grok-*`、`gpt-*` 等非 Claude slug | 同上；DSH 只接受实际公布的 provider/model/effort 路由，否则省略并继承 |
| `auto` / `inherit-parent` | 同上；省略 `provider`/`model`/`reasoning_effort` 时使用父级路由 |
| `pstack-models.mdc` / `~/.cursor/rules/pstack-models.mdc` | `@deepseek-ai/dsh-agent-instructions` 只读 AGENTS 链；`@deepseek-ai/dsh-base` 无 `.mdc` rules 目录，也不读取 `$DSH_HOME/pstack-models.json` |
| 角色值 `<model> <effort>` | `@deepseek-ai/dsh-tool-subagent` 的 `provider`、`model`、`reasoning_effort` 三个独立参数 |

## setup-pstack

| dsh.md 行 | DSH 证据 |
| --- | --- |
| DSH 无 rules 目录、角色文件位置 | `@deepseek-ai/dsh-agent-instructions` 的 AGENTS 链；`@deepseek-ai/dsh-home-paths` 的 `resolveDshHome`（`$DSH_HOME` 默认 `~/.dsh`）；base 无读取 `$DSH_HOME/pstack-models.json` 的路径 |
| Detect / Defaults 用的模型发现 | `@deepseek-ai/dsh-tool-subagent` 的 `list_subagent_models` 注册与 `modelDiscovery` 配置 |
| profile 与补丁文件 | `@deepseek-ai/dsh-app-boot` 的 `PROFILES_DIR`（`profiles`）与 `PROFILE_PATCH_FILENAME`（`cordis.patch.yml`） |

## Paths

| dsh.md 行 | DSH 证据 |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `@deepseek-ai/dsh-skill-filesystem` 的 `lib/index.js` 扫描 `.dsh/skills`、`.agents/skills`；`@deepseek-ai/dsh-home-paths` 的 `DSH_HOME`/`DSH_AGENTS_HOME`（默认 `~/.agents`） |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | `@deepseek-ai/dsh-app-boot` 的 `PROFILES_DIR`/`PROFILE_PATCH_FILENAME`；`@deepseek-ai/dsh-package-manifest` 的 `dsh` manifest 段 |
| `.cursor/rules/*.mdc`, always-applied rules | `@deepseek-ai/dsh-agent-instructions` 的 `AGENTS.md`/`AGENTS.local.md`/`CLAUDE.md`/`CLAUDE.local.md` 链与 `$DSH_HOME/AGENTS.md` |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | 生成器的本地复制目标；不涉及运行时下载 |
| `~/.cursor/projects/<slug>/agent-transcripts/` | `@deepseek-ai/dsh-session-persistence-jsonl` 的 `sessions`/`projectKey`/`encodeSegment`/`.jsonl`；可选 `@deepseek-ai/dsh-experimental-session-search` 经 `@deepseek-ai/dsh-tool-session-query` 提供 `session_search` 等工具 |

## Cursor-only features

| dsh.md 行 | DSH 证据 |
| --- | --- |
| Cursor Automations: routines, `update_state`, webhooks, routine wakes, `SendToUser` secrets | `@deepseek-ai/dsh-official-bundles` 与 `@deepseek-ai/dsh-base` 没有对应运行时；`@deepseek-ai/dsh-tool-schedule` 的 `schedule_create` 只是本地定时，不接收 Cursor webhook |
| Bugbot | 没有 Bugbot 服务；GitHub PR 只是普通 review thread，可用宿主 `gh` 操作 |
| Cursor cloud agents | `@deepseek-ai/dsh-tool-subagent` 无云代理；可选 `@deepseek-ai/dsh-experimental-tool-worktree` 提供本地 worktree |
| 内置 PR 工具 | 没有内置 PR 工具；由宿主 `gh` 通过 `bash` 执行，可选择性启用 `@deepseek-ai/dsh-experimental-forge-bundle` |
